"use client";

import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------
   CompareTable — CONVERSION-ADDITIONS-SPEC §3 "THE CHOICE".
   A 6-row comparison of three ways to handle comments:
   "Ignore them" / "Moderate by hand" / "Comment Closer". The first
   two columns read as red/muted ✗ liabilities; the Comment Closer
   column is green ✓ and visually emphasized (accent-wash + accent
   border) so the eye is pulled to it and NOT using the product feels
   foolish. Horizontally-scroll-safe on mobile (overflow-x-auto +
   min-w). All visible strings come from t('landing.compare.*') — zero
   hardcoded copy. Deterministic: no Math.random()/Date.now(). Real
   text content, not aria-hidden.
   ------------------------------------------------------------------ */

const K = "landing.compare.";

const ROWS = [1, 2, 3, 4, 5, 6] as const;

/* Shared 4-column track so header + every row align pixel-for-pixel. */
const GRID = "grid grid-cols-[1.4fr_1fr_1fr_1.1fr]";

/* Red ✗ for "ignore", muted ✗ for "manual". */
function CrossIcon({ tone }: { tone: "danger" | "muted" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className={`size-4 shrink-0 ${
        tone === "danger" ? "text-danger" : "text-ink-muted"
      }`}
    >
      <path
        d="M6 6l8 8M14 6l-8 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Green ✓ for the Comment Closer column. */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="size-4 shrink-0 text-success"
    >
      <path
        d="M4 10l4 4 8-9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CompareTable() {
  const { t } = useTranslation();

  return (
    <div>
      {/* horizontally-scroll-safe on mobile; table keeps a readable min width */}
      <div className="mt-12 overflow-x-auto">
        <div className="min-w-[680px]">
          {/* ---------- header row ---------- */}
          <div className={GRID}>
            {/* empty corner cell aligned with the label column */}
            <div className="px-1 py-4" />
            <div className="px-2 py-4 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-ink-muted">
              {t(K + "colIgnore")}
            </div>
            <div className="px-2 py-4 text-center font-mono text-[12px] uppercase tracking-[0.12em] text-ink-muted">
              {t(K + "colManual")}
            </div>
            {/* the emphasized "us" column header — top cell of the accent wash */}
            <div className="rounded-t-card border-x border-t border-accent/30 bg-accent-wash/40 px-3 py-4 text-center">
              <span className="inline-flex items-center justify-center gap-2 font-bold text-accent">
                <span className="tick3" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t(K + "colUs")}
              </span>
            </div>
          </div>

          {/* ---------- data rows ---------- */}
          {ROWS.map((n, idx) => {
            const isLast = idx === ROWS.length - 1;
            return (
              <div
                key={n}
                className={`${GRID} items-center border-t border-line`}
              >
                {/* col1 — the thing being compared */}
                <div className="px-1 py-4 pr-3 text-[14px] font-medium text-ink md:text-[15px]">
                  {t(`${K}row${n}.label`)}
                </div>

                {/* col2 — ignore (red ✗) */}
                <div className="flex items-center justify-center gap-2 px-2 py-4 text-center">
                  <CrossIcon tone="danger" />
                  <span className="text-[13px] text-ink-muted">
                    {t(`${K}row${n}.ignore`)}
                  </span>
                </div>

                {/* col3 — manual (muted ✗) */}
                <div className="flex items-center justify-center gap-2 px-2 py-4 text-center">
                  <CrossIcon tone="muted" />
                  <span className="text-[13px] text-ink-muted">
                    {t(`${K}row${n}.manual`)}
                  </span>
                </div>

                {/* col4 — Comment Closer (green ✓), emphasized wash column */}
                <div
                  className={`flex items-center justify-center gap-2 border-x border-accent/30 bg-accent-wash/40 px-3 py-4 text-center ${
                    isLast ? "rounded-b-card border-b" : ""
                  }`}
                >
                  <CheckIcon />
                  <span className="text-[13px] font-medium text-ink md:text-[14px]">
                    {t(`${K}row${n}.us`)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- verdict — bold loss-aversion statement ---------- */}
      <p className="mt-10 font-display font-black leading-[1.1] tracking-[-0.02em] text-[clamp(1.5rem,3.5vw,2.5rem)] text-ink text-balance">
        {t(K + "verdict")}
      </p>
    </div>
  );
}
