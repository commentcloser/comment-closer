"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useTranslation } from "react-i18next";

/* ------------------------------------------------------------------
   TakeoverDemo — DESIGN-SPEC-V2 §4.1 "THE MONEY SHOT".
   ~30s seamless 4-phase loop:
     P1 THE BLEED   (0–10s)  toxic comments land, gauge drains, € burns
     P2 THE SWEEP   (10–13s) scanline classifies every comment
     P3 THE CLOSE   (13–24s) negatives hidden, replies typed
     P4 HOLD        (24–30s) clean feed holds, verdict, fade → loop
   Decorative (root aria-hidden), but every visible string comes from
   t('landing.hero.demo.*') — zero hardcoded copy. Deterministic: no
   Math.random(), no Date.now() in render. Transform/opacity-only
   animation except the sanctioned one-at-a-time layout collapses.
   Reduced motion: static phase-4 end state + Before/After buttons.
   ------------------------------------------------------------------ */

const K = "landing.hero.demo.";

const STEP_MS = 100;
const LOOP_MS = 30000;

/* Deterministic timeline (ms from loop start). */
const T = {
  arrive: [600, 2200, 3800, 5400, 7000],
  sweep: 10000,
  chips: [10400, 10900, 11400, 11900, 12400],
  close: 13000,
  strike: [13200, 14800, 16400],
  collapse: [13900, 15500, 17100],
  replyStart: [18200, 20200], // c4, c5
  replyChip: [19600, 21800],
  hold: 24000,
  fade: 29400,
};

const GAUGE = { start: 0.55, drainPer: 0.13, high: 0.9 };
/* half-circle arc, r=48 → length ≈ π·48 */
const ARC_LEN = 150.8;
const MONEY = { wasted: 47.2, recovered: 63.9 };

type Kind = "negative" | "question" | "positive";

interface CommentDef {
  key: string;
  kind: Kind;
  replyKey?: string;
}

const COMMENTS: CommentDef[] = [
  { key: "c1", kind: "negative" },
  { key: "c2", kind: "negative" },
  { key: "c3", kind: "negative" },
  { key: "c4", kind: "question", replyKey: "r4" },
  { key: "c5", kind: "positive", replyKey: "r5" },
];

/* First letter of the localized comment = the avatar initial (no name
   strings exist in the copy spec; deriving from t() keeps it localized). */
function initialOf(text: string): string {
  const m = text.match(/\p{L}/u);
  return m ? m[0].toUpperCase() : "•";
}

/* ---------------------------- pieces ----------------------------- */

