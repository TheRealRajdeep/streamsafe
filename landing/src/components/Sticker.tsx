import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";

type Props = { className?: string; rotate?: number; delay?: number; parallax?: number; children: ReactNode };

// Draggable scrapbook sticker. Springs back home when released.
// The outer wrapper drifts on scroll (CSS scroll timeline, see .par); the inner one drags.
export function Sticker({ className = "", rotate = 0, delay = 0, parallax = 100, children }: Props) {
  return (
    <div className={`sticker par ${className}`} style={{ "--par": `${parallax}px` } as CSSProperties}>
      <motion.div
        className="sticker-drag"
        drag
        dragSnapToOrigin
        dragElastic={0.5}
        dragTransition={{ bounceStiffness: 260, bounceDamping: 18 }}
        whileDrag={{ scale: 1.08, rotate: rotate + 4 }}
        initial={{ opacity: 0, scale: 0.9, rotate: rotate - 8 }}
        animate={{ opacity: 1, scale: 1, rotate }}
        transition={{ type: "spring", duration: 0.7, bounce: 0.3, delay }}
      >
        <div className="sticker-float" style={{ animationDelay: `${-delay * 2.5}s` }}>
          {children}
        </div>
      </motion.div>
    </div>
  );
}
