# Comment Closer — Task Backlog

_Generated 2026-07-06 from a 10-domain code audit. 71 tasks — P0: 8, P1: 27, P2: 28, P3: 8. Anything already handled by the three open PRs is excluded (see bottom)._

## Recommended sequence

> Do the human-only P0s first in parallel with the P0 code fixes: rotate the still-exposed secrets (SEC-1) and stand up the Resend domain + EMAIL_FROM (AUTH-1) — until AUTH-1 lands, no new user can verify or log in, so it gates everything user-facing. Immediately land the two cheap safety fixes that can wipe or embarrass prod: neuter db:migrate against prod (DB-1) and fix the false Stripe legal/marketing copy (BILL-1, BILL-2). Then tackle the P0 pipeline-correctness cluster (AI-1 async webhooks, AI-2 null-sentiment backfill, AI-3 decision-bypass on redelivery, INTEG-1 Meta token refresh) since those are silently dropping or double-posting to real customers, and add TikTok webhook HMAC (SEC-2). With prod stabilized, build the reliability layer: Sentry (OBS-1), OpenAI retry (AI-4), CI (DEPLOY-3), token encryption (SEC-3) and the migration re-baseline (DB-2). Sequence billing (BILL-3→BILL-7) only after the owner turns billing ON; the schema/quota/checkout chain depends on DB-2 landing cleanly. Finish with the dead-code, docs, tests and P3 polish.

## Needs a human (only you can do these)