function SentimentChip({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const variant =
    kind === "negative"
      ? "stamp--danger"
      : kind === "positive"
        ? "stamp--success"
        : "";
  const label =
    kind === "negative"
      ? "chipNegative"
      : kind === "question"
        ? "chipQuestion"
        : "chipPositive";
  return (
    <span className={`stamp stamp--animate shrink-0 ${variant}`}>
      {t(K + label)}
    </span>
  );
}

function CommentAvatar({ ch }: { ch: string }) {
  return (
    <span className="size-7 shrink-0 rounded-full border border-accent/20 bg-accent-wash flex items-center justify-center font-mono text-[11px] text-accent">
      {ch}
    </span>
  );
}

function TypedText({ text }: { text: string }) {
  const chars = useMemo(() => Array.from(text), [text]);
  return (
    <span className="text-[13px] leading-snug text-ink-muted">
      {chars.map((ch, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.024, duration: 0.02 }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

function ReplyBlock({
  replyKey,
  typed,
  showChip,
}: {
  replyKey: string;
  typed: boolean;
  showChip: boolean;
}) {
  const { t } = useTranslation();
  const text = t(K + replyKey);
  return (
    <div className="mt-2 ml-8 flex items-start gap-2 rounded-card border border-line bg-surface p-2.5">
      <span className="size-6 shrink-0 rounded-full ring-2 ring-accent/70 [background:var(--u-grad-cta)]" />
      <div className="min-w-0 flex-1">
        {typed ? (
          <TypedText text={text} />
        ) : (
          <span className="text-[13px] leading-snug text-ink-muted">
            {text}
          </span>
        )}
      </div>
      {showChip && (
        <span className="stamp stamp--success stamp--animate shrink-0">
          {t(K + "chipReplied")}
        </span>
      )}
    </div>
  );
}

/* SVG half-arc ROAS gauge — strokeDasharray/offset driven by a shared
   MotionValue (live) or a plain number (static end states). */
function Gauge({
  offset,
  tone,
}: {
  offset: MotionValue<number> | number;
  tone: "danger" | "success";
}) {
  const d = "M 12 62 A 48 48 0 0 1 108 62";
  return (
    <svg viewBox="0 0 120 70" className="w-[92px] h-[54px]" fill="none">
      <path
        d={d}
        className="stroke-line"
        strokeWidth={8}
        strokeLinecap="round"
      />
      <motion.path
        d={d}
        className="stroke-danger"
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={ARC_LEN}
        style={{ strokeDashoffset: offset }}
        initial={false}
        animate={{ opacity: tone === "danger" ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      />
      <motion.path
        d={d}
        className="stroke-success"
        strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={ARC_LEN}
        style={{ strokeDashoffset: offset }}
        initial={false}
        animate={{ opacity: tone === "success" ? 1 : 0 }}
        transition={{ duration: 0.6 }}
      />
    </svg>
  );
}

function CardHeader({
  active,
  gaugeOffset,
  gaugeTone,
  moneyNode,
}: {
  active: boolean;
  gaugeOffset: MotionValue<number> | number;
  gaugeTone: "danger" | "success";
  moneyNode: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <span
          key={active ? "on" : "off"}
          className={`stamp stamp--animate ${active ? "" : "stamp--danger"}`}
        >
          {t(K + (active ? "statusActive" : "statusUnmanaged"))}
        </span>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="size-9 shrink-0 rounded-full [background:var(--u-grad-cta)]" />
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink leading-tight truncate">
              {t(K + "brandName")}
            </div>
            <div className="font-mono text-[10px] text-ink-muted">
              {t(K + "sponsored")}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold tracking-[0.12em] text-ink-muted">
            {t(K + "meterLabel")}
          </span>
          <span className="font-mono text-[9px] text-ink-muted border border-line rounded-full px-1.5">
            {t(K + "simulation")}
          </span>
        </div>
        <Gauge offset={gaugeOffset} tone={gaugeTone} />
        {moneyNode}
      </div>
    </div>
  );
}

function VerdictBar({
  unanswered,
  hidden,
  replied,
  cleanHighlight,
}: {
  unanswered: number;
  hidden: number;
  replied: number;
  cleanHighlight: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-line px-4 py-2.5 font-mono text-[11px] text-ink-muted">
      <span>
        {unanswered} {t(K + "unansweredLabel")}
      </span>
      <span>·</span>
      <span>
        {hidden} {t(K + "hiddenLabel")}
      </span>
      <span>·</span>
      <span>
        {replied} {t(K + "repliedLabel")}
      </span>
      <span>·</span>
      <span className={cleanHighlight ? "text-success" : ""}>
        {t(K + "cleanLabel")}
      </span>
    </div>
  );
}

/* Two-cell scoreboard; the layoutId ring jumps loser → winner. */
function Scoreboard({ won, live }: { won: boolean; live: boolean }) {
  const { t } = useTranslation();
  const ring = (tone: "danger" | "success") =>
    live ? (
      <motion.div
        layoutId="verdict-ring"
        className={`pointer-events-none absolute inset-0 rounded-card border-2 ${
          tone === "danger" ? "border-danger" : "border-success"
        }`}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    ) : (
      <div
        className={`pointer-events-none absolute inset-0 rounded-card border-2 ${
          tone === "danger" ? "border-danger" : "border-success"
        }`}
      />
    );
  return (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <div className="relative rounded-card border border-line px-4 py-3 font-mono text-[12px] text-ink-muted">
        {!won && ring("danger")}
        {t(K + "scoreLose")}
      </div>
      <div className="relative rounded-card border border-line px-4 py-3 font-mono text-[12px] text-ink-muted">
        {won && ring("success")}
        {t(K + "scorePrint")}
      </div>
    </div>
  );
}

/* ----------------------- live comment row ------------------------ */

interface RowState {
  arrived: boolean;
  chipShown: boolean;
  struck: boolean;
  collapsed: boolean;
  replyStarted: boolean;
  replied: boolean;
}

function LiveRow({ def, state }: { def: CommentDef; state: RowState }) {
  const { t } = useTranslation();
  const text = t(K + def.key);
  const { arrived, chipShown, struck, collapsed, replyStarted, replied } =
    state;
  return (
    <motion.div
      initial={false}
      animate={{
        opacity: collapsed ? 0 : arrived ? 1 : 0,
        y: arrived ? 0 : 16,
        height: collapsed ? 0 : "auto",
        marginBottom: collapsed ? 0 : 8,
      }}
      transition={{
        y: { type: "spring", stiffness: 300, damping: 24 },
        opacity: { duration: 0.35 },
        height: { duration: 0.45, ease: "easeInOut" },
        marginBottom: { duration: 0.45, ease: "easeInOut" },
      }}
      className="overflow-hidden"
    >
      <div className="relative flex gap-2.5 rounded-card border border-line bg-surface-2 p-3">
        {/* 1px danger border pulse on toxic arrival (opacity-only) */}
        {arrived && def.kind === "negative" && !struck && (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-card border border-danger"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.9, times: [0, 0.3, 1] }}
          />
        )}
        <CommentAvatar ch={initialOf(text)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={`text-[13px] leading-snug ${
                struck
                  ? "line-through decoration-danger/60 text-ink-muted/60"
                  : "text-ink"
              }`}
            >
              {text}
            </p>
            {chipShown && !collapsed && <SentimentChip kind={def.kind} />}
          </div>
          {/* rising "hidden · 0.4s" microcopy while the row collapses */}
          {struck && (
            <motion.span
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: -2 }}
              transition={{ duration: 0.4 }}
              className="mt-1 block font-mono text-[10px] text-ink-muted"
            >
              {t(K + "chipHidden")}
            </motion.span>
          )}
          {def.replyKey && replyStarted && (
            <ReplyBlock replyKey={def.replyKey} typed showChip={replied} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------- reduced-motion static demo ------------------- */

function StaticRow({
  def,
  showChip,
  showReply,
}: {
  def: CommentDef;
  showChip: boolean;
  showReply: boolean;
}) {
  const { t } = useTranslation();
  const text = t(K + def.key);
  return (
    <div className="mb-2 flex gap-2.5 rounded-card border border-line bg-surface-2 p-3">
      <CommentAvatar ch={initialOf(text)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] leading-snug text-ink">{text}</p>
          {showChip && <SentimentChip kind={def.kind} />}
        </div>
        {def.replyKey && showReply && (
          <ReplyBlock replyKey={def.replyKey} typed={false} showChip />
        )}
      </div>
    </div>
  );
}

function StaticDemo() {
  const { t } = useTranslation();
  /* end state (phase 4) is the default render */
  const [after, setAfter] = useState(true);

  const rows = after ? COMMENTS.slice(3) : COMMENTS;

  return (
    <div>
      {/* caption + manual Before/After toggle */}
      <div className="mb-3 flex h-11 items-end justify-between gap-3">
        <span
          className={`font-display font-black text-[28px] tracking-[-0.02em] leading-none ${
            after ? "text-success" : "text-danger"
          }`}
        >
          {t(K + (after ? "captionPrinting" : "captionBleeding"))}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAfter(false)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.12em] ${
              !after
                ? "border-accent text-accent"
                : "border-line text-ink-muted"
            }`}
          >
            {t(K + "flipBefore")}
          </button>
          <button
            type="button"
            onClick={() => setAfter(true)}
            className={`rounded-full border px-3 py-1 font-mono text-[11px] tracking-[0.12em] ${
              after
                ? "border-accent text-accent"
                : "border-line text-ink-muted"
            }`}
          >
            {t(K + "flipAfter")}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={after ? "after" : "before"}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative">
            {/* bloom */}
            {after ? (
              <div className="pointer-events-none absolute -inset-8 rounded-[32px] shadow-glow" />
            ) : (
              <div className="pointer-events-none absolute -inset-8 rounded-[32px] bg-danger/25 blur-2xl" />
            )}

            <div className="relative rounded-frame border border-line bg-surface overflow-hidden">
              <CardHeader
                active={after}
                gaugeOffset={
                  after
                    ? ARC_LEN * (1 - GAUGE.high)
                    : ARC_LEN * (1 - (GAUGE.start - GAUGE.drainPer * 3))
                }
                gaugeTone={after ? "success" : "danger"}
                moneyNode={
                  <div
                    className={`mt-1 font-mono font-bold text-[20px] tabular-nums ${
                      after ? "text-success" : "text-danger"
                    }`}
                  >
                    {after
                      ? `+€ ${MONEY.recovered.toFixed(2)}`
                      : `−€ ${MONEY.wasted.toFixed(2)}`}
                    <span className="ml-1.5 text-[11px] font-medium text-ink-muted">
                      · {t(K + (after ? "recoveredLabel" : "wastedLabel"))}
                    </span>
                  </div>
                }
              />

              <div className="mx-4 h-24 md:h-28 rounded-card [background:var(--u-grad-cta)] opacity-80" />

              <div className="h-[380px] overflow-hidden px-4 pt-3">
                {rows.map((def) => (
                  <StaticRow
                    key={def.key}
                    def={def}
                    showChip={after}
                    showReply={after}
                  />
                ))}
              </div>

              <VerdictBar
                unanswered={after ? 0 : 5}
                hidden={after ? 3 : 0}
                replied={after ? 2 : 0}
                cleanHighlight={after}
              />
            </div>
          </div>

          <Scoreboard won={after} live={false} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* --------------------------- live demo ---------------------------- */

function LiveDemo({ running }: { running: boolean }) {
  const { t } = useTranslation();

  const [elapsed, setElapsed] = useState(0);
  const [loop, setLoop] = useState(0);
  const elapsedRef = useRef(0);

  /* single interval-driven state machine */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const next = elapsedRef.current + STEP_MS;
      if (next >= LOOP_MS) {
        elapsedRef.current = 0;
        setElapsed(0);
        setLoop((l) => l + 1);
      } else {
        elapsedRef.current = next;
        setElapsed(next);
      }
    }, STEP_MS);
    return () => clearInterval(id);
  }, [running]);

  /* phase: 0 BLEED · 1 SWEEP · 2 CLOSE · 3 HOLD */
  const phase =
    elapsed < T.sweep ? 0 : elapsed < T.close ? 1 : elapsed < T.hold ? 2 : 3;
  const negArrived = T.arrive
    .slice(0, 3)
    .filter((at) => elapsed >= at).length;
  const fading = elapsed >= T.fade;
  const lost = phase < 2;

  /* shared motion values: money counter + gauge fill */
  const money = useMotionValue(0);
  const moneyText = useTransform(money, (v) => v.toFixed(2));
  const gaugeFill = useMotionValue(GAUGE.start);
  const gaugeOffset = useTransform(gaugeFill, (f) => ARC_LEN * (1 - f));

  /* money: countdown during the bleed, countup during the close —
     resume-safe (recomputed from elapsed when scrolled back in view) */
  useEffect(() => {
    if (!running) return;
    const e = elapsedRef.current;
    const controls: ReturnType<typeof animate>[] = [];
    if (e < T.sweep) {
      money.set(MONEY.wasted * (e / T.sweep));
      controls.push(
        animate(money, MONEY.wasted, {
          duration: (T.sweep - e) / 1000,
          ease: "linear",
        })
      );
    } else if (e < T.close) {
      money.set(MONEY.wasted);
    } else if (e < T.close + 8000) {
      money.set(MONEY.recovered * ((e - T.close) / 8000));
      controls.push(
        animate(money, MONEY.recovered, {
          duration: (T.close + 8000 - e) / 1000,
          ease: "linear",
        })
      );
    } else {
      money.set(MONEY.recovered);
    }
    return () => controls.forEach((c) => c.stop());
  }, [phase, running, loop, money]);

  /* gauge: drains a notch per toxic arrival, refills past start into mint */
  useEffect(() => {
    if (!running) return;
    if (phase === 0 && elapsedRef.current < T.arrive[0]) {
      gaugeFill.set(GAUGE.start);
      return;
    }
    const target =
      phase >= 2 ? GAUGE.high : GAUGE.start - GAUGE.drainPer * negArrived;
    const controls = animate(
      gaugeFill,
      target,
      phase >= 2
        ? { duration: 6, ease: "circOut" }
        : { duration: 0.8, ease: "easeOut" }
    );
    return () => controls.stop();
  }, [phase, negArrived, running, loop, gaugeFill]);

  /* per-row derived state (fully deterministic from elapsed) */
  const rowStates: RowState[] = COMMENTS.map((def, i) => {
    const negIndex = i; // c1–c3 are indices 0–2
    const replyIndex = i - 3; // c4, c5 → 0, 1
    return {
      arrived: elapsed >= T.arrive[i],
      chipShown: elapsed >= T.chips[i],
      struck: def.kind === "negative" && elapsed >= T.strike[negIndex],
      collapsed: def.kind === "negative" && elapsed >= T.collapse[negIndex],
      replyStarted:
        replyIndex >= 0 && elapsed >= T.replyStart[replyIndex],
      replied: replyIndex >= 0 && elapsed >= T.replyChip[replyIndex],
    };
  });

  const arrivedCount = rowStates.filter((r) => r.arrived).length;
  const hiddenCount = rowStates.filter((r) => r.collapsed).length;
  const repliedCount = rowStates.filter((r) => r.replied).length;
  const unanswered = Math.max(0, arrivedCount - hiddenCount - repliedCount);

  const captionKey =
    phase === 0
      ? "captionBleeding"
      : phase === 1
        ? "captionClosing"
        : "captionPrinting";
  const captionTone =
    phase === 0 ? "text-danger" : phase === 1 ? "text-accent" : "text-success";

  return (
    /* remounted each loop so every row resets cleanly under the crossfade */
    <motion.div
      key={loop}
      initial={{ opacity: 0 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: fading ? 0.6 : 0.3 }}
    >
      {/* kinetic caption */}
      <div className="mb-3 flex h-11 items-end">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionKey}
            initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={`font-display font-black text-[28px] tracking-[-0.02em] leading-none ${captionTone}`}
          >
            {t(K + captionKey)}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* bloom carrier + ad-card mock (the hero viewport's ONE glow object) */}
      <div className="relative">
        <motion.div
          className="pointer-events-none absolute -inset-8 rounded-[32px] bg-danger/25 blur-2xl"
          initial={false}
          animate={{
            opacity: phase === 0 ? Math.min(1, 0.5 + 0.18 * negArrived) : 0,
          }}
          transition={{ duration: 0.8 }}
        />
        <motion.div
          className="pointer-events-none absolute -inset-8 rounded-[32px] bg-accent/25 blur-2xl"
          initial={false}
          animate={{ opacity: phase === 1 ? 1 : 0 }}
          transition={{ duration: 0.8 }}
        />
        <motion.div
          className="pointer-events-none absolute -inset-8 rounded-[32px] shadow-glow"
          initial={false}
          animate={{ opacity: phase >= 2 ? 1 : 0 }}
          transition={{ duration: 0.8 }}
        />

        <div className="relative rounded-frame border border-line bg-surface overflow-hidden">
          <CardHeader
            active={phase >= 1}
            gaugeOffset={gaugeOffset}
            gaugeTone={lost ? "danger" : "success"}
            moneyNode={
              <div
                className={`mt-1 font-mono font-bold text-[20px] tabular-nums ${
                  lost ? "text-danger" : "text-success"
                }`}
              >
                {lost ? "−€ " : "+€ "}
                <motion.span>{moneyText}</motion.span>
                <span className="ml-1.5 text-[11px] font-medium text-ink-muted">
                  · {t(K + (lost ? "wastedLabel" : "recoveredLabel"))}
                </span>
              </div>
            }
          />

          {/* creative placeholder */}
          <div className="mx-4 h-24 md:h-28 rounded-card [background:var(--u-grad-cta)] opacity-80" />

          {/* fixed-height comment feed — zero CLS */}
          <div className="relative h-[380px] overflow-hidden px-4 pt-3">
            {COMMENTS.map((def, i) => (
              <LiveRow key={def.key} def={def} state={rowStates[i]} />
            ))}

            {/* P2 scanline — transform-only */}
            {phase === 1 && (
              <motion.div
                className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-accent shadow-[0_0_24px_4px_rgba(124,92,255,0.45)] blur-[0.5px]"
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: 372, opacity: [0, 1, 1, 0] }}
                transition={{
                  duration: 2.9,
                  ease: "linear",
                  opacity: { duration: 2.9, times: [0, 0.05, 0.9, 1] },
                }}
              />
            )}
          </div>

          <VerdictBar
            unanswered={unanswered}
            hidden={hiddenCount}
            replied={repliedCount}
            cleanHighlight={phase === 3}
          />
        </div>
      </div>

      <Scoreboard won={phase >= 2} live />
    </motion.div>
  );
}

/* ------------------------------ root ------------------------------ */

export function TakeoverDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.3 });
  const reduce = useReducedMotion();

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="relative min-h-[620px] lg:min-h-[640px]"
    >
      {reduce ? <StaticDemo /> : <LiveDemo running={inView} />}
    </div>
  );
}
