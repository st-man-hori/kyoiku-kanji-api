import type { z } from "@hono/zod-openapi";
import type { KanjiSchema } from "./schema";

// D1（CloudflareのSQLiteデータベース）から1行分取得したときの生の形。
// カラム名はDBのスネークケース（stroke_count等）のままにしている。
export type KanjiRow = {
  kanji: string;
  stroke_count: number;
  meaning: string;
  grade: number;
  kunyomi_ja: string | null;
  kunyomi: string | null;
  onyomi_ja: string | null;
  onyomi: string | null;
  examples: string;
};

// APIとして外に返す形。
// `z.infer<typeof KanjiSchema>` は「schema.tsのKanjiSchemaから型を逆算する」という意味のTypeScript構文。
// スキーマ（実行時のバリデーション定義）と型（コンパイル時のチェック）を二重管理せずに済む。
export type KanjiResponse = z.infer<typeof KanjiSchema>;

// "ひと、ひとつ" のような区切り文字付き文字列を配列に分割するヘルパー。
// 値がnullや空文字のときは空配列を返す。
function splitReadings(value: string | null, delimiter: string): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

// DBの生の行（KanjiRow）を、APIレスポンス用の形（KanjiResponse）に変換する。
export function toKanjiResponse(row: KanjiRow): KanjiResponse {
  // examplesカラムにはJSON文字列（例: [["一年生", "first-year student"], ...]）が入っているのでパースする。
  const examples: [string, string][] = JSON.parse(row.examples);
  return {
    kanji: row.kanji,
    strokeCount: row.stroke_count,
    meaning: row.meaning,
    grade: row.grade,
    kunyomi: {
      ja: splitReadings(row.kunyomi_ja, "、"),
      romaji: splitReadings(row.kunyomi, ","),
    },
    onyomi: {
      ja: splitReadings(row.onyomi_ja, "、"),
      romaji: splitReadings(row.onyomi, ","),
    },
    examples: examples.map(([word, meaning]) => ({ word, meaning })),
  };
}
