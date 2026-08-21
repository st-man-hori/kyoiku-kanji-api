// @hono/zod-openapi の z は、通常のZod（バリデーションライブラリ）に
// `.openapi(...)` というメソッドを追加したもの。
// スキーマ定義がそのままOpenAPI仕様書（Swagger UIで見えるやつ）の元データになる。
import { z } from "@hono/zod-openapi";

// 漢字1字分のレスポンス形状を定義するスキーマ。
// `.openapi({ example: ... })` は「この項目の例はこれです」とドキュメントに載せるための情報で、
// バリデーションの動作自体には影響しない（あくまで見た目のためのおまけ）。
export const KanjiSchema = z
  .object({
    kanji: z.string().openapi({ example: "一" }),
    strokeCount: z.number().int().openapi({ example: 1 }),
    meaning: z.string().openapi({ example: "one" }),
    grade: z.number().int().min(1).max(6).openapi({ example: 1 }),
    // 訓読み・音読みは「日本語表記」と「ローマ字」を別々の配列で持たせている。
    kunyomi: z
      .object({
        ja: z.array(z.string()).openapi({ example: ["ひと"] }),
        romaji: z.array(z.string()).openapi({ example: ["hito"] }),
      })
      // 第2引数の 'Reading' はOpenAPI上での型の名前（コンポーネント名）。
      // 同じ形のオブジェクトが複数箇所に出てくるとき、Swagger UI側で共通の型として表示される。
      .openapi("Reading"),
    onyomi: z
      .object({
        ja: z.array(z.string()).openapi({ example: ["イチ"] }),
        romaji: z.array(z.string()).openapi({ example: ["ichi"] }),
      })
      .openapi("Reading"),
    examples: z
      .array(
        z.object({
          word: z.string().openapi({ example: "一年生（いちねんせい）" }),
          meaning: z.string().openapi({ example: "first-year student" }),
        }),
      )
      .openapi({ description: "Example words (word and meaning pairs)" }),
  })
  .openapi("Kanji");

// GET /v1/kanji（一覧）のレスポンス全体の形状。
// results の中身は上で定義した KanjiSchema をそのまま配列にして再利用している。
export const KanjiListSchema = z
  .object({
    total: z.number().int().openapi({ example: 1026 }),
    limit: z.number().int().openapi({ example: 1026 }),
    offset: z.number().int().openapi({ example: 0 }),
    results: z.array(KanjiSchema),
  })
  .openapi("KanjiList");

// GET /v1/grades のレスポンス形状。
export const GradesSchema = z
  .object({
    grades: z.array(
      z.object({
        grade: z.number().int().min(1).max(6).openapi({ example: 1 }),
        count: z.number().int().openapi({ example: 80 }),
      }),
    ),
  })
  .openapi("Grades");

// 404・429などエラー時に共通で使うレスポンス形状。
export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: "Not found" }),
  })
  .openapi("Error");