- Rotate secrets pasted in chat that were NOT yet rotated: DATABASE_URL (db.prisma.io), FACEBOOK_CLIENT_SECRET, TIKTOK_CLIENT_SECRET + TIKTOK_SANDBOX_CLIENT_SECRET, RESEND_API_KEY, NEXTAUTH_SECRET. Update each in Vercel env, redeploy, record what/when. (OpenAI key already done.) — SEC-1
- Add a verified Resend sending domain for commentcloser.com (DNS TXT/DKIM/MX) and set EMAIL_FROM=mail@commentcloser.com in Vercel prod — until done, ALL verification/reset emails are dropped and no new user can log in. — AUTH-1
- Decide the billing question: keep Stripe OFF (then merge the interim legal-copy fix BILL-1) vs turn it ON (then greenlight BILL-3..BILL-7). Requires a product/pricing decision only the owner can make.
- Merge the three open PRs (#1, #2, #3) to main so their fixes reach prod and GH-Actions crons fire from the default branch.
- After PR#2 merges: delete/disable the external cron-job.org job that drives TikTok-Ads ingestion (it will otherwise double-fire) — the account is external to the repo. — DEPLOY-2
- Rotate/scope the Vercel CLI/OIDC token if it was ever shared or is long-lived (Vercel dashboard); confirm no .env* or .vercel blob is in git history. — DEPLOY-8
- Provision a Sentry project + SENTRY_DSN (and optional SENTRY_AUTH_TOKEN/ORG/PROJECT for source maps) in Vercel env once OBS-1 code lands.
- Confirm Vercel plan for cron cadence: */5 crons require Vercel Pro (Hobby caps crons at once/day); needed before any move from GH Actions to vercel.json crons. — DEPLOY-1

## P0 — urgent (security / broken in prod / legal)

### SEC-1 — Rotate all remaining secrets pasted in chat (DB URL, Meta, TikTok, Resend, NEXTAUTH_SECRET) _(needs you)_
**Effort:** M · ½ day · **Category:** security

OpenAI key was rotated; these were not. The db.prisma.io URL alone gives full read/write to the live 7-user/600+-comment DB plus all plaintext provider tokens; NEXTAUTH_SECRET lets an attacker forge ADMIN session JWTs (session strategy is 'jwt', lib/auth.ts:350). Treated P0 because plaintext token storage makes the DB URL a full account-takeover key.

`Vercel env: DATABASE_URL, FACEBOOK_CLIENT_SECRET, TIKTOK_CLIENT_SECRET, TIKTOK_SANDBOX_CLIENT_SECRET, RESEND_API_KEY, NEXTAUTH_SECRET (no code change)`

### AUTH-1 — Set a verified Resend sending domain + EMAIL_FROM so verification/reset mail actually delivers _(needs you)_
**Effort:** S · <2h · **Category:** auth

lib/email.ts (verified line 26) falls back to onboarding@resend.dev when EMAIL_FROM is unset, and Resend delivers that sender ONLY to the account owner. In prod every real user's verification/reset email is silently dropped, and lib/auth.ts blocks login until emailVerified, so new signups can never log in and nobody can reset a password. PR#3 only added a warning log; delivery is still broken. Human-only (DNS + Vercel).

`Resend dashboard + DNS for commentcloser.com; Vercel env EMAIL_FROM; lib/email.ts:26-31`

### AI-1 — Move Facebook/Instagram webhook AI processing off the request path via next/server after()
**Effort:** L · 1 day+ · **Category:** ai

Both Meta webhooks process synchronously: sentiment (~0.5-2s) + generateAIReply (1-5s, up to 28s with web_search) before returning 200. Meta's ~10s timeout + up-to-3x retries turn any 2-3 comment batch or web-search reply into a redelivery storm that cascades load AND (via AI-3) double-posts. fetch-tiktok-ads-comments already demonstrates the fix (import { after } from 'next/server': ack fast, run work in after()). maxDuration=60 and the updateMany claim-lock already exist, so this is decoupling, not re-architecting idempotency.

`app/api/webhooks/facebook/route.ts (POST awaits handleFeedComment, ~L68-91, claim-lock L445), app/api/webhooks/instagram/route.ts (awaits sentiment L227 + reply L410)`

### AI-2 — Distinguish OpenAI failure from 'not analyzable' + add a sentiment backfill cron for null/pending comments
**Effort:** M · ½ day · **Category:** ai · **Depends on:** AI-4

analyzeCommentSentiment ends in catch { return null } (verified structure), so any OpenAI 401/429/outage saves the comment with sentiment=null. FB/IG then hit the !sentiment branch and mark it 'ignored' (a transient outage permanently drops a real comment); TikTok organic just returns, leaving status 'pending'. There is NO retry/backfill cron. Return a sentinel/throw on API error vs confident-null, and add a cron that re-runs sentiment for status='pending' + sentiment=null with a bounded attempt cap (AI-5).

`lib/openai.ts (analyzeCommentSentiment bare catch { return null } ~L139); new app/api/cron/backfill-sentiment/route.ts; consumers in app/api/webhooks/facebook|instagram|tiktok/route.ts`

### AI-3 — Route Meta webhook redeliveries through shouldGenerateReply instead of calling generateAndPostAutoReply directly
**Effort:** M · ½ day · **Category:** ai

When Meta redelivers a comment that already has sentiment and is still status='pending', both handlers take the `else if (savedComment.sentiment)` branch and call generateAndPostAutoReply gated ONLY by shouldAutoReply — bypassing the entire decision engine (cooldown, replyOnlyFirstComment, min-length, block/allowlist). Redeliveries are common on Meta, so a comment shouldGenerateReply would have skipped gets auto-replied on the 2nd delivery. Redelivery branch must call shouldGenerateReply() + logSkipDecision() like the first-time path (FB L301-339).

`app/api/webhooks/facebook/route.ts (else-if savedComment.sentiment branch L366-383), app/api/webhooks/instagram/route.ts (L312-321)`

### INTEG-1 — Add proactive Meta long-lived user-token refresh cron so Pages/IG don't silently break at ~60 days
**Effort:** M · ½ day · **Category:** integrations

Meta user tokens are only ever refreshed client-side (onboarding one-time, comments-page button). A long-lived user token lasts ~60 days; once it lapses, pages/route.ts returns 'token expired, please reconnect' and every downstream Graph call (page-token refresh, IG discovery, promotion_status, posting replies) fails silently until the user happens to revisit the dashboard — so a paying customer's automation just stops. Add a cron that re-exchanges via fb_exchange_token, re-pulls page tokens, and flags needsReconnect on failure (mirror the TikTok needsReconnect pattern).

`app/api/facebook/refresh-token/route.ts, app/api/facebook/refresh-page-tokens/route.ts, app/api/facebook/pages/route.ts, new cron endpoint + .github/workflows/cron.yml (PR#2)`

### BILL-1 — Remove/qualify false Stripe billing claims in app/terms/page.tsx and app/privacy/page.tsx while billing is OFF
**Effort:** S · <2h · **Category:** billing

LIVE public legal pages make concrete, currently-false representations: Terms says paid subs are 'billed monthly in advance via Stripe' with a 'billing dashboard' cancel flow and recurring-charge authorization; Privacy claims it stores a Stripe customer ID/subscription status and retains billing records 7 years. There is ZERO Stripe code and no charge ever happens. With ~7 real users this is a consumer-protection/misrepresentation exposure. Reword to 'free during early access; paid plans not yet active' and drop the Stripe data-storage/retention claims. This is the interim-compliance fix the owner wants while billing stays OFF.

`app/terms/page.tsx (Subscription Plans & Billing / Upgrades / Cancellation / Payment Processing sections), app/privacy/page.tsx (billing-data, 'process payments via Stripe', Stripe third-party, 7-year retention)`

### DB-1 — Stop npm run db:migrate (prisma migrate dev) from being able to reset the prod DB
**Effort:** S · <2h · **Category:** deploy

package.json defines db:migrate = `prisma migrate dev`. With the badly drifted history and the live db.prisma.io URL in .env (no .env.example), one invocation triggers migrate dev's drift detection, which PROMPTS TO RESET the database — wiping ~7 users / 600+ comments. Point the prod/deploy path at `prisma migrate deploy`, reserve migrate dev for a separate local `db:migrate:dev` guarded to a local DATABASE_URL, and document that migrate dev / db push --accept-data-loss must never target prod.

`package.json (scripts.db:migrate), README/CLAUDE.md`

## P1 — important, soon

### SEC-2 — Add HMAC signature verification to the TikTok webhook to match FB/IG
**Effort:** S · <2h · **Category:** security

FB and IG webhooks verify x-hub-signature-256, but the TikTok organic webhook (route confirmed to exist) has no signature verification at all — an unauthenticated ingestion path an attacker can POST to, triggering the same OpenAI spend + auto-reply/moderation the audit flagged for Meta. Add TikTok's signature check (signs raw body with the app secret) in lib/webhookVerification.ts before JSON parsing.

`app/api/webhooks/tiktok/route.ts (has maxDuration=60 but no signature check, unlike facebook/instagram routes), lib/webhookVerification.ts`

### SEC-3 — Encrypt Meta/TikTok access tokens at rest instead of storing plaintext
**Effort:** L · 1 day+ · **Category:** security · **Depends on:** SEC-1

Long-lived provider tokens grant full comment read/manage (+ pages_manage_posts / ads_read) on real customer accounts and are stored plaintext. Any DB-read compromise (leaked connection string, debug-route regression, injection) hands live posting ability on ~7 customers' accounts. Wrap token read/write in one AES-256-GCM helper (key in Vercel env/KMS) and migrate existing rows. Do after SEC-1 so the new key isn't derived from a still-exposed secret.

`prisma/schema.prisma (Account.access_token/refresh_token L44-46, ConnectedPage.pageAccessToken L78), lib/tiktokApi.ts, lib/auth.ts, all token read sites in app/api/facebook/** and app/api/tiktok*/**`

### SEC-4 — Add middleware.ts to server-side guard /dashboard and /admin (currently client-only)
**Effort:** M · ½ day · **Category:** security

No middleware.ts exists (verified). /dashboard is guarded only by a client useSession()+router.replace effect and /admin only via AdminLayout; the page components and their data-fetching still render, so an unauthenticated/non-admin user who ignores the redirect (or scrapes the RSC/JS payload) reaches the shells and any inlined data. Add a NextAuth middleware matcher on ['/dashboard/:path*','/admin/:path*'] checking session (and role===ADMIN for /admin).

`middleware.ts (new — confirmed absent), app/dashboard/layout.tsx, components/layout/AdminLayout.tsx`

### SEC-5 — Gate account-existence enumeration in GET /api/facebook/data-deletion + add the /status subroute Meta polls
**Effort:** S · <2h · **Category:** security

The GET handler is unauthenticated and takes a caller-supplied ?user_id, then findFirst on (provider:'facebook', providerAccountId:user_id) and returns 'pending' vs 'completed' — a public oracle that reveals whether any guessable numeric FB user is a Comment Closer customer. Also the POST tells Meta to poll '/api/facebook/data-deletion/status?...' but no /status subroute exists (Meta's polling 404s). Gate status lookups behind an opaque confirmation_code stored at deletion time, and add the /status route.

`app/api/facebook/data-deletion/route.ts (GET handler ~L196, L211-242)`

### DB-2 — Re-baseline the drifted Prisma migration history so `migrate deploy` reproduces schema.prisma on a fresh DB
**Effort:** L · 1 day+ · **Category:** db

The 9 committed migrations only create initial tables + a few ALTERs; prod was maintained via db push + hand SQL and has drifted hard. A fresh `migrate deploy` produces a DB that does NOT match schema.prisma: TikTokAccountStats never created (breaks tiktokStats relation), ~22 ConnectedPage automation columns, ~15 Comment automation columns, and User.role/lastLoginAt + Role enum all missing. Fix: `migrate diff` from empty → schema.prisma for one clean baseline, delete the drifted history, `migrate resolve --applied` on prod, verify against a throwaway DB. Also absorbs the two loose hand-SQL files (profileImageUrl, replyDelaySeconds) that live outside prisma/migrations.

`prisma/migrations/*, prisma/schema.prisma; fold in prisma/add_profile_image_url.sql + prisma/add_reply_delay.sql`

### DB-3 — Add missing indexes + CommentActionLog unique constraint into the migration baseline
**Effort:** M · ½ day · **Category:** db · **Depends on:** DB-2

Even tables that exist in migrations lack constraints schema.prisma declares: CommentActionLog is a bare table missing its 4 indexes AND the unique_comment_action unique (commentId, actionType) that the app assumes prevents duplicate actions; Comment is missing 7 declared indexes (incl. the pageId_authorId_createdAt cooldown index and pageId_needsReview/automationStatus); ConnectedPage is missing userId_disconnectedAt. Fold into the DB-2 re-baseline so a fresh DB matches, or add explicit migrations if history is kept.

`prisma/migrations/*, prisma/schema.prisma`

### DEPLOY-3 — Add a CI workflow (typecheck + lint + build) gating deploys — none exists
**Effort:** M · ½ day · **Category:** deploy

Zero CI: .github/workflows/ holds only the cron workflow. Nothing runs tsc/eslint/next build before Vercel deploys, so a type error or broken build ships to prod (7 live users). tsconfig strict:true and eslint.config.mjs exist but are never enforced. Add ci.yml (npm ci, typecheck, lint, build) on PR/push, and add the missing `typecheck` script (there is no tsc script today; the lint script also has no target).

`.github/workflows/ci.yml (new), package.json (add typecheck script), eslint.config.mjs, tsconfig.json`

### AI-4 — Add exponential-backoff retry on OpenAI 429/5xx for sentiment and reply calls
**Effort:** M · ½ day · **Category:** ai

No call site retries on 429/transient 5xx. Sentiment swallows the error → null (comment silently gets no sentiment/reply — see AI-2); the reply path maps 429 to 'Rate limit exceeded' and marks the comment ai_failed with no retry. Under bursts a single rate-limit spike fails a whole batch and permanently drops replies. Add a small shared helper (3 attempts, exponential backoff, honor Retry-After) around both call sites; natural home is lib/aiConfig.ts-adjacent or lib/openaiRetry.ts.

`lib/openai.ts (chat.completions.create ~L104, catch→null L139), lib/aiReplyEngine.ts (429 mapped to error string L655; create calls L213/287/377/615)`

### AI-5 — Fix cooldown/first-comment checks to count scheduled + in-flight replies, not just replied=true
**Effort:** M · ½ day · **Category:** ai

The cooldown/first-comment queries only match replied:true. But when replyDelaySeconds>0 or manualReviewEnabled is on, an auto-reply is generated and stored as status='ai_generated' with scheduledPostAt set (replied stays false until the cron posts). So a burst from one author within the cooldown window all pass and each schedules a reply — defeating the cooldown entirely for any page using delay or manual review. Count in-flight replies (status IN ai_generated/ai_generating OR scheduledPostAt set OR a REPLY action log) in addition to replied:true.

`lib/replyDecisionEngine.ts (cooldown query L238-256 filters replied:true; first-comment count L284-292)`

### AI-6 — Reset stale ai_generating comments for Facebook/Instagram (serverless-timeout victims), all providers
**Effort:** S · <2h · **Category:** ai

generateAndPostAutoReply claims a comment by setting status='ai_generating' (updateMany where status='pending'). If the function dies mid-generation (OpenAI timeout, 60s cap — very likely given AI-1's synchronous processing), the comment is orphaned in ai_generating forever and can never be retried. The only stale-reset lives inside the TikTok-Ads cron. Add a periodic reset (own cron or reuse post-scheduled-replies) flipping ai_generating older than ~5min back to pending across all providers.

`app/api/cron/fetch-tiktok-ads-comments/route.ts (stale-reset L35-47, runs only in the TikTok-Ads cron); claim-lock at webhooks/facebook/route.ts L445 + instagram equivalent`

### AI-7 — Localize the web-search fallback message instead of always posting Greek
**Effort:** S · <2h · **Category:** ai

WEB_FALLBACK_MESSAGE is a hardcoded Greek string, posted verbatim whenever the web_search/price path times out/errors/returns empty — regardless of commenter language. An English or German commenter on a webSourceEnabled page gets a Greek reply auto-posted to their public comment. Pick the fallback from config.language / detectCommentLanguage (the engine already has both), or skip auto-posting a fallback when language != 'el'.

`lib/aiReplyEngine.ts (WEB_FALLBACK_MESSAGE L98-99; used L299/314/369/401/417/525)`

### INTEG-2 — Gate TikTok sandbox key/secret behind NODE_ENV so prod never silently uses sandbox creds
**Effort:** S · <2h · **Category:** integrations

Organic-TikTok code resolves creds as `TIKTOK_SANDBOX_CLIENT_KEY || TIKTOK_CLIENT_KEY` (same for secret) with NO env guard — in webhook HMAC verification, token refresh, and OAuth exchange. If a sandbox var is ever present in Vercel prod it unconditionally wins over the real prod credential, breaking webhook verification and token refresh for all live TikTok users. tiktok-ads/callback already does it right (`!!SANDBOX_BASE_URL && NODE_ENV !== 'production'`); apply the same gate to the organic path.

`lib/tiktokApi.ts (L50, L152-153), app/api/tiktok/callback/route.ts (L77-78)`

### INTEG-3 — Require explicit opt-in before auto-connecting Meta pages/IG and before automation runs on first OAuth
**Effort:** M · ½ day · **Category:** integrations

On a new user's first GET /api/facebook/pages the route silently auto-connects EVERY FB page and EVERY linked IG account and fires webhook subscriptions for each — no consent, no per-page choice. Whether the bot then auto-replies/auto-hides depends on ConnectedPage schema defaults, which webhook handlers read as `?? true` for moderation. A user connecting just to browse could have the bot posting public replies and hiding comments on a live page within seconds. Add an explicit connect/enable step and default automation OFF until opt-in.

`app/api/facebook/pages/route.ts (auto-connect + webhook subscribe L362-468), prisma defaults for autoReplyEnabled/autoModerationEnabled/autoHideNegativeEnabled`

### INTEG-4 — Fix TikTok-Ads cron watermark advancing on partial ad-group failure (drops comments)
**Effort:** M · ½ day · **Category:** integrations

In processAdvertiser a fetch failure on one ad group sets hasErrors=true and only breaks the inner page loop; the outer ad-group loop continues, and lastCommentsFetchedAt is advanced to now() whenever newComments.length>0 — even though the failed ad group's window was never fully read. Next run's `since` is the new watermark, so comments in that gap are permanently skipped. Only advance the watermark when hasErrors is false (or track per-ad-group high-water marks; on error leave the watermark to retry).

`app/api/cron/fetch-tiktok-ads-comments/route.ts (processAdvertiser L186-246)`

### INTEG-5 — Persist TikTok-Ads identity_type so scheduled/manual replies stop hardcoding TT_USER
**Effort:** M · ½ day · **Category:** integrations

On ingest, processAdsComment saves identity_id into adAccountId but drops identity_type. The immediate auto-reply passes the real identityType through, but the delayed cron poster and manual approve path both hardcode identityType:'TT_USER'. For advertisers whose identity is CUSTOMIZED_USER (a valid TikTok value), every scheduled or manually-approved reply calls comment/post with the wrong identity_type and TikTok rejects it — so delay/manual-review is broken for those accounts. Add an identityType column, store at ingest, read in both reply paths.

`app/api/cron/post-scheduled-replies/route.ts (identityType:'TT_USER' L60), app/api/comments/[id]/approve-reply/route.ts (L105), ingest drops identity_type at fetch-tiktok-ads-comments/route.ts L326, prisma/schema.prisma (new column)`

### INTEG-6 — Add organic-TikTok comment backfill cron + auto-register the webhook on connect
**Effort:** L · 1 day+ · **Category:** integrations

Organic TikTok (provider 'tiktok') is purely webhook-driven, and the callback is only registered by manually POSTing /api/tiktok/register-webhook with x-admin-secret. If that one-time step is missed or the callback URL changes, zero organic comments arrive and nothing surfaces the gap; there is no fetch-on-connect and no cron for 'tiktok' (only 'tiktok_ads'). Any comment posted before the video is known, or during a webhook outage, is lost forever. Add a scheduled backfill via fetchTikTokComments and auto-register the webhook on OAuth success (or a health check that flags unregistered state).

`app/api/tiktok/register-webhook/route.ts, app/api/tiktok/callback/route.ts, new organic-TikTok cron (parallel to fetch-tiktok-ads-comments)`

### OBS-1 — Add Sentry error monitoring (instrumentation.ts + config) — production failures are invisible
**Effort:** M · ½ day · **Category:** obs

Zero error monitoring. Every failure path (webhook exceptions, AI failures, Meta/TikTok errors, cron 401s, dropped emails, sentiment=null stuck 'pending') only writes console.error to ephemeral Vercel logs nobody watches — many fail GREEN, so outages are found by users. Install @sentry/nextjs, add instrumentation.ts + client/server config, wire DSN env, and capture exceptions in app/api/cron/* and app/api/webhooks/*. Adds SENTRY_DSN (+optional AUTH_TOKEN/ORG/PROJECT) to the env inventory.

`next.config.ts (empty stub), instrumentation.ts (new), sentry.*.config.ts (new), package.json (@sentry/nextjs); webhook + cron catch blocks`

### BILL-2 — Reconcile landing pricing + FAQ copy with billing being OFF
**Effort:** S · <2h · **Category:** billing

The landing sells Free/Pro $49/Business $80 with hard monthly quotas ('1,000 AI replies/month', etc.) and 'Start free and only pay when you need more', but every plan CTA routes to /register and no charge or quota exists — users are promised metered tiers that aren't enforced or billable. Until real billing lands, badge paid tiers 'Coming soon' (disable Get Pro/Get Business) or make clear everything is currently free. Pairs with BILL-1 so public claims are consistent.

`app/page.tsx (#pricing — all three plan CTAs link to /register), app/i18n/locales/en.json + el.json (landing.pricing.starter/pro/enterprise, subtitle 'only pay when you need more')`

### UX-1 — Replace fabricated landing-page social proof, invented metrics, and fake testimonials
**Effort:** M · ½ day · **Category:** ux

The LIVE marketing site shows placeholder 'Company 1'…'Company 5' logos, invented metrics (+200% / 50k+ / 2.5s / 99.9% and hero 10hrs+/100%), and three fabricated testimonials with fake names (Sarah Johnson / Michael Chen / Emma Rodriguez). With only ~7 real users there is nothing to substantiate these claims — false advertising and a credibility/legal risk. Remove the sections or replace with real, defensible content.

`app/page.tsx (social proof L455-468, metrics L557-579, hero stats L440-448, testimonials L748-808), app/i18n/locales/en.json + el.json (testimonial1..3, metrics.*)`

### UX-2 — Fix leftover brand name 'AI Comment Replyer' → 'Comment Closer' in footer + testimonial copy
**Effort:** S · <2h · **Category:** ux

The footer logo text reads 'AI Comment Replyer' while the rest of the app brands it 'Comment Closer'; the en.json testimonial2 quote also uses the old name. Visible on every page footer of the live site — inconsistent branding that looks unfinished. (Merge with UX-1 which also touches testimonials.)

`app/page.tsx (footer brand L906), app/i18n/locales/en.json (testimonial2.quote L192)`

### QUAL-1 — Delete dead ~680-900 line fetchAdsComments + processAutoReplyForComment in facebook/comments/route.ts
**Effort:** M · ½ day · **Category:** qual

The GET handler is now webhook-only (reads cached Comment rows, returns webhookOnly:true). fetchAdsComments and its only caller processAutoReplyForComment are dead — no live callers, only a stale code-comment reference. This is ~66% of a 1029-line file carrying a divergent auto-reply path (v24 URLs, no aiUsage metering, double-reply risk if re-wired). Delete both + now-unused imports (analyzeCommentSentiment, generateAIReply, shouldAutoReply, detectCommentLanguage).

`app/api/facebook/comments/route.ts (fetchAdsComments L13-691, processAutoReplyForComment L692-901)`

### QUAL-2 — Untrack and gitignore committed dev.db files
**Effort:** S · <2h · **Category:** qual

Two SQLite dev DBs are committed (root dev.db + prisma/dev.db, verified) though prod runs on Postgres. They are stale local artifacts (possible seeded/test rows), bloat the repo, cause noisy diffs, and are a footgun if tooling is pointed at them. .gitignore has no *.db entry. git rm --cached both and add *.db + *.db-journal to .gitignore.

`dev.db, prisma/dev.db (both confirmed present), .gitignore`

### QUAL-3 — Guard destructive dev scripts (seed-fake-*, delete-fake-comments, set-auto-reply-positive) against the prod DB
**Effort:** S · <2h · **Category:** qual

scripts/seed-fake-tiktok-ads-comments.ts writes fabricated comments against whatever DATABASE_URL is set, with no env guard — run with prod env it inserts fake 'Maria K.' comments into the LIVE DB that real users see and the AI may auto-reply to. delete-fake-comments does a blind deleteMany on commentId startsWith 'fake_'; set-auto-reply-positive.mjs does an unscoped connectedPage.updateMany that mass-flips auto-reply for ALL pages. Add a hard refusal unless NODE_ENV!=='production' / explicit ALLOW_SEED, and scope the updateMany.

`scripts/seed-fake-tiktok-ads-comments.ts, scripts/delete-fake-comments.ts, scripts/set-auto-reply-positive.mjs`

### DEPLOY-1 — Decide crons architecture: keep GH Actions cron.yml (PR#2) vs move to vercel.json crons _(PR follow-up)_
**Effort:** M · ½ day · **Category:** deploy

Scheduling lives in PR#2's cron.yml, which self-documents two weaknesses (GH scheduled runs are delayed/dropped under load; only fire from the default branch). Moving to vercel.json crons is more robust but gated by verified facts: both endpoints hard-require Authorization: Bearer $CRON_SECRET (post-scheduled-replies L186-194, fetch-tiktok-ads L23-31) which Vercel Cron supplies only if CRON_SECRET matches; fetch-tiktok-ads does its real work in after() (Vercel Cron awaits after(), so safe); both set maxDuration=60 and */5 crons need Vercel Pro (Hobby caps crons at once/day). Deliverable: a written decision in the repo, not left implicit.

`vercel.json (empty {}), .github/workflows/cron.yml (PR#2), app/api/cron/post-scheduled-replies/route.ts, app/api/cron/fetch-tiktok-ads-comments/route.ts`

### DEPLOY-2 — Retire the external cron-job.org dependency after PR#2 merges + fix the stale code comment _(needs you)_
**Effort:** S · <2h · **Category:** deploy · **Depends on:** DEPLOY-1

TikTok-Ads ingestion currently depends on an undocumented external cron-job.org account, referenced only in a code comment ('so cron-job.org doesn't timeout'). If that account lapses, ingestion silently stops with no alert. Once PR#2's cron.yml hits both endpoints, the cron-job.org job is redundant and will double-fire/double-process — delete/disable it (human, external) and update the stale comment to name the real scheduler.

`app/api/cron/fetch-tiktok-ads-comments/route.ts:84 (comment), external cron-job.org account`

### AUTH-2 — Add a `type` discriminator to VerificationToken so verify-email and reset-password tokens can't be cross-used, and scope deleteMany by type
**Effort:** M · ½ day · **Category:** auth · **Depends on:** DB-2

VerificationToken has no type column. verify-email and reset-password both look up by token value with zero type check, so a verification token can reset a password and a reset token can verify email. Compounding it, forgot-password and resend-verification both deleteMany({identifier}) — requesting one flow silently invalidates the other's pending token (a user mid-signup who clicks 'forgot password' can no longer verify). Add type ('VERIFY_EMAIL'|'PASSWORD_RESET'), stamp at creation, filter at consumption, and scope every deleteMany to {identifier, type}. Coordinate the migration with DB-2 / prod's db-push workflow.

`prisma/schema.prisma (VerificationToken L65-71), app/api/auth/{verify-email,reset-password,forgot-password,resend-verification,register}/route.ts, lib/email.ts`

### QUAL-8 — Add a test runner (Vitest) + targeted unit tests for the highest-risk pure logic
**Effort:** M · ½ day · **Category:** qual · **Depends on:** DEPLOY-3

Zero tests and no runner exist. This is a live SaaS whose core logic auto-replies and auto-moderates public comments, so untested changes directly touch customers' brand voice and hidden/deleted comments. Add Vitest + a test script, then cover the three highest-value pure/deterministic units: shouldGenerateReply (cooldowns, block/allowlist precedence, manual-review, delay — invoked from all pipelines), webhook signature verification (valid passes, tampered/short/wrong-secret fail — the trust boundary), and the PR#3 DB-backed rate limiter (window rollover, block-after-threshold, reset — currently untested and fails open). Wire into CI (DEPLOY-3).

`package.json (add test script), vitest.config.ts (new), lib/replyDecisionEngine.test.ts, lib/webhookVerification.test.ts, lib/rateLimit.test.ts`

## P2 — should do

### AI-8 — Add an attemptCount circuit breaker so permanently-failing comments stop retrying forever
**Effort:** M · ½ day · **Category:** ai · **Depends on:** AI-2

attemptCount is incremented on every logReplyAttempt but is never read. There is no retry cap, so once AI-2's backfill loop exists, a permanently-failing comment (deleted post, revoked token) would be reprocessed indefinitely, burning OpenAI + Meta quota. Add a MAX_ATTEMPTS check that moves the comment to a terminal ai_failed/needsReview once attemptCount exceeds the cap, and gate the backfill cron on it.

`lib/actionLogger.ts (updateCommentPending increments attemptCount L178-191, never read), prisma/schema.prisma L168, decision gate before generateAndPost* + the backfill cron`

### AI-9 — Implement the empty logReplyDecision() + remove dead hasPageAlreadyReplied()
**Effort:** S · <2h · **Category:** ai

logReplyDecision has an empty body but is called in all 4 pipeline entry points — so there is zero structured record of WHY a reply was allowed or which rule blocked it (skip decisions write a CommentActionLog, but allowed decisions and rule detail are invisible). Implement it to emit a structured line (ruleTriggered, allowed, reason, commentDbId) for prod debuggability, and delete the exported-but-unused hasPageAlreadyReplied.

`lib/replyDecisionEngine.ts (logReplyDecision L449-454 empty body; hasPageAlreadyReplied L418 unused), called in webhooks/{facebook,instagram,tiktok} + fetch-tiktok-ads cron`

### OBS-2 — Cache Meta Graph promotion_status + post caption per postId to cut 2-3 redundant Graph fetches per comment
**Effort:** M · ½ day · **Category:** obs

For every organic comment the FB webhook can fire up to two sequential promotion_status reads (page token then user token) plus a post-caption read — all keyed on postId, which repeats heavily since many comments land on the same post. Meta's limit is ~200 calls/user/hour; the audit projects 7,500-12,500 Graph calls/hour at 50 users. Cache per postId (short TTL — RateLimit-style DB row or in-memory LRU) so later comments on a post skip the network, cutting Graph calls ~50% and reducing AI-1's redelivery-storm risk.

`app/api/webhooks/facebook/route.ts (ad detection L147-205: existingAdComment findFirst + up to two graph.facebook.com fetches; post-caption fetch L471)`

### OBS-3 — Build an admin AI-cost/usage dashboard on the now-populated AiUsageEvent table _(PR follow-up)_
**Effort:** M · ½ day · **Category:** obs

PR#3 added AiUsageEvent + wired recordAiUsage at every OpenAI call site, but nothing reads it — the metering table is write-only. Build an admin route + card that GROUP BYs over time/model/user to show token spend and per-user cost (indexes already in place). Directly supports the billing-OFF decision by exposing real per-user AI cost.

`prisma/schema.prisma (AiUsageEvent L236-251, indexes [userId,createdAt]/[connectedPageId,createdAt]/[createdAt]), lib/aiUsage.ts (writes only); new app/api/admin/ai-usage + admin dashboard card`

### OBS-4 — Add a /api/health endpoint for uptime + DB-connectivity checks
**Effort:** S · <2h · **Category:** obs

No health/uptime check anywhere. With DB pooling, external cron schedulers, and Meta/TikTok token expiry all able to fail silently, there is no endpoint an uptime monitor can hit to confirm app + Postgres are reachable. Add a lightweight route that runs prisma.$queryRaw`SELECT 1` and returns 200/503; it also surfaces connection-pool exhaustion before users do.

`app/api/health/route.ts (new — none exists)`

### SEC-6 — Stop Instagram '0'-id test webhook from running the full pipeline against a real customer page
**Effort:** S · <2h · **Category:** security

When Meta sends a test webhook (entry.id === '0'), the handler resolves it to the most-recently-created real IG ConnectedPage (findFirst orderBy createdAt desc) and processes the change against that live page — sentiment (paid OpenAI), auto-moderation (can hide/delete), auto-reply. HMAC is verified first so a forged body is rejected, but any legitimately-signed test/replayed event mutates a real tenant's data. Short-circuit the '0' branch to a 200 no-op (or a dedicated sandbox page) and add replay protection.

`app/api/webhooks/instagram/route.ts (L70-90, handleCommentChange)`

### SEC-7 — Add security response headers via next.config.ts (HSTS, X-Frame-Options, nosniff, Referrer-Policy)
**Effort:** S · <2h · **Category:** security

next.config.ts is an empty object — the app ships none of the baseline hardening headers. Without X-Frame-Options/frame-ancestors the dashboard is clickjackable; without HSTS a first-visit downgrade is possible; Referrer-Policy matters because tokens currently ride in Graph URLs (SEC-8). Add a headers() returning HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin — keep it minimal so it doesn't break the FB/TikTok OAuth popup frames. Bundle with OBS-1's next.config work.

`next.config.ts (empty config, no headers() block)`

### SEC-8 — Stop passing Graph API access tokens as ?access_token= URL query params
**Effort:** L · 1 day+ · **Category:** security

~40 call sites build Graph URLs with the token inline as ?access_token=. Tokens in URLs leak into Vercel/CDN access logs, proxy logs, and Referer headers — exactly what you don't want in log aggregation. Meta supports Authorization: Bearer. Route all Graph calls through one fetch wrapper that puts the token in a header and keeps it out of the URL.

`app/api/facebook/comments/route.ts, app/api/facebook/pages/route.ts, app/api/facebook/comments/[commentId]/route.ts, app/api/webhooks/facebook/route.ts, app/api/webhooks/instagram/route.ts, app/api/facebook/refresh-page-tokens/route.ts`

### AUTH-3 — Add IP-based rate limiting to auth endpoints (current limiter is per-email only)
**Effort:** M · ½ day · **Category:** auth

Every limiter key is per-email (login:/forgot:/resend:<email>, backed by PR#3's RateLimit table), and /register has NO rate limit at all. An attacker can hit /register or /forgot-password with thousands of different emails from one IP to burn the Resend quota and spam-bomb inboxes. Add a companion IP-derived key (x-forwarded-for) on register/forgot/resend, and optionally couple login throttling with IP against distributed guessing.

`lib/rateLimit.ts, app/api/auth/{forgot-password,resend-verification,register}/route.ts, lib/auth.ts authorize()`

### AUTH-4 — Localize verification/reset email templates for Greek users + add a User.locale column
**Effort:** M · ½ day · **Category:** auth · **Depends on:** DB-2

Auth pages are fully i18n'd (login/register/verify/forgot), but lib/email.ts hardcodes English strings and lang='en' (verified header). A Greek user who signs up in the el UI gets English-only mails. There is no User.locale column (only replyLanguage for AI output). Add one, capture the UI locale at register time, and thread it through sendVerificationEmail/sendPasswordResetEmail to pick en/el copy.

`lib/email.ts (buildEmail L44, sendVerificationEmail L105, sendPasswordResetEmail L181), prisma/schema.prisma (User), app/register/page.tsx`

### AUTH-5 — Pin next-auth to an exact beta build and track the v5-stable migration
**Effort:** S · <2h · **Category:** auth

next-auth is on ^5.0.0-beta.30 with a caret — betas ship breaking changes between builds, so a fresh install / Vercel build can pull a newer beta and break the custom jwt/session callbacks and the Facebook-account-linking logic in lib/auth.ts (which mutates user.id inside signIn, fragile against internal changes). Drop the caret to pin exactly, track v5 stable to migrate deliberately, and revisit the `as any` cast on PrismaAdapter (lib/auth.ts:15) at upgrade time.

`package.json (next-auth ^5.0.0-beta.30), lib/auth.ts`

### UX-3 — Extract the duplicated dashboard sidebar into app/dashboard/layout.tsx
**Effort:** L · 1 day+ · **Category:** ux

The entire sidebar (logo, identical menuItems array with inline SVGs, language/theme toggles, user footer) is copy-pasted verbatim into every dashboard page instead of living in the layout (which currently only does an auth guard + {children}). Nav changes require editing 5 files and they already drift (settings uses metaAccount for the requiresPages gate while index uses connectedPages). Move it into the layout to kill hundreds of duplicated lines and the drift.

`app/dashboard/layout.tsx, app/dashboard/page.tsx (menuItems L461-513, sidebar L530-607), app/dashboard/settings/page.tsx (L372-424, L437-572), app/dashboard/comments/page.tsx, app/dashboard/pages/page.tsx, app/dashboard/status/page.tsx`

### UX-4 — Consolidate the two duplicated inbox implementations (/dashboard vs /dashboard/comments)
**Effort:** L · 1 day+ · **Category:** ux

Both /dashboard and /dashboard/comments independently reimplement the same reply/hide/unhide/delete/approve/replace logic against the same API routes, each ~1.5k lines. Behavior already diverges (TikTok branching, delete guards) and bug fixes must be applied twice. Extract shared comment-action hooks/components or pick one canonical inbox to stop the divergence.

`app/dashboard/page.tsx (handleReply/Hide/Unhide/Delete/ApproveReply/ReplaceReply L233-414), app/dashboard/comments/page.tsx (handleHide L706, handleDelete L776, handleDeleteReply L473, reply UI)`

### UX-5 — Add profile + password-management UI to dashboard settings
**Effort:** M · ½ day · **Category:** ux

Settings jumps straight from connected accounts to the danger-zone delete-account flow — there is no way to change name, email, or password in-app. Credential (NextAuth) users who rotate a password have no path. Add a basic profile + change-password section.

`app/dashboard/settings/page.tsx`

### UX-6 — Harden the onboarding Facebook-return flow that relies on nested setTimeout races
**Effort:** M · ½ day · **Category:** ux

After the FB OAuth redirect the step-2 effect waits a hardcoded 3000ms then calls refreshTokenAndFetchPages, which awaits another 1000ms then a nested 1000ms re-fetch. On slower networks NextAuth may not have persisted the token yet, so pages come back empty and the user hits a false 'No Pages Found'; on fast ones it just adds a 5s stall. Replace the timing guesses with poll/retry-until-ready (await the session/token being present) so discovery is deterministic.

`app/dashboard/onboarding/page.tsx (OAuth-hash handler L160-187, refreshTokenAndFetchPages L189-210, step-3 advance L325-362)`

### UX-7 — Wire up or remove the dead 'Watch Demo' hero button + '#' placeholder footer links + dashboard bell
**Effort:** S · <2h · **Category:** ux

Several prominent no-op controls on live surfaces erode trust: the hero 'Watch Demo' button has no onClick/href; nearly every footer link is href='#' (Documentation/API/About/Blog/Careers/Terms/Security/GDPR + both social icons) even though a real /terms page exists; the dashboard header bell shows a red dot when needsReview>0 but does nothing on click. Point Terms at /terms, wire or remove the rest.

`app/page.tsx ('Watch Demo' L418-424; footer links L918-975 incl. Terms→'#' though /terms exists), app/dashboard/page.tsx (notification bell L624-627)`

### DEPLOY-4 — Create .env.example documenting all ~28 env vars (with sandbox/prod gotchas)
**Effort:** S · <2h · **Category:** deploy

No .env.example and no README exist; env vars are only recoverable by grep, so a new dev (or the owner on a fresh machine) cannot boot the app or configure Vercel. Document the full inventory (DATABASE_URL, NEXTAUTH_URL/SECRET, AUTH_URL, OPENAI_API_KEY, RESEND_API_KEY, EMAIL_FROM, CRON_SECRET, ADMIN_SECRET, FACEBOOK_* incl. NEXT_PUBLIC + webhook verify tokens, GOOGLE_*, TIKTOK_* incl. sandbox keys and the ADS/ACCOUNTS redirect+base URLs, plus platform VERCEL_URL/NODE_ENV, and later SENTRY_DSN). Call out the two live traps: TIKTOK_SANDBOX_* unconditionally overrides prod creds when set (see INTEG-2), and TIKTOK_ADS_REDIRECT_URI must be prod in Vercel but localhost locally. List Stripe vars as reserved/OFF.

`.env.example (new)`

### DEPLOY-5 — Write a README + ops runbook (build/deploy/db-safety/cron/secrets)
**Effort:** M · ½ day · **Category:** deploy · **Depends on:** DEPLOY-4

No README exists and the most dangerous ops facts live only in .env header comments: DATABASE_URL points at LIVE prod, db:migrate can offer to wipe it (DB-1), migration history is drifted so migrate deploy on a fresh DB is broken (DB-2), prod is maintained via db push + hand SQL. A runbook must cover local setup (db push against a SEPARATE dev DB, never migrate), how crons are scheduled (cron.yml / CRON_SECRET must match Vercel), secret rotation, and the Vercel project (team comment-closer, prod www.commentcloser.com) — preventing an accidental prod wipe.

`README.md (new), package.json scripts, .env`

### DEPLOY-6 — Document connection_limit / pooling + a safe throwaway local dev-DB workflow
**Effort:** S · <2h · **Category:** deploy · **Depends on:** DEPLOY-4

On Vercel serverless with db.prisma.io, DATABASE_URL should carry a connection_limit (and a pooled vs direct URL for migrations) or instances exhaust connections — nothing in the repo captures this (also the audit's #1 breaking point). Show the ?connection_limit= / pooled-URL convention in .env.example and document spinning up a throwaway local/branch Postgres to validate migrations without touching prod — a prerequisite for validating DB-2.

`.env.example, README, CLAUDE.md`

### QUAL-4 — Delete dead auth scaffolding: contexts/AuthContext.tsx and lib/authMock.ts
**Effort:** S · <2h · **Category:** qual

Both are fully unreferenced (zero imports across app/, lib/, components/). AuthContext.tsx is a localStorage fake-auth provider predating NextAuth v5; authMock.ts is a setTimeout mock login/register/reset with special-case strings like email.includes('fail'). Misleading in a real NextAuth+Prisma repo and a security-smell if ever wired up. Delete outright.

`contexts/AuthContext.tsx, lib/authMock.ts`

### QUAL-5 — Log errors instead of swallowing them in facebook/comments/route.ts catch blocks
**Effort:** S · <2h · **Category:** qual · **Depends on:** QUAL-1

The GET handler's catch has empty `if (error instanceof Error) {} else {}` branches — errors are discarded with no logging before a generic 500, so real DB/auth failures are invisible in prod logs (blind incident triage). A second empty catch sits at L896. Log the error before returning 500 and remove the no-op branches. Overlaps QUAL-1's dead-code cleanup of the same file — do together.

`app/api/facebook/comments/route.ts (empty if/else catch L1012-1027, empty catch L896)`

### QUAL-6 — Remove committed one-off artifacts and vendored TikTok docs dump
**Effort:** S · <2h · **Category:** qual

A generated audit HTML, a throwaway tmp-backfill.sql, an unimported 12KB examples file, and a ~700KB copy-pasted TikTok vendor-docs directory are all tracked at repo root but are dev-only/reference material that confuses newcomers about what is live. Delete them (keep tmp-backfill.sql content in a PR note if the backfill is still pending; relocate docs to a wiki if kept).

`scalability-audit-report.html, tmp-backfill.sql, examples/ai-reply-examples.ts, 'TikTok For Business Developers Docs/' (~700KB)`

### QUAL-7 — Replace `as any` casts on OpenAI calls with typed params (upgrade SDK)
**Effort:** M · ½ day · **Category:** qual

5 `as any` casts hide OpenAI request shapes (reasoning_effort / reasoning:{effort}, responses.create with tools:[{type:'web_search_preview'}], gpt-5 model ids) because the installed SDK doesn't type them. The cast defeats type-checking on exactly the fields most likely to break on an SDK/model change. Upgrade the openai SDK to a version that types the Responses API + reasoning effort and remove the casts, or define narrow typed request interfaces. Ties into lib/aiConfig.ts overrides.

`lib/aiReplyEngine.ts (L222/295/385/623), lib/openai.ts (L119), lib/aiConfig.ts, package.json (openai ^4.104.0)`

### BILL-3 — Add Prisma billing models (Subscription / plan / quota fields on User) + migration
**Effort:** M · ½ day · **Category:** billing · **Depends on:** DB-2

BILLING-BUILD (billing is OFF; capture for when turned on). Schema has no plan/subscription/customer/quota concept (only User.role). The already-written i18n (dashboard.userBilling free/pro/business, renewsOn, cancelsOn, paymentFailed; billingBanner pastDue) implies exactly these fields — model them to match. Coordinate the migration with the DB-2 re-baseline given the drift.

`prisma/schema.prisma (extend User: stripeCustomerId, plan enum FREE/PRO/BUSINESS, subscriptionStatus, currentPeriodEnd, cancelAtPeriodEnd; add Subscription model), new prisma/migrations/*`

### BILL-4 — Implement Stripe checkout + billing portal + webhook handler
**Effort:** L · 1 day+ · **Category:** billing · **Depends on:** BILL-3

BILLING-BUILD. stripe@22 + @stripe/stripe-js + react-stripe-js are in package.json but imported nowhere (dead deps). STRIPE_SECRET_KEY, publishable, webhook secret, and PRO/BUSINESS price IDs already exist in Vercel — billing is half-provisioned with no code. Build the money-movement layer; the webhook must be the source of truth flipping User.plan/subscriptionStatus so quota + banner can read it. The Stripe webhook needs raw-body handling in the Next 16 route (bypass JSON parsing).

`lib/stripe.ts (new), app/api/billing/checkout/route.ts, app/api/billing/portal/route.ts, app/api/webhooks/stripe/route.ts (raw-body signature verify → write plan+status to User)`

### BILL-5 — Enforce monthly comment quota in the pipeline, counting AiUsageEvent per billing period
**Effort:** M · ½ day · **Category:** billing · **Depends on:** BILL-4

BILLING-BUILD. The pricing model is per-plan monthly AI-handled comments (Free 50 / Pro 1,000 / Business 2,000) but nothing counts or caps usage. AiUsageEvent (PR#3, indexed [userId,createdAt]) already records one row per billed AI call, and all call sites thread AiUsageContext{userId,connectedPageId,source}, so a helper can count this-period events per user and gate. replyDecisionEngine runs before generateAIReply (DB-read-only, no side-effects) — the right insertion point for a quota_exceeded rule; sentiment call sites (which also cost money) need a pre-check too. Emit the existing aiSkipReason/CommentActionLog on skip.

`lib/replyDecisionEngine.ts (quota rule before generateAIReply), lib/quota.ts (new), sentiment call sites in app/api/webhooks/{facebook,instagram,tiktok}/route.ts + fetch-tiktok-ads cron + approve path`

### BILL-6 — Build the user Billing & Plan dashboard panel wiring the already-translated i18n
**Effort:** M · ½ day · **Category:** billing · **Depends on:** BILL-4

BILLING-BUILD. A complete bilingual (en+el) billing UI design already exists in the locale files — dashboard.userBilling (~50 keys: currentPlan, usedThisMonth/remaining/of, manageSubscription, upgradeToBusiness, choosePlanTitle), dashboard.billingBanner, dashboard.pricing.plans — but NOT ONE key is referenced by any .tsx. Only the components + status API that read the new billing models and AiUsageEvent counts remain; drives users to checkout/portal. (This is the UI half of the deliberately-OFF billing decision.)

`app/dashboard/billing/ or settings billing section (new), app/dashboard/page.tsx (mount billingBanner cardRequired/limitReached/pastDue), app/api/billing/status/route.ts (plan, used-this-month from AiUsageEvent, remaining, period end)`

### DEPLOY-7 — Verify PR#3's AiUsageEvent/RateLimit migration survives the DB-2 re-baseline as a valid ordered migration _(PR follow-up)_
**Effort:** S · <2h · **Category:** deploy · **Depends on:** DB-2

PR#3's migration used CREATE TABLE/INDEX IF NOT EXISTS and was applied through the drifted flow, so it works today. But on a truly fresh migrate deploy the earlier migrations still leave the DB wrong. When DB-2 lands, ensure AiUsageEvent + RateLimit are represented in the new baseline (or this migration is re-ordered after it) and drop the IF NOT EXISTS guards so the history is honest rather than idempotent-patched.

`prisma/migrations/20260706120000_add_ai_usage_and_rate_limit/migration.sql`

## P3 — nice to have

### OBS-5 — Replace ILIKE '%term%' comment/user search with pg_trgm GIN or tsvector full-text search
**Effort:** M · ½ day · **Category:** obs · **Depends on:** DB-2

Both search paths use Prisma contains + mode:'insensitive' → ILIKE '%term%', a full table scan no B-tree can serve (audit: ~500ms at 100K rows, 2-5s beyond). Fine at 600 comments today, but it will not scale. Add pg_trgm + a GIN index on Comment.message/authorName (and User.name/email) via a hand-written SQL migration reconciled with prod (history is drifted — do after DB-2), or switch to a tsvector column.

`app/api/comments/all/route.ts (message/authorName contains L149-150), app/api/admin/users/route.ts (name/email contains L31-32)`

### OBS-6 — Add short-TTL caching for dashboard + admin metric aggregate queries
**Effort:** M · ½ day · **Category:** obs

Zero caching. comments/all is force-dynamic and fires ~10 aggregate COUNT/groupBy per dashboard load; admin/users fires ~12 counts + two timeline aggregates. With N users refreshing, that is N*10 concurrent connection-holding queries against a pool capped at connection_limit — the audit's ~30-50-concurrent-user breaking point. These metrics don't need real-time; wrap in a short-TTL cache (unstable_cache 15-60s revalidate, or Vercel KV). No cache dep installed yet.

`app/api/comments/all/route.ts (10-way Promise.all count/groupBy L172-246, force-dynamic), app/api/admin/users/route.ts (12-way Promise.all + two $queryRaw timelines L106-132)`

### AUTH-6 — Add welcome + manual-review notification emails (and remove/wire the dead billingButton helper)
**Effort:** M · ½ day · **Category:** auth

The product runs manual-review/moderation workflows but sends zero transactional email beyond verify+reset — no welcome after verification, and no 'a comment needs your manual review' notification, so users must keep the dashboard open to catch flagged comments. Add sendWelcomeEmail after successful verification and a review-notification path. The billingButton() helper is dead scaffolding for the OFF billing feature — remove it now or wire it when billing lands (BILL-6).

`lib/email.ts (only sendVerificationEmail + sendPasswordResetEmail exist; billingButton L167 unused), app/api/auth/verify-email/route.ts:42`

### BILL-7 — Add STRIPE_* / NEXT_PUBLIC_STRIPE_* to .env.example + document billing setup once implemented
**Effort:** S · <2h · **Category:** billing · **Depends on:** DEPLOY-4

BILLING-BUILD follow-up. Stripe vars are set in Vercel but absent from local .env, so a new dev cannot run/test billing. When .env.example is created (DEPLOY-4), include the Stripe keys with placeholders and a note that billing is currently OFF.

`.env.example, README`

### BILL-8 — Align pricing tier naming across UI, i18n, and Stripe price IDs; build or hide the admin revenue view
**Effort:** M · ½ day · **Category:** billing · **Depends on:** BILL-4

BILLING-BUILD, lowest priority. The pricing UI intent says Starter/Pro/Enterprise while i18n names them Free/Pro/Business and Vercel has PRO/BUSINESS price IDs — pick one canonical tier set so UI, JSON, and Stripe map cleanly. Separately, admin.billing i18n (title 'User Subscriptions & Revenue', mrr/arr/payingCustomers, self-describing comingSoon) is referenced by zero code and there is no /api/admin/billing route; either surface MRR/ARR from Subscription data once billing exists or leave the intentional comingSoon placeholder. Captured so it isn't lost.

`app/page.tsx (pricing L581-745), app/i18n/locales/en.json+el.json (pricing L149-186), app/admin/page.tsx, i18n admin.billing`

### QUAL-9 — Delete orphaned i18n sections and dead deps (Stripe deps only if billing stays OFF)
**Effort:** S · <2h · **Category:** qual

The live landing reads only the 'landing.*' namespace; the top-level hero/howItWorks/benefits/trust/cta sections are referenced by no t() call (leftovers from an earlier structure) — remove from both locale files to keep en/el in sync. The three Stripe deps are imported nowhere; if the owner confirms billing stays OFF for now, remove them (and the dead billingButton, per AUTH-6) to drop install weight and a false 'billing exists' signal. Do NOT remove the Stripe deps if BILL-4 is imminent.

`app/i18n/locales/en.json + el.json (top-level hero/howItWorks/benefits/trust/cta), package.json (stripe, @stripe/stripe-js, @stripe/react-stripe-js), lib/email.ts (billingButton)`

### SEC-9 — Harden the dev fail-open in webhook signature verification (fail-closed unless an explicit dev flag) _(PR follow-up)_
**Effort:** S · <2h · **Category:** security

Both verifiers return `NODE_ENV !== 'production'` (fail-OPEN) when the app secret env var is unset. Defensible for local dev, but it means the whole check hinges on NODE_ENV if a secret is ever accidentally missing in a deployed env. Tighten to fail-closed unless an explicit ALLOW_UNSIGNED_WEBHOOKS dev flag is set. Follow-up to the verification PR#1/PR#2 added but kept env-driven fail-open.

`lib/webhookVerification.ts (L24-30), lib/tiktokApi.ts (verifyTikTokWebhookSignature secret-missing branch)`

### SEC-10 — Short-circuit app/api/debug/* to 404 in production (on top of the existing admin gate) _(PR follow-up)_
**Effort:** S · <2h · **Category:** security

PR#1 correctly added requireAdmin() to the debug routes (and subscribe-webhooks POST). This is a verification+defense-in-depth follow-up: confirm none regressed, and short-circuit the whole app/api/debug/* tree to 404 when NODE_ENV==='production' unless an explicit DEBUG_ROUTES_ENABLED flag is set — these endpoints enumerate every connected page, token presence, and IG business account id, so they shouldn't exist in prod at all.

`app/api/debug/{subscribe-webhooks,webhook-diagnostics,latest-comments,webhook-config,webhook-test}/route.ts`

## Already shipped in the open PRs (out of scope)

- PR#1 (security/p0-patch-batch): auth/admin gates on set-linking-user, facebook/link-account, debug/user-accounts, webhooks/debug, test-facebook-config, debug-token (+no raw token); login rate-limit in authorize(); suggest-reply ownership check; removed hardcoded ad account act_269316045245432.
- PR#2 (fix/cron-schedulers): .github/workflows/cron.yml hitting both cron endpoints every 5 min with Bearer CRON_SECRET, fails loud; CRON_SECRET repo secret set.
- PR#3 (improve/post-p0-hardening): AI cost cut (sentiment gpt-5-mini, replies gpt-5 low-effort, lib/aiConfig.ts overrides, output caps); AiUsageEvent table + lib/aiUsage.ts wired at all call sites; TikTok reply-path fixes (organic branch in post-scheduled-replies, tiktok_ads branch in approve-reply); email hardening in lib/email.ts (Resend error check, fail-loud in prod, warn on onboarding@resend.dev, dev logs link) + resend-verification try/catch+limit; durable DB-backed RateLimit table replacing in-memory; migration 20260706120000 applied to prod; OpenAI key rotated + prod redeployed.
