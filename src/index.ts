import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { toKanjiResponse, type KanjiRow } from './kanji'

const app = new Hono<{ Bindings: CloudflareBindings }>()

app.use('/v1/*', cors())

// 教育漢字は1026字で固定なので、limit未指定時は全件返す。
const MAX_LIMIT = 2000
const DEFAULT_LIMIT = MAX_LIMIT

app.get('/v1/kanji', async (c) => {
  const grade = c.req.query('grade')
  const strokeMin = c.req.query('strokeMin')
  const strokeMax = c.req.query('strokeMax')
  const q = c.req.query('q')
  const limit = Math.min(Number(c.req.query('limit') ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Number(c.req.query('offset') ?? 0) || 0

  const conditions: string[] = []
  const params: (string | number)[] = []

  if (grade) {
    conditions.push('grade = ?')
    params.push(Number(grade))
  }
  if (strokeMin) {
    conditions.push('stroke_count >= ?')
    params.push(Number(strokeMin))
  }
  if (strokeMax) {
    conditions.push('stroke_count <= ?')
    params.push(Number(strokeMax))
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

app.get('/v1/kanji/random', async (c) => {
  const grade = c.req.query('grade')

  const stmt = grade
    ? c.env.DB.prepare('SELECT * FROM kanji WHERE grade = ? ORDER BY RANDOM() LIMIT 1').bind(Number(grade))
    : c.env.DB.prepare('SELECT * FROM kanji ORDER BY RANDOM() LIMIT 1')

  const row = await stmt.first<KanjiRow>()
  if (!row) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(toKanjiResponse(row))
})

app.get('/v1/grades', async (c) => {
  const result = await c.env.DB.prepare(
    'SELECT grade, COUNT(*) as count FROM kanji GROUP BY grade ORDER BY grade'
  ).all<{ grade: number; count: number }>()
  return c.json({ grades: result.results })
})

app.get('/v1/kanji/:kanji', async (c) => {
  const kanji = c.req.param('kanji')
  const row = await c.env.DB.prepare('SELECT * FROM kanji WHERE kanji = ?').bind(kanji).first<KanjiRow>()
  if (!row) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(toKanjiResponse(row))
})

export default app
