<!-- Copilot / AI agent guidance for the ai-comment-mvp codebase -->
# Quick orientation for AI coding agents

This is a small Next.js (app directory) TypeScript project. Use this file as the primary source of repo‑specific conventions, entry points, and examples when making edits or suggestions.

Key facts
- Framework: Next.js (app router) — see `app/layout.tsx` and `app/page.tsx`.
- Language: TypeScript (strict) — see `tsconfig.json`.
- Styling: Tailwind + PostCSS. Global styles are in `app/globals.css` and PostCSS config in `postcss.config.mjs`.
- Fonts: uses `next/font/google` (see `app/layout.tsx` — Geist fonts are exposed as CSS vars).
- Images: static assets in `public/` and served via `next/image` (see `app/page.tsx`).

Build & developer commands (source: `package.json`)
- npm run dev — start dev server (Next dev on :3000)
- npm run build — production build
- npm run start — run built app
- npm run lint — runs `eslint` (eslint config is in `eslint.config.mjs`)

Repository conventions and patterns to respect
- App router / server components: files under `app/` are by default server components. Only add `"use client"` at the top of a file when you need client-side hooks/effects or browser-only APIs.
- Root layout: `app/layout.tsx` provides site metadata and loads fonts via CSS variables — prefer updating metadata there for site-wide changes.
- Pages: `app/page.tsx` is the entry UI; small, presentational React components are preferred. Put shared UI under a new `app/components/` folder.
- CSS variables: fonts and color tokens are defined in `app/globals.css`; prefer using those variables instead of hard-coded colors.
- Type imports / path alias: `@/*` maps to project root (see `tsconfig.json`). Use `@/components` etc. when importing from root.

Linting & formatting
- ESLint uses `eslint-config-next` and TypeScript rules via `eslint.config.mjs`. The `lint` script runs `eslint` without arguments — pass file/dir args locally when needed (e.g., `npx eslint app --ext .ts,.tsx`).

What to look for when changing code
- If you add client interactivity (useState, useEffect, event handlers), mark the file with `"use client"` and limit client components to the smallest subtree.
- When adding images, put them in `public/` and use `next/image` with explicit width/height or `priority` only for critical assets (see `app/page.tsx`).
- Avoid adding server-only logic into client files; keep API routes or server calls in server components or dedicated API endpoints.

Examples (explicit references)
- Server component example: `app/page.tsx` — basic presentational UI, no `"use client"`.
- Root layout and font usage: `app/layout.tsx` — shows Geist font variables and `Metadata` export.
- Global styles: `app/globals.css` — color variables and Tailwind import.

Edge cases / gotchas observed
- `lint` script is simply `eslint` — CI or developer runs should provide target paths or rely on editor integration.
- No test runner is configured in the repository; do not assume unit tests exist.
- Next config is minimal (`next.config.ts`) — platform and runtime settings are likely handled by Vercel defaults.

If you are an AI assistant making edits
- Keep changes minimal and targeted. Reference the exact files you change in your PR description.
- Run the dev server locally (`npm run dev`) after non-trivial edits to verify rendering and TypeScript errors.
- Prefer adding small, focused commits (one feature or fix per PR) and include a short manual test plan in the PR body (what to click, what page to visit).

If something appears missing or unclear, ask the maintainer to confirm: typical items that need confirmation are CI lint command, preferred testing framework, and deployment target beyond Vercel.

---
If you'd like, I can (1) add a short PR template referencing these checks, or (2) expand this guidance with suggested eslint/run commands for CI. Tell me which and I will update.
