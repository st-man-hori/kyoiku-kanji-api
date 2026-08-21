// OpenAPIHono は普通の Hono に「ルート定義からOpenAPI仕様書を自動生成する」機能を足したもの。
// createRoute でルートの入力/出力の形（Zodスキーマ）を定義し、app.openapi() でハンドラと紐付ける。
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import { toKanjiResponse, type KanjiRow } from "./kanji";
import {
  KanjiSchema,
  KanjiListSchema,
  GradesSchema,
  ErrorSchema,
} from "./schema";

// <{ Bindings: CloudflareBindings }> は、このアプリの中で `c.env.DB` や `c.env.RATE_LIMITER` が
// 使えることをTypeScriptに教えるためのジェネリクス。CloudflareBindings の中身は
// worker-configuration.d.ts と wrangler.jsonc のバインディング設定から来ている。
const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>();

// app.use はミドルウェア（全リクエストに共通で挟まる処理）を登録する。
// '/v1/*' は「/v1 以下の全パスに適用する」という意味。
app.use("/v1/*", cors());

// 自作のレート制限ミドルウェア。
// (c, next) の c はリクエスト/レスポンスの情報が入ったコンテキスト、next() を呼ぶと
// 次のミドルウェアやルートハンドラに処理を渡す（呼ばなければそこで処理が終わる＝リクエストを止められる）。
app.use("/v1/*", async (c, next) => {
  const key = c.req.header("cf-connecting-ip") ?? "unknown";
  // RATE_LIMITER は wrangler.jsonc の ratelimits で定義したCloudflareの機能。
  // 同じ key（ここではIPアドレス）からのリクエストが一定数を超えると success: false になる。
  const { success } = await c.env.RATE_LIMITER.limit({ key });
  if (!success) {
    return c.json({ error: "Too many requests" }, 429);
  }
  await next();
});

app.get("/", (c) => c.redirect("/v1/docs"));

// 教育漢字は1026字で固定なので、limit未指定時は全件返す。
const MAX_LIMIT = 1026;
const DEFAULT_LIMIT = MAX_LIMIT;

// grade クエリパラメータは /v1/kanji と /v1/kanji/random の両方で使うので共通化している。
// z.coerce.number() は「文字列で来たクエリパラメータを数値に変換してからバリデーションする」という意味。
// クエリパラメータはHTTP上ではすべて文字列なので、この coerce が無いとバリデーションに通らない。
const gradeParam = z.coerce
  .number()
  .int()
  .min(1)
  .max(6)
  .optional()
  .openapi({
    param: { name: "grade", in: "query" },
    example: 1,
    description: "Filter by grade (1-6)",
  });

