import { useRef, useState, type CSSProperties } from "react";
import { motion, useInView } from "motion/react";
import { Reveal } from "../components/Reveal";
import { EXAMPLES, LIST_WRONG, type Example } from "../data/examples";
import { EASE_OUT } from "../lib/motion";

function Sentence({ ex }: { ex: Example }) {
  const at = ex.text.indexOf(ex.word);
  return (
    <p className="verdict-sentence">
      “{ex.text.slice(0, at)}
      <mark>{ex.word}</mark>
      {ex.text.slice(at + ex.word.length)}”
    </p>
  );
}

function Heard({ ex }: { ex: Example }) {
  if (ex.verdict === "clean") return <span className="heard">it plays as normal</span>;
  const [a, b] = ex.heard.split("[beep]");
  return (
    <span className="heard">
      they hear: “{a}
      <span className="heard-beep">beep</span>
      {b}”
    </span>
  );
}

export function Playground() {
  const [sel, setSel] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  const chipsRef = useRef<HTMLDivElement>(null);
  const chipsIn = useInView(chipsRef, { once: true, margin: "-100px" });
  const ex = EXAMPLES[sel];
  const listRight = ex.list === ex.verdict;

  const pick = (i: number) => {
    setSel(i);
    setSeen((s) => new Set(s).add(i));
  };

  return (
    <section className="play" id="try">
      <div className="section-head">
        <Reveal>
          <p className="eyebrow">try it</p>
        </Reveal>
        <Reveal mask delay={0.05}>
          <h2>
            smart, <em>not</em> a word list
          </h2>
        </Reveal>
        <Reveal delay={0.15}>
          <p className="section-sub">
            tap a sentence to see what earmuffs does, and what a plain word list would do.{" "}
            <span className="warn">(heads up: real swears below, for science.)</span>
          </p>
        </Reveal>
      </div>

      <div className="play-grid">
        <div className="chips" ref={chipsRef} data-in={chipsIn} role="listbox" aria-label="example sentences">
          {EXAMPLES.map((e, i) => (
            <button
              key={e.text}
              role="option"
              aria-selected={i === sel}
              className="chip"
              data-selected={i === sel}
              data-seen={seen.has(i)}
              data-verdict={e.verdict}
              style={{ "--i": i } as CSSProperties}
              onClick={() => pick(i)}
            >
              {e.text}
            </button>
          ))}
          <p className="chips-count">
            tried {seen.size}/{EXAMPLES.length}
          </p>
        </div>

        <Reveal delay={0.2}>
          <div className="verdict-card" key={sel}>
            <span className="tape tape-tl" aria-hidden="true" />
            <Sentence ex={ex} />
  
            <div className="verdict-cols">
              <div className="verdict-us">
                <span className="verdict-label">earmuffs</span>
                <motion.div
                  className={`stamp ${ex.verdict}`}
                  initial={{ opacity: 0, scale: 1.5, rotate: -18 }}
                  animate={{ opacity: 1, scale: 1, rotate: -7 }}
                  transition={{ duration: 0.22, ease: EASE_OUT, delay: 0.32 }}
                >
                  {ex.verdict === "beep" ? "beeped" : "clean"}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, transform: "translateY(6px)" }}
                  animate={{ opacity: 1, transform: "translateY(0px)" }}
                  transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.5 }}
                >
                  <p className="reason">{ex.reason}</p>
                  <Heard ex={ex} />
                </motion.div>
              </div>
  
              <motion.div
                className="verdict-list"
                initial={{ opacity: 0, transform: "translateX(8px)" }}
                animate={{ opacity: 1, transform: "translateX(0px)" }}
                transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.62 }}
              >
                <span className="verdict-label">a plain word list</span>
                <p className={`list-result ${listRight ? "right" : "wrong"}`}>
                  {ex.list === "beep" ? "beeps it" : "lets it play"}
                  <b>{listRight ? "✓ right" : "✗ wrong"}</b>
                </p>
                <p className="reason small">{ex.listWhy}</p>
              </motion.div>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <p className="play-foot">
          a plain word list gets <b>{LIST_WRONG}</b> of these {EXAMPLES.length} wrong.
        </p>
      </Reveal>
    </section>
  );
}
