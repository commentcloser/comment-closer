# Comment Closer

AI comment automation for social pages. Users connect Facebook Pages, Instagram,
TikTok and TikTok Ads; comments are ingested via webhooks + cron; OpenAI
classifies sentiment, auto-replies (brand tone, cooldowns, block/allowlists,
optional manual review + delay) and auto-moderates negatives.

**Stack:** Next.js 16 (App Router) · React 19 · NextAuth v5 · Prisma 6 + Postgres
· OpenAI · Resend · i18next (en/el) · Vercel.

---

## ⚠️ Read first — production safety

- `DATABASE_URL` in a real `.env` points at the **live production** Postgres.
- **Never** run `npm run db:migrate:dev` (`prisma migrate dev`) or
  `prisma db push --accept-data-loss` against production — the migration history
  is drifted, so `migrate dev` will offer to **reset (wipe) the database**.
- For local work, use a **separate** dev database (see below).
- Deploys happen by merging to `main` (Vercel git integration). Don't push
  straight to prod.

## Local setup

```bash
npm install
cp .env.example .env          # fill in values (see .env.example for every var)
npx prisma generate
# Point DATABASE_URL at a SEPARATE local/dev Postgres, then:
npx prisma db push            # materialize the schema (NOT migrate dev — see above)
npm run dev
```

Scripts:

| script | what |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | eslint |
| `npm run db:push` | `prisma db push` (use against a **dev** DB) |
| `npm run db:migrate` | `prisma migrate deploy` (apply committed migrations) |
| `npm run db:migrate:dev` | `prisma migrate dev` — **local dev DB only** |
| `npm run db:studio` | Prisma Studio |

The maintenance scripts under `scripts/` refuse to run against the prod DB unless
`ALLOW_DESTRUCTIVE_SCRIPT=1` is set.

## Crons

Both background jobs are driven by GitHub Actions workflows (`.github/workflows/`),
which call the endpoints with `Authorization: Bearer $CRON_SECRET`:

- `cron.yml` — every 5 min: `post-scheduled-replies` + `fetch-tiktok-ads-comments`.
- `refresh-meta-tokens.yml` — daily: refresh Facebook long-lived user tokens.

The repo secret **`CRON_SECRET`** (Settings → Secrets → Actions) must equal the
production `CRON_SECRET` env var. Scheduled workflows only run from the default
branch (`main`). If you move to Vercel Pro, a `vercel.json` `crons` block is a more
robust alternative (Vercel injects the same Bearer header).

## Deploy (Vercel)

- Project: **comment-closer** (team `comment-closer`), production
  `https://www.commentcloser.com`.
- All ~28 env vars live in the Vercel project settings (see `.env.example`).
  **Env-var changes require a redeploy** to take effect.

## Secrets

Rotate any secret that has been exposed. To update a Vercel env var + redeploy:

```bash
vercel env rm  <NAME> production --yes
printf '%s' "<value>" | vercel env add <NAME> production   # or use the dashboard
vercel redeploy <latest-prod-deployment-url>
```

## Where things live

- `app/api/webhooks/*` — inbound comment ingestion (HMAC-verified).
- `app/api/cron/*` — background jobs (CRON_SECRET-gated).
- `lib/aiReplyEngine.ts`, `lib/openai.ts`, `lib/replyDecisionEngine.ts`,
  `lib/commentModerator.ts` — the AI pipeline.
- `lib/aiConfig.ts` — model/effort/token-cap overrides.
- `prisma/schema.prisma` — data model.
- `BACKLOG.md` — outstanding work.
