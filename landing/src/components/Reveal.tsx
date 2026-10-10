import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE_IN_OUT, EASE_OUT } from "../lib/motion";

type Props = { children: ReactNode; className?: string; delay?: number; mask?: boolean };

// One-shot scroll reveal. `mask` wipes text up from behind a clip (for headings);
// otherwise a short fade-up. Reduced motion keeps only the fade.
export function Reveal({ children, className, delay = 0, mask = false }: Props) {
  const reduce = useReducedMotion();

  const hidden = reduce
    ? { opacity: 0 }
    : mask
      ? { opacity: 0, clipPath: "inset(-20% -5% 100% -5%)", transform: "translateY(40%)" }
      : { opacity: 0, transform: "translateY(18px)" };
  const shown = reduce
    ? { opacity: 1 }
    : mask
      ? { opacity: 1, clipPath: "inset(-20% -5% -20% -5%)", transform: "translateY(0%)" }
      : { opacity: 1, transform: "translateY(0px)" };

  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: mask ? 0.7 : 0.6, ease: mask ? EASE_IN_OUT : EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}
