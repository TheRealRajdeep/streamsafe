import type { CSSProperties } from "react";
import { motion } from "motion/react";
import { AddToChrome } from "../components/AddToChrome";
import { Sticker } from "../components/Sticker";
import { HeadphonesIcon } from "../components/icons";
import { EASE_OUT } from "../lib/motion";
import { TwitchDemo } from "./TwitchDemo";

const rise = (delay: number) => ({
  initial: { opacity: 0, transform: "translateY(14px)", filter: "blur(4px)" },
  animate: { opacity: 1, transform: "translateY(0px)", filter: "blur(0px)" },
  transition: { duration: 0.7, ease: EASE_OUT, delay },
});

export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <motion.p className="eyebrow" {...rise(0)}>
          for parents of tiny twitch fans
        </motion.p>
        <motion.h1 {...rise(0.08)}>
          let them watch their favorite streamer.
          <br />
          <em className="squiggle">
            minus the f-bombs.
            <svg viewBox="0 0 300 18" preserveAspectRatio="none" aria-hidden="true">
              <path d="M3 12 C 40 2, 70 18, 110 9 S 180 3, 220 11 S 280 14, 297 6" />
            </svg>
          </em>
        </motion.h1>
        <motion.p className="sub" {...rise(0.16)}>
          earmuffs beeps swearing on twitch live streams <i>before</i> it reaches their ears, and cleans up the chat
          too. it understands context, so “dick grayson” plays and “he's a dick” doesn't.
        </motion.p>
        <motion.div className="hero-cta" {...rise(0.24)}>
          <AddToChrome />
          <span className="cta-note">free · chrome · twitch live streams</span>
        </motion.div>
      </div>

      <motion.div
        className="hero-stage"
        initial={{ opacity: 0, transform: "translateY(40px) scale(0.97)" }}
        animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
        transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.3 }}
      >
        <Sticker className="st-face" rotate={-10} delay={0.9} parallax={140}>
          <span>^ ω ^</span>
        </Sticker>
        <Sticker className="st-note" rotate={5} delay={1.05} parallax={60}>
          <span className="tape" />
          no more “mom, what does f*** mean?”
        </Sticker>
        <Sticker className="st-stamp" rotate={12} delay={1.2} parallax={190}>
          kid
          <br />
          approved
          <b>✓</b>
        </Sticker>
        <Sticker className="st-headphones" rotate={-6} delay={1.35} parallax={90}>
          <HeadphonesIcon size={46} />
        </Sticker>
        <span className="drag-hint par" style={{ "--par": "190px" } as CSSProperties} aria-hidden="true">
          drag us!
          <svg viewBox="0 0 60 40">
            <path d="M4 6 C 20 4, 40 12, 50 32" />
            <path d="M42 30 L 51 34 L 53 24" />
          </svg>
        </span>

        <div className="demo-tilt">
          <TwitchDemo />
        </div>
      </motion.div>
    </section>
  );
}
