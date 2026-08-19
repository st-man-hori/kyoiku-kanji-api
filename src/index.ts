import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { swaggerUI } from '@hono/swagger-ui'
import { cors } from 'hono/cors'
import { toKanjiResponse, type KanjiRow } from './kanji'
import { KanjiSchema, KanjiListSchema, GradesSchema, ErrorSchema } from './schema'

const app = new OpenAPIHono<{ Bindings: CloudflareBindings }>()

app.use('/v1/*', cors())

app.use('/v1/*', async (c, next) => {
  const key = c.req.header('cf-connecting-ip') ?? 'unknown'
  const { success } = await c.env.RATE_LIMITER.limit({ key })
  if (!success) {
    return c.json({ error: 'Too many requests' }, 429)
  }
  await next()
})

// 教育漢字は1026字で固定なので、limit未指定時は全件返す。
const MAX_LIMIT = 2000
const DEFAULT_LIMIT = MAX_LIMIT

const gradeParam = z.coerce.number().int().min(1).max(6).optional().openapi({
  param: { name: 'grade', in: 'query' },
  example: 1,
  description: '学年（1〜6）で絞り込み',
})

const listRoute = createRoute({
  method: 'get',
  path: '/v1/kanji',
  tags: ['kanji'],
  summary: '漢字の一覧を取得',
  request: {
    query: z.object({
      grade: gradeParam,
      strokeMin: z.coerce.number().int().optional().openapi({ description: '画数の下限' }),
      strokeMax: z.coerce.number().int().optional().openapi({ description: '画数の上限' }),
      q: z.string().optional().openapi({ description: '漢字・意味・読みの部分一致検索' }),
      limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().openapi({
        description: `取得件数の上限（デフォルトは全件、最大${MAX_LIMIT}）`,
      }),
      offset: z.coerce.number().int().min(0).optional().openapi({ description: '取得開始位置' }),
    }),
  },
  responses: {
    200: {
      description: '漢字の一覧',
      content: { 'application/json': { schema: KanjiListSchema } },
    },
    429: {
      description: 'リクエストが多すぎます',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(listRoute, async (c) => {
  const { grade, strokeMin, strokeMax, q, limit: limitParam, offset: offsetParam } = c.req.valid('query')
  const limit = Math.min(limitParam ?? DEFAULT_LIMIT, MAX_LIMIT)
  const offset = offsetParam ?? 0

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (grade !== undefined) {
    conditions.push('grade = ?')
    params.push(grade)
  }
  if (strokeMin !== undefined) {
    conditions.push('stroke_count >= ?')
    params.push(strokeMin)
  }
  if (strokeMax !== undefined) {
    conditions.push('stroke_count <= ?')
    params.push(strokeMax)
  }
  if (q) {
    conditions.push(
      '(kanji = ? OR meaning LIKE ? OR kunyomi_ja LIKE ? OR kunyomi LIKE ? OR onyomi_ja LIKE ? OR onyomi LIKE ?)'
    )
    const like = `%${q}%`
    params.push(q, like, like, like, like, like)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countStmt = c.env.DB.prepare(`SELECT COUNT(*) as total FROM kanji ${where}`).bind(...params)
  const listStmt = c.env.DB.prepare(
    `SELECT * FROM kanji ${where} ORDER BY grade, stroke_count, kanji LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset)

  const [countResult, listResult] = await Promise.all([countStmt.first<{ total: number }>(), listStmt.all<KanjiRow>()])

  return c.json({
    total: countResult?.total ?? 0,
    limit,
    offset,
    results: listResult.results.map(toKanjiResponse),
  })
})

const randomRoute = createRoute({
  method: 'get',
  path: '/v1/kanji/random',
  tags: ['kanji'],
  summary: 'ランダムな漢字を1字取得',
  request: {
    query: z.object({ grade: gradeParam }),
  },
  responses: {
    200: {
      description: 'ランダムな漢字',
      content: { 'application/json': { schema: KanjiSchema } },
    },
    404: {
      description: '該当する漢字がない',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(randomRoute, async (c) => {
  const { grade } = c.req.valid('query')

  const stmt =
    grade !== undefined
      ? c.env.DB.prepare('SELECT * FROM kanji WHERE grade = ? ORDER BY RANDOM() LIMIT 1').bind(grade)
      : c.env.DB.prepare('SELECT * FROM kanji ORDER BY RANDOM() LIMIT 1')

  const row = await stmt.first<KanjiRow>()
  if (!row) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(toKanjiResponse(row))
})

const gradesRoute = createRoute({
  method: 'get',
  path: '/v1/grades',
  tags: ['grades'],
  summary: '学年ごとの字数を取得',
  responses: {
    200: {
      description: '学年ごとの字数',
      content: { 'application/json': { schema: GradesSchema } },
    },
  },
})

app.openapi(gradesRoute, async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT grade, COUNT(*) as count FROM kanji GROUP BY grade ORDER BY grade'
  ).all<{ grade: number; count: number }>()
  return c.json({ grades: result.results })
})

const detailRoute = createRoute({
  method: 'get',
  path: '/v1/kanji/{kanji}',
  tags: ['kanji'],
  summary: '単字の詳細を取得',
  request: {
    params: z.object({
      kanji: z.string().openapi({ param: { name: 'kanji', in: 'path' }, example: '一' }),
    }),
  },
  responses: {
    200: {
      description: '漢字の詳細',
      content: { 'application/json': { schema: KanjiSchema } },
    },
    404: {
      description: '該当する漢字がない',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

app.openapi(detailRoute, async (c) => {
  const { kanji } = c.req.valid('param')
  const row = await c.env.DB.prepare('SELECT * FROM kanji WHERE kanji = ?').bind(kanji).first<KanjiRow>()
  if (!row) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(toKanjiResponse(row))
})

app.doc('/v1/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: '教育漢字 API',
    version: '1.0.0',
    description:
      '小学校で習う教育漢字1026字（読み・意味・画数・学年・例文）を提供するAPI。データは Kanji alive (https://app.kanjialive.com) を改変して使用（CC BY 4.0）。',
  },
})

app.get('/v1/docs', swaggerUI({ url: '/v1/openapi.json' }))

export default app
