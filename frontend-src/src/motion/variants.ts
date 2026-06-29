import type { Variants, Transition } from "framer-motion";

// syn-fluid easing, weighted on entry
export const synEase: number[] = [0.65, 0, 0.35, 1];
export const synOut: number[] = [0.16, 1, 0.3, 1];

export const T = {
  fast: 0.18,
  base: 0.32,
  slow: 0.56,
  stagger: 0.06,
} as const;

export const baseTransition: Transition = { duration: T.base, ease: synEase };

// staggered container
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: T.stagger, delayChildren: 0.04 } },
};

// item rises into place
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: T.base, ease: synOut } },
};

export const fadeItem: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: T.slow, ease: synEase } },
};

// view crossfade
export const viewSwap: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: T.base, ease: synOut } },
  exit: { opacity: 0, y: -6, transition: { duration: T.fast, ease: synEase } },
};

// message enters
export const speechIn: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: T.slow, ease: synOut } },
};

// number/data grows
export const growIn: Variants = {
  hidden: { opacity: 0, scaleY: 0.4 },
  show: { opacity: 1, scaleY: 1, transition: { duration: T.slow, ease: synOut } },
};
