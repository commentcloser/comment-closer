"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";

/* ------------------------------------------------------------------
   CountUp — DESIGN-SPEC-V2 §4.4 shared count-up numeral.
   useMotionValue(0) + animate(mv, to, {duration: 1.4, ease: "circOut"})
   fired once when 60% in view; mono/bold/tabular; reduced motion
   renders the end value statically.
   ------------------------------------------------------------------ */

interface CountUpProps {
  to: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export function CountUp({
  to,
  prefix = "",
  suffix = "",
  decimals = 0,
  className = "",
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  const mv = useMotionValue(0);
  const text = useTransform(
    mv,
    (v) => `${prefix}${v.toFixed(decimals)}${suffix}`
  );

  useEffect(() => {
    if (reduce || !inView) return;
    const controls = animate(mv, to, { duration: 1.4, ease: "circOut" });
    return () => controls.stop();
  }, [reduce, inView, to, mv]);

  if (reduce) {
    return (
      <span
        ref={ref}
        className={`font-mono font-bold tabular-nums ${className}`}
      >
        {`${prefix}${to.toFixed(decimals)}${suffix}`}
      </span>
    );
  }

  return (
    <motion.span
      ref={ref}
      className={`font-mono font-bold tabular-nums ${className}`}
    >
      {text}
    </motion.span>
  );
}

export default CountUp;
