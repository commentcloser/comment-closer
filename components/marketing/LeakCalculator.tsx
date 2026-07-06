"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------
   LeakCalculator — ADDITIONS-SPEC §2. Interactive slider that makes
   the loss of an unmanaged comment section personal: drag monthly ad
   spend, watch what bleeds out (danger red), how many sales walk away,
   and what Comment Closer recovers (success green). The card is the
   section's ONE glow object (shadow-pop rim). Illustrative math, honest
   — the disclaimer covers it. Fully deterministic; no random/date.
   ------------------------------------------------------------------ */

export function LeakCalculator() {
  const { t, i18n } = useTranslation();
  const [spend, setSpend] = useState(3000); // EUR/month, range 500–30000 step 100

  const wasted = Math.round(spend * 0.18); // ~18% undermined by an unmanaged section
  const lostSales = Math.max(1, Math.round(wasted / 60)); // ~€60 value per lost order
  const recovered = Math.round(wasted * 0.9);

  const fmt = (n: number) =>
    new Intl.NumberFormat(
      i18n.language?.startsWith("el") ? "el-GR" : "en-IE",
      { style: "currency", currency: "EUR", maximumFractionDigits: 0 }
    ).format(n);

  return (
    <>
      {/* THE single glow object of this section */}
      <div className="rounded-frame border border-line bg-surface p-6 md:p-10 shadow-pop rim">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* LEFT — the control */}
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-muted">
              {t("landing.calc.spendLabel")}
            </div>
            <div className="mt-3 font-mono font-bold tabular-nums text-[clamp(2rem,4vw,2.75rem)] text-ink">
              {fmt(spend)}
            </div>
            <input
              type="range"
              min={500}
              max={30000}
              step={100}
              value={spend}
              onChange={(e) => setSpend(Number(e.target.value))}
              aria-label={t("landing.calc.spendLabel")}
              className="mt-6 w-full accent-[var(--u-accent)] cursor-pointer"
            />
            <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-ink-muted tabular-nums">
              <span>{fmt(500)}</span>
              <span>{fmt(30000)}</span>
            </div>
          </div>

          {/* RIGHT — the damage */}
          <div>
            {/* 1 · bleeding out */}
            <div className="flex items-baseline justify-between gap-4 border-b border-line py-4">
              <div>
                <div className="text-[15px] text-ink">
                  {t("landing.calc.wastedLabel")}
                </div>
                <div className="text-[13px] text-ink-muted mt-1">
                  {t("landing.calc.wastedNote")}
                </div>
              </div>
              <div className="shrink-0 text-right whitespace-nowrap">
                <span className="font-mono font-black tabular-nums text-[clamp(1.75rem,3.5vw,2.5rem)] text-danger">
                  {fmt(wasted)}
                </span>
                <span className="ml-1 text-[12px] text-ink-muted">
                  {t("landing.calc.perMonth")}
                </span>
              </div>
            </div>

            {/* 2 · sales walking away */}
            <div className="flex items-baseline justify-between gap-4 border-b border-line py-4">
              <div>
                <div className="text-[15px] text-ink">
                  {t("landing.calc.lostLabel")}
                </div>
                <div className="text-[13px] text-ink-muted mt-1">
                  {t("landing.calc.lostNote")}
                </div>
              </div>
              <div className="shrink-0 text-right whitespace-nowrap">
                <span className="font-mono font-black tabular-nums text-[clamp(1.5rem,3vw,2rem)] text-danger">
                  ~{lostSales}
                </span>
              </div>
            </div>

            {/* 3 · Comment Closer recovers */}
            <div className="flex items-baseline justify-between gap-4 border-b-0 py-4">
              <div>
                <div className="text-[15px] text-ink">
                  {t("landing.calc.recoverLabel")}
                </div>
                <div className="text-[13px] text-ink-muted mt-1">
                  {t("landing.calc.recoverNote")}
                </div>
              </div>
              <div className="shrink-0 text-right whitespace-nowrap">
                <span className="font-mono font-black tabular-nums text-[clamp(1.75rem,3.5vw,2.5rem)] text-success">
                  {fmt(recovered)}
                </span>
                <span className="ml-1 text-[12px] text-ink-muted">
                  {t("landing.calc.perMonth")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Below the card, full width */}
      <p className="text-[12px] text-ink-muted mt-4">
        {t("landing.calc.disclaimer")}
      </p>
      <a
        href="/register"
        className="btn-cta mt-6 inline-flex h-12 px-6 rounded-btn items-center gap-2 text-[15px] font-semibold"
      >
        {t("landing.calc.cta")}
        <svg
          className="size-4"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 8h11m-4-4 4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </>
  );
}

export default LeakCalculator;
