// Shared entrance motion: each screen's blocks fade/rise 12px over 250 ms with
// a 60 ms stagger. Lives under MotionConfig reducedMotion="user" (App shell).
import type { Variants } from 'motion/react';

export const screenVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

export const riseVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
};
