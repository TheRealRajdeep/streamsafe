import { motion } from "motion/react";
import { AddToChrome } from "../components/AddToChrome";
import { Marquee } from "../components/Marquee";
import { ShieldIcon } from "../components/icons";
import { EASE_OUT } from "../lib/motion";

const PHRASES = ["no more f-bombs", "twitch, kid-friendly", "chat cleaned up", "context, not word lists", "zero setup for kids"];

export function FinalCta() {
  return (
    <section className="final">
      <Marquee className="final-marquee">
        {PHRASES.map((p) => (
          <span key={p} className="marquee-item">
            {p} <span className="spark">✦</span>
          </span>
        ))}
      </Marquee>

      <div className="final-inner">
        <motion.div
          className="final-copy"
          initial={{ opacity: 0, transform: "translateY(24px)" }}
          whileInView={{ opacity: 1, transform: "translateY(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <h2>
            twitch, but the <em>kid-friendly</em> cut.
          </h2>
          <p className="section-sub">install it once, then let them watch. streamsafe runs quietly in the background.</p>
          <AddToChrome />
        </motion.div>

        <motion.div
          className="polaroid"
          initial={{ opacity: 0, transform: "translateY(60px) rotate(-4deg)" }}
          whileInView={{ opacity: 1, transform: "translateY(0px) rotate(6deg)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring", duration: 0.9, bounce: 0.3, delay: 0.15 }}
        >
          <span className="tape" aria-hidden="true" />
          <div className="polaroid-shot">
            <div className="ss-badge static" data-flash="true">
              <ShieldIcon size={16} />
              <span>🔇 “let's f***ing go”</span>
            </div>
          </div>
          <p className="polaroid-caption">saturday, 4pm. crisis averted.</p>
        </motion.div>
      </div>
    </section>
  );
}
