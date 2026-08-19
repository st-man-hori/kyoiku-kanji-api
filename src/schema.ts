import { z } from '@hono/zod-openapi'

export const KanjiSchema = z
  .object({
    kanji: z.string().openapi({ example: '一' }),
    strokeCount: z.number().int().openapi({ example: 1 }),
    meaning: z.string().openapi({ example: 'one' }),
    grade: z.number().int().min(1).max(6).openapi({ example: 1 }),
    kunyomi: z
      .object({
        ja: z.array(z.string()).openapi({ example: ['ひと'] }),
        romaji: z.array(z.string()).openapi({ example: ['hito'] }),
      })
      .openapi('Reading'),
    onyomi: z
      .object({
        ja: z.array(z.string()).openapi({ example: ['イチ'] }),
        romaji: z.array(z.string()).openapi({ example: ['ichi'] }),
      })
      .openapi('Reading'),
    examples: z
      .array(
        z.object({
          word: z.string().openapi({ example: '一年生（いちねんせい）' }),
          meaning: z.string().openapi({ example: 'first-year student' }),
        })
      )
      .openapi({ description: '例文（単語と意味のペア）' }),
  })
  .openapi('Kanji')

export const KanjiListSchema = z
  .object({
    total: z.number().int().openapi({ example: 1026 }),
    limit: z.number().int().openapi({ example: 2000 }),
    offset: z.number().int().openapi({ example: 0 }),
    results: z.array(KanjiSchema),
  })
  .openapi('KanjiList')

export const GradesSchema = z
  .object({
    grades: z.array(
      z.object({
        grade: z.number().int().min(1).max(6).openapi({ example: 1 }),
        count: z.number().int().openapi({ example: 80 }),
      })
    ),
  })
  .openapi('Grades')

export const ErrorSchema = z
  .object({
    error: z.string().openapi({ example: 'Not found' }),
  })
  .openapi('Error')
