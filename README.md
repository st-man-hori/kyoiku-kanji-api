# 教育漢字 API(kyoiku-kanji-api)

小学校で習う教育漢字1026字（読み・意味・画数・学年・例文）を提供するAPIです。Hono + Cloudflare Workers + D1。

## セットアップ

```txt
npm install
npm run db:migrate:local
npm run dev
```

`db:migrate:local` はローカルD1（`.wrangler`配下のSQLite）にスキーマとデータを投入します。Cloudflareアカウントは不要です。

`wrangler dev` / `vite dev` は内部で `workerd` を実行するため、glibc 2.32未満の環境（古いLinuxディストリビューションなど）では動きません。その場合は代わりに以下を使ってください（Dockerが必要）。

```txt
npm run dev:docker
```

## デプロイ

自分のCloudflareアカウントにデプロイする場合、先に自分のD1データベースを作成し `wrangler.jsonc` の `database_id` を差し替えてください。

```txt
npx wrangler d1 create <任意の名前>
# database_id を wrangler.jsonc に反映
npx wrangler d1 migrations apply <db名> --remote
npm run deploy
```

[型定義の生成については](https://developers.cloudflare.com/workers/wrangler/commands/#types):

```txt
npm run cf-typegen
```

## API

| Method | Path                | 説明                                                              |
| ------ | ------------------- | ----------------------------------------------------------------- |
| GET    | `/v1/kanji`         | 一覧。クエリ: `grade`, `strokeMin`, `strokeMax`, `q`, `limit`, `offset` |
| GET    | `/v1/kanji/random`  | ランダムな1字。クエリ: `grade`                                      |
| GET    | `/v1/kanji/:kanji`  | 単字の詳細（例: `/v1/kanji/一`）                                    |
| GET    | `/v1/grades`        | 学年ごとの字数                                                     |

### レスポンス例

`GET /v1/kanji/一`

```json
{
  "kanji": "一",
  "strokeCount": 1,
  "meaning": "one",
  "grade": 1,
  "kunyomi": { "ja": ["ひと"], "romaji": ["hito"] },
  "onyomi": { "ja": ["イチ"], "romaji": ["ichi"] },
  "examples": [
    { "word": "一年生（いちねんせい）", "meaning": "first-year student" }
  ]
}
```

## データ

`data/kyoiku-kanji.csv` が元データ。スキーマ変更などでDB投入用SQLを作り直す場合は以下を実行してください（`migrations/0002_seed.sql` を再生成します）。

```txt
node scripts/generate-seed.mjs
```

## クレジット

`data/kyoiku-kanji.csv` は [Kanji alive](https://app.kanjialive.com) が公開しているデータを改変して使用しています。

> This work by Kanji alive is licensed under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/). Permissions beyond the scope of this license may be available at http://kanjialive.com/credits/.

Kanji alive のデータ（読み・意味・例文など）をもとに、教育漢字1026字向けに再構成・修正しています。
