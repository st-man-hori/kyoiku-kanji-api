[日本語](README.md) | English

# Kyoiku Kanji API

An API providing all 1,026 _kyōiku kanji_ (教育漢字) — the kanji taught in Japanese elementary school — including readings, meanings, stroke counts, grade level, and example words. Built with Hono + Cloudflare Workers + D1.

## Setup

```txt
npm install
npm run db:migrate:local
npm run dev
```

`db:migrate:local` seeds a local D1 database (SQLite under `.wrangler`) with the schema and data. No Cloudflare account required.

`wrangler dev` / `vite dev` run `workerd` internally, which requires glibc 2.32+. On older Linux distributions this won't work; use the Docker-based script instead (requires Docker):

```txt
npm run dev:docker
```

## Deploy

To deploy to your own Cloudflare account, first create your own D1 database and replace `database_id` in `wrangler.jsonc`.

```txt
npx wrangler d1 create <any-name>
# reflect the database_id in wrangler.jsonc
npx wrangler d1 migrations apply <db-name> --remote
npm run deploy
```

[Generating/synchronizing types](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

## API

See the Swagger UI for full request/response details.

- Swagger UI: `/v1/docs`
- OpenAPI (JSON): `/v1/openapi.json`

| Method | Path               | Description                                     |
| ------ | ------------------ | ----------------------------------------------- |
| GET    | `/v1/kanji`        | List / search / filter                          |
| GET    | `/v1/kanji/random` | A random kanji                                  |
| GET    | `/v1/kanji/:kanji` | Detail for a single kanji (e.g. `/v1/kanji/一`) |
| GET    | `/v1/grades`       | Kanji count per grade                           |

Responses are CORS-enabled and rate-limited to 60 requests/minute per IP (`429` when exceeded).

## Data

`data/kyoiku-kanji.csv` is the source data. If you need to regenerate the seed SQL (e.g. after a schema change), run:

```txt
node scripts/generate-seed.mjs
```

## Credits

`data/kyoiku-kanji.csv` is adapted from data published by [Kanji alive](https://app.kanjialive.com).

> This work by Kanji alive is licensed under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/). Permissions beyond the scope of this license may be available at http://kanjialive.com/credits/.

The readings, meanings, example words, etc. are based on Kanji alive's data, restructured and modified for the 1,026 kyōiku kanji.

## License

The code is licensed under the [MIT License](LICENSE). The data in `data/kyoiku-kanji.csv` remains under CC BY 4.0 as noted above.