// --- GET /v1/kanji（一覧） ---
// createRoute はハンドラを持たない「ルートの仕様」だけの定義。
// request.query に書いたZodスキーマが、そのままリクエストのバリデーション兼、
// OpenAPI仕様書のパラメータ説明として使われる（一度書けば両方に効く）。
const listRoute = createRoute({
  method: "get",
  path: "/v1/kanji",
  tags: ["kanji"],
  summary: "List kanji",
  request: {
    query: z.object({
      grade: gradeParam,
      strokeMin: z.coerce
        .number()
        .int()
        .optional()
        .openapi({ description: "Minimum stroke count" }),
      strokeMax: z.coerce
        .number()
        .int()
        .optional()
        .openapi({ description: "Maximum stroke count" }),
      q: z.string().optional().openapi({
        description: "Partial match search across kanji, meaning, and readings",
      }),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_LIMIT)
        .optional()
        .openapi({
          description: `Max number of results to return (defaults to all, max ${MAX_LIMIT})`,
        }),
      offset: z.coerce
        .number()
        .int()
        .min(0)
        .optional()
        .openapi({ description: "Offset for pagination" }),
    }),
  },
  // responses はステータスコードごとに、返すJSONの形（スキーマ）を宣言する。
  // ここで宣言していない形を返すとOpenAPI仕様書とズレるので、ハンドラ側もこれに合わせて実装する。
  responses: {
    200: {
      description: "List of kanji",
      content: { "application/json": { schema: KanjiListSchema } },
    },
    429: {
      description: "Too many requests",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

// app.openapi(ルート定義, ハンドラ) でルートとハンドラを紐付ける。
// 普通のHonoの app.get(path, handler) とほぼ同じだが、ハンドラの中で
// c.req.valid('query') が使えるようになる（バリデーション済み・型付きの値が返る）。
app.openapi(listRoute, async (c) => {
  const {
    grade,
    strokeMin,
    strokeMax,
    q,
    limit: limitParam,
    offset: offsetParam,
  } = c.req.valid("query");
  const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = offsetParam ?? 0;

  // 指定されたクエリパラメータだけをWHERE句の条件として組み立てる。
  // SQLインジェクション対策として値はすべて "?" のプレースホルダに入れ、bind() で渡す
  // （文字列連結で値を直接埋め込まない）。
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (grade !== undefined) {
    conditions.push("grade = ?");
    params.push(grade);
  }
  if (strokeMin !== undefined) {
    conditions.push("stroke_count >= ?");
    params.push(strokeMin);
  }
  if (strokeMax !== undefined) {
    conditions.push("stroke_count <= ?");
    params.push(strokeMax);
  }
  if (q) {
    conditions.push(
      "(kanji = ? OR meaning LIKE ? OR kunyomi_ja LIKE ? OR kunyomi LIKE ? OR onyomi_ja LIKE ? OR onyomi LIKE ?)",
    );
    const like = `%${q}%`;
    params.push(q, like, like, like, like, like);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // c.env.DB は wrangler.jsonc の d1_databases.binding で名付けたD1データベースへの参照。
  // .prepare(sql) でSQL文を用意し、.bind(...params) で "?" に値を埋め、
  // .first() は1件だけ、.all() は複数件取得する。
  const countStmt = c.env.DB.prepare(
    `SELECT COUNT(*) as total FROM kanji ${where}`,
  ).bind(...params);
  const listStmt = c.env.DB.prepare(
    `SELECT * FROM kanji ${where} ORDER BY grade, stroke_count, kanji LIMIT ? OFFSET ?`,
  ).bind(...params, limit, offset);

  // 件数取得と一覧取得は互いに依存しないので Promise.all で並行実行して待ち時間を短縮している。
  const [countResult, listResult] = await Promise.all([
    countStmt.first<{ total: number }>(),
    listStmt.all<KanjiRow>(),
  ]);

  return c.json({
    total: countResult?.total ?? 0,
    limit,
    offset,
    // DBの行（KanjiRow）をAPIレスポンス形（KanjiResponse）に変換する。
    results: listResult.results.map(toKanjiResponse),
  });
});

// --- GET /v1/kanji/random（ランダムな1字） ---
const randomRoute = createRoute({
  method: "get",
  path: "/v1/kanji/random",
  tags: ["kanji"],
  summary: "Get a random kanji",
  request: {
    query: z.object({ grade: gradeParam }),
  },
  responses: {
    200: {
      description: "A random kanji",
      content: { "application/json": { schema: KanjiSchema } },
    },
    404: {
      description: "No matching kanji found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(randomRoute, async (c) => {
  const { grade } = c.req.valid("query");

  // ORDER BY RANDOM() はSQLite（D1）でランダムに1行選ぶ書き方。
  const stmt =
    grade !== undefined
      ? c.env.DB.prepare(
          "SELECT * FROM kanji WHERE grade = ? ORDER BY RANDOM() LIMIT 1",
        ).bind(grade)
      : c.env.DB.prepare("SELECT * FROM kanji ORDER BY RANDOM() LIMIT 1");

  const row = await stmt.first<KanjiRow>();
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(toKanjiResponse(row));
});

// --- GET /v1/grades（学年ごとの字数） ---
const gradesRoute = createRoute({
  method: "get",
  path: "/v1/grades",
  tags: ["grades"],
  summary: "Get kanji count per grade",
  responses: {
    200: {
      description: "Kanji count per grade",
      content: { "application/json": { schema: GradesSchema } },
    },
  },
});

app.openapi(gradesRoute, async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT grade, COUNT(*) as count FROM kanji GROUP BY grade ORDER BY grade",
  ).all<{ grade: number; count: number }>();
  return c.json({ grades: result.results });
});

// --- GET /v1/kanji/{kanji}（単字の詳細） ---
const detailRoute = createRoute({
  method: "get",
  path: "/v1/kanji/{kanji}",
  tags: ["kanji"],
  summary: "Get details for a single kanji",
  request: {
    // params はURLパスの一部（この場合 {kanji} の部分）を受け取るためのスキーマ。
    // クエリパラメータと違い、パスパラメータは省略できないので optional() を付けていない。
    params: z.object({
      kanji: z
        .string()
        .openapi({ param: { name: "kanji", in: "path" }, example: "一" }),
    }),
  },
  responses: {
    200: {
      description: "Kanji detail",
      content: { "application/json": { schema: KanjiSchema } },
    },
    404: {
      description: "No matching kanji found",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

app.openapi(detailRoute, async (c) => {
  // クエリパラメータは c.req.valid('query')、パスパラメータは c.req.valid('param') で取得する。
  const { kanji } = c.req.valid("param");
  const row = await c.env.DB.prepare("SELECT * FROM kanji WHERE kanji = ?")
    .bind(kanji)
    .first<KanjiRow>();
  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(toKanjiResponse(row));
});

// ここまでに app.openapi() で登録した全ルートの情報から、OpenAPI仕様書（JSON）を組み立てて
// /v1/openapi.json で配信する。info はドキュメントのタイトルや説明などのメタ情報。
app.doc("/v1/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "Kyoiku Kanji API",
    version: "1.0.0",
    description:
      "An API providing all 1,026 kyōiku kanji (教育漢字) — the kanji taught in Japanese elementary school — including readings, meanings, stroke counts, grade level, and example words. Data adapted from Kanji alive (https://app.kanjialive.com), CC BY 4.0.",
  },
});

// /v1/openapi.json を読み込んで、ブラウザで見られる形（Swagger UI）に描画するページ。
app.get("/v1/docs", swaggerUI({ url: "/v1/openapi.json" }));

// Cloudflare Workers（wrangler.jsonc の main）はこの default export をエントリーポイントとして実行する。
export default app;
