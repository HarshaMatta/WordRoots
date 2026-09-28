# Word Roots — Etymology Breakdown Tool

A multilingual etymology explorer for English, Telugu, and Tamil text. The React frontend preserves the original passage and colors each word by its predicted root-source language family. A Cloudflare Worker keeps the TypeSafe API key private and streams Jev classifications back as NDJSON.

Jev makes probabilistic classifications, not sourced dictionary claims. The interface exposes confidence and flags uncertain answers; surprising results should be checked against an etymological dictionary.

## Project layout

- `frontend/` — React and Vite static site for GitHub Pages
- `worker/` — Cloudflare Worker, input validation, cascading Jev calls, and abuse controls
- `shared/` — taxonomy, contracts, colors, and `Intl.Segmenter` tokenization
- `scripts/` — source-linked 20-case live smoke test

## Local setup

Requires Node 22.18 or newer.

```sh
npm install
cp .env.example .env.local
```

Put `TYPESAFE_API_KEY` in `.env.local`. The file is git-ignored. Run the live quality gate with:

```sh
npm run smoke
```

For local development, the Worker reads the ignored root `.env.local` file. Run these in separate terminals:

```sh
npm run dev:worker
npm run dev
```

Open `http://localhost:5173` to use the website. Port `8787` is the API service; opening it directly only displays its health response. The frontend sends classifications to `http://localhost:8787/classify` by default. Override the API origin with `VITE_WORKER_URL`. Never use a `VITE_` prefix for the TypeSafe key because Vite exposes those values to browser code.

## Worker deployment

Authenticate once, then store the key as a Worker secret and deploy:

```sh
npx wrangler login
npx wrangler secret put TYPESAFE_API_KEY --config worker/wrangler.jsonc
npm run deploy -w worker
```

Before deployment, replace `ALLOWED_ORIGINS` in `worker/wrangler.jsonc` with the exact GitHub Pages origin (comma-separated values are supported). The configured rate-limiting binding permits 60 batch requests per minute per connecting IP and Cloudflare location. Cloudflare documents these counters as eventually consistent, so this is approximate abuse protection rather than exact quota accounting.

Each frontend request carries at most eight unique word-and-sentence targets. The Worker runs four word cascades concurrently, makes at most one retry per Jev call, and therefore stays below the Workers Free limit of 50 external subrequests per invocation.

## GitHub Pages

Set the repository variable `VITE_WORKER_URL` to the deployed Worker origin. In GitHub repository settings, configure Pages to deploy from the `gh-pages` branch. Pushes to `main` run tests, build with the repository-name base path, and publish `frontend/dist`.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

The smoke corpus links each expected answer to its reference entry and covers Germanic, Romance, Hellenic, Sanskrit, Iranian, Slavic, Celtic, Arabic, Proto-South Dravidian, and Proto-South-Central Dravidian examples. The taxonomy deliberately stops at Sanskrit, Romance, or the reconstructed Dravidian proto-branch; it does not add a modern-language level. The corpus is a regression signal, not a calibration study.
