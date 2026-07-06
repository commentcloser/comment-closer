'use client';

import { motion, useScroll, useSpring } from 'framer-motion';

/**
 * Thin indigo→violet progress bar pinned to the top of the viewport that fills
 * as the visitor scrolls the (long) landing page. Reflects scroll position, so
 * it's informative rather than decorative — safe to keep under reduced-motion.
 */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  return (
    <motion.div
      aria-hidden="true"
      style={{ scaleX }}
      className="fixed top-0 inset-x-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-accent-2 to-accent"
    />
  );
}
