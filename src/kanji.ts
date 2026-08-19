export type KanjiRow = {
  kanji: string
  stroke_count: number
  meaning: string
  grade: number
  kunyomi_ja: string | null
  kunyomi: string | null
  onyomi_ja: string | null
  onyomi: string | null
  examples: string
}

export type KanjiResponse = {
  kanji: string
  strokeCount: number
  meaning: string
  grade: number
  kunyomi: { ja: string[]; romaji: string[] }
  onyomi: { ja: string[]; romaji: string[] }
  examples: { word: string; meaning: string }[]
}

function splitReadings(value: string | null, delimiter: string): string[] {
  if (!value) return []
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function toKanjiResponse(row: KanjiRow): KanjiResponse {
  const examples: [string, string][] = JSON.parse(row.examples)
  return {
    kanji: row.kanji,
    strokeCount: row.stroke_count,
    meaning: row.meaning,
    grade: row.grade,
    kunyomi: {
      ja: splitReadings(row.kunyomi_ja, '、'),
      romaji: splitReadings(row.kunyomi, ','),
    },
    onyomi: {
      ja: splitReadings(row.onyomi_ja, '、'),
      romaji: splitReadings(row.onyomi, ','),
    },
    examples: examples.map(([word, meaning]) => ({ word, meaning })),
  }
}
