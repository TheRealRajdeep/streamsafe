import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Reveal } from "../components/Reveal";
import { WindowFrame } from "../components/WindowFrame";
import { EASE_OUT } from "../lib/motion";

/* step 1: chunks turn green as they pass the "we check it" line, well before playback */
const CHUNKS = Array.from({ length: 14 }, (_, i) => i % 5 === 2);

function ChunkRow({ checked }: { checked: boolean }) {
  const row = CHUNKS.map((swear, i) => (
    <span key={i} className={`chunk ${swear ? "swear" : ""}`}>
      {swear ? (checked ? "beep" : "#@!") : ""}
    </span>
  ));
  return (
    <div className="chunk-track">
      <div className="chunk-half">{row}</div>
      <div className="chunk-half">{row}</div>
    </div>
  );
}

function AheadViz() {
  return (
    <div className="ahead">
      <div className="ahead-lane">
        <div className="ahead-layer">
          <ChunkRow checked={false} />
        </div>
        <div className="ahead-layer ahead-checked">
          <ChunkRow checked />
        </div>
        <div className="ahead-fade" />
        <span className="ahead-mark play">
          <em>▶ they hear it</em>
        </span>
        <span className="ahead-mark scan">
          <em>we check it</em>
        </span>
      </div>
      <div className="ahead-bracket">
        <span>~5 second head start</span>
      </div>
    </div>
  );
}

/* step 2: context dial */
const CONTEXT = [
  { pre: "he's being a ", word: "dick", post: "", swear: true, label: "an insult → beep" },
  { pre: "", word: "dick", post: " grayson is the best robin", swear: false, label: "a name → let it play" },
];

function ContextViz({ active }: { active: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setI((n) => (n + 1) % CONTEXT.length), 2600);
    return () => clearInterval(id);
  }, [active]);
  const c = CONTEXT[i];

  return (
    <div className="context">
      <div className="context-sentence">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.p
            key={i}
            initial={{ opacity: 0, filter: "blur(4px)", y: 6 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(4px)", y: -6, transition: { duration: 0.15 } }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
          >
            “{c.pre}
            <mark>{c.word}</mark>
            {c.post}”
          </motion.p>
        </AnimatePresence>
      </div>
      <svg className="dial" viewBox="0 0 200 110" aria-hidden="true">
        <path d="M20 100 A80 80 0 0 1 100 20" className="dial-safe" />
        <path d="M100 20 A80 80 0 0 1 180 100" className="dial-hot" />
        <g className="dial-needle-g" style={{ transform: `rotate(${c.swear ? 52 : -52}deg)` }}>
          <line x1="100" y1="100" x2="100" y2="34" className="dial-needle" />
        </g>
        <circle cx="100" cy="100" r="7" className="dial-hub" />
      </svg>
      <p className={`context-label ${c.swear ? "hot" : "safe"}`}>{c.label}</p>
    </div>
  );
}

/* step 3: beep lands exactly on the word */
const WORDS = ["what", "the", "f***", "was", "that"];
const BAR_H = Array.from({ length: 40 }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin(i * 0.9) * Math.sin(i * 0.37 + 1)));

function OnTheWordViz() {
  return (
    <div className="onword">
      <div className="onword-wave">
        {BAR_H.map((h, i) => (
          <i key={i} style={{ transform: `scaleY(${h})` }} />
        ))}
        <div className="onword-beep">
          <span>beep</span>
        </div>
      </div>
      <div className="onword-words">
        {WORDS.map((w) => (
          <span key={w} className={w.includes("*") ? "hit" : ""}>
            {w}
          </span>
        ))}
      </div>
      <div className="onword-chat">
        <b>chat</b> this boss is{" "}
        <span className="swap">
          <span className="swap-raw">shit</span>
          <span className="swap-mask">****</span>
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    n: "01",
    title: "it listens ahead",
    body: "streamsafe hears the stream a few seconds before your kid does, which is enough time to catch a swear before it plays.",
    tech: "grabs audio chunks early · speech-to-text",
  },
  {
    n: "02",
    title: "it understands context",
    body: "a word list blocks “assassin” and misses “fvck”. streamsafe reads the whole sentence and judges every risky word.",
    tech: "context-aware ai classifier",
  },
  {
    n: "03",
    title: "it beeps right on the word",
    body: "only the swear gets beeped, so the rest of the sentence plays normally. chat swears turn into ****.",
    tech: "synced to the millisecond",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0.15 });

  return (
    <section className="how" id="how" ref={ref} data-paused={!inView}>
      <div className="section-head">
        <Reveal>
          <p className="eyebrow">how it works</p>
        </Reveal>
        <Reveal mask delay={0.05}>
          <h2>
            a tiny bodyguard for their <em>ears</em>
          </h2>
        </Reveal>
      </div>
      <div className="steps">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, transform: "translateY(32px) rotate(-1.5deg)" }}
            whileInView={{ opacity: 1, transform: "translateY(0px) rotate(0deg)" }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: i * 0.08 }}
          >
            <WindowFrame title={`step ${s.n}`} className="step">
              <div className="step-viz">
                {i === 0 && <AheadViz />}
                {i === 1 && <ContextViz active={inView} />}
                {i === 2 && <OnTheWordViz />}
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <span className="tech">{s.tech}</span>
            </WindowFrame>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
