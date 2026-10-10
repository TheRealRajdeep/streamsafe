import { useEffect, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { CHAT, LINES, type ChatMsg, type Token } from "../data/demoScript";
import { ShieldIcon } from "../components/icons";
import { WindowFrame } from "../components/WindowFrame";
import { EASE_OUT } from "../lib/motion";

/* ---------- caption timeline ---------- */

type CapState = { line: number; word: number; beeps: number };

function capReducer(s: CapState): CapState {
  const line = LINES[s.line];
  if (s.word < line.length) {
    const tok = line[s.word];
    return { ...s, word: s.word + 1, beeps: s.beeps + (tok.kind === "swear" ? 1 : 0) };
  }
  return { ...s, line: (s.line + 1) % LINES.length, word: 0 };
}

function capDelay(s: CapState): number {
  const line = LINES[s.line];
  if (s.word === 0) return 450;
  if (s.word === line.length) return 1900;
  const last = line[s.word - 1];
  if (last.kind === "swear") return 1150;
  if (last.kind === "allowed") return 1400;
  return 210;
}

/* ---------- chat feed ---------- */

type Live = ChatMsg & { id: number; instant: boolean };
type ChatState = { next: number; id: number; items: Live[]; masked: number };

const PRELOAD = 4;
const initialChat = (): ChatState => ({
  next: PRELOAD,
  id: PRELOAD,
  items: CHAT.slice(0, PRELOAD).map((m, i) => ({ ...m, id: i, instant: true })),
  masked: CHAT.slice(0, PRELOAD).reduce((n, m) => n + m.parts.filter((p) => p.swear).length, 0),
});

function chatReducer(s: ChatState): ChatState {
  const msg = CHAT[s.next];
  return {
    next: (s.next + 1) % CHAT.length,
    id: s.id + 1,
    items: [...s.items, { ...msg, id: s.id, instant: false }].slice(-9),
    masked: s.masked + msg.parts.filter((p) => p.swear).length,
  };
}

/* ---------- pieces ---------- */

function useActive(ref: React.RefObject<HTMLElement | null>) {
  const inView = useInView(ref, { amount: 0.25 });
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return inView && visible && !reduced;
}

function snippet(line: Token[], upTo: number) {
  return line
    .slice(Math.max(0, upTo - 3), upTo)
    .map((t) => t.shown ?? t.w)
    .join(" ");
}

const BARS = Array.from({ length: 38 }, (_, i) => ({
  h: 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)),
  d: 260 + ((i * 97) % 240),
  dl: -((i * 53) % 400),
}));

function Waveform({ beeping }: { beeping: boolean }) {
  return (
    <div className="wave" data-beeping={beeping}>
      <div className="wave-live" aria-hidden="true">
        {BARS.map((b, i) => (
          <i
            key={i}
            style={
              {
                "--h": b.h,
                animationDuration: `${b.d}ms`,
                animationDelay: `${b.dl}ms`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="wave-beep" aria-hidden="true">
        <svg viewBox="0 0 200 22" preserveAspectRatio="none">
          <path
            d="M0 16 H8 V6 H18 V16 H28 V6 H38 V16 H48 V6 H58 V16 H68 V6 H78 V16 H88 V6 H98 V16 H108 V6 H118 V16 H128 V6 H138 V16 H148 V6 H158 V16 H168 V6 H178 V16 H188 V6 H200"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span>beep</span>
      </div>
    </div>
  );
}

function ChatLine({ msg }: { msg: Live }) {
  const [checked, setChecked] = useState(msg.instant);
  useEffect(() => {
    if (checked) return;
    const id = setTimeout(() => setChecked(true), 850);
    return () => clearTimeout(id);
  }, [checked]);

  return (
    <motion.div
      className="chat-line"
      data-checked={checked}
      layout="position"
      initial={msg.instant ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
    >
      <span className="chat-user" style={{ color: msg.color }}>
        {msg.user}
      </span>
      <span className="chat-colon">: </span>
      <span className="chat-text">
        {msg.parts.map((p, i) =>
          p.swear ? (
            <span key={i} className="masked">
              {checked ? "*".repeat(p.text.length) : p.text}
            </span>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </span>
      <span className="chat-checking" aria-hidden="true" />
    </motion.div>
  );
}

/* ---------- main ---------- */

export function TwitchDemo() {
  const rootRef = useRef<HTMLDivElement>(null);
  const active = useActive(rootRef);
  const reduced = useReducedMotion();

  const [cap, tickCap] = useReducer(
    capReducer,
    undefined,
    (): CapState => (reduced ? { line: 1, word: LINES[1].length, beeps: 1 } : { line: 0, word: 0, beeps: 0 }),
  );
  const [chat, tickChat] = useReducer(chatReducer, undefined, initialChat);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(tickCap, capDelay(cap));
    return () => clearTimeout(id);
  }, [active, cap]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(tickChat, 1700);
    return () => clearInterval(id);
  }, [active]);

  const line = LINES[cap.line];
  const last = cap.word > 0 ? line[cap.word - 1] : undefined;
  const beeping = last?.kind === "swear";
  const allowedNote = last?.kind === "allowed" ? last : undefined;
  const talking = active && !beeping && cap.word > 0 && cap.word < line.length;

  return (
    <div ref={rootRef}>
      <WindowFrame title="twitch.tv/cozyquest" className="demo">
        <div className="demo-grid">
          <div className="player">
            <div className="scene" aria-hidden="true">
              <div className="scene-sun" />
              <div className="scene-hills" />
              <div className="boss">
                <i />
                <i />
              </div>
              <div className="hero-dude" />
            </div>

            <div className="facecam" data-talking={talking} data-beeping={beeping} aria-hidden="true">
              <div className="face">
                <span className="headset" />
                <span className="eye l" />
                <span className="eye r" />
                <span className="mouth" />
                <span className="mouth-bar" />
              </div>
            </div>

            <motion.div className="ss-badge" data-flash={beeping} layout transition={{ duration: 0.25, ease: EASE_OUT }}>
              <ShieldIcon size={16} />
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={beeping ? `b${cap.line}-${cap.word}` : "idle"}
                  initial={{ opacity: 0, filter: "blur(3px)", y: 4 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
                  exit={{ opacity: 0, filter: "blur(3px)", y: -4, transition: { duration: 0.12 } }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                >
                  {beeping ? <>🔇 “{snippet(line, cap.word)}”</> : "streamsafe is on"}
                </motion.span>
              </AnimatePresence>
            </motion.div>

            <div className="counter-pill">
              <b>{cap.beeps}</b> beeped · <b>{chat.masked}</b> masked
            </div>

            <AnimatePresence>
              {beeping && (
                <motion.div
                  key={`pop${cap.line}-${cap.word}`}
                  className="beep-pop"
                  initial={{ opacity: 0, scale: 0.85, rotate: -16 }}
                  animate={{ opacity: 1, scale: 1, rotate: -7 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
                  transition={{ type: "spring", duration: 0.45, bounce: 0.4 }}
                >
                  BEEP!
                </motion.div>
              )}
            </AnimatePresence>

            <div className="captions-wrap">
              <AnimatePresence>
                {allowedNote && (
                  <motion.div
                    key={`note${cap.line}`}
                    className="allowed-chip"
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                  >
                    ✓ “{allowedNote.w}”: {allowedNote.note}
                  </motion.div>
                )}
              </AnimatePresence>
              <p className="captions" key={cap.line} aria-live="off">
                {line.slice(0, cap.word).map((t, i) => (
                  <span key={i} className={`cw ${t.kind ?? ""}`}>
                    {t.kind === "swear" ? t.shown : t.w}{" "}
                  </span>
                ))}
                {cap.word === 0 && <span className="cw idle">…</span>}
              </p>
            </div>

            <div className="controls">
              <span className="ctl-play" aria-hidden="true" />
              <span className="ctl-vol" data-muted={beeping} aria-hidden="true" />
              <Waveform beeping={beeping} />
              <span className="live-pill">LIVE</span>
              <span className="viewers">12,408</span>
            </div>
          </div>

          <aside className="chat">
            <div className="chat-head">stream chat</div>
            <div className="chat-feed">
              {chat.items.map((m) => (
                <ChatLine key={m.id} msg={m} />
              ))}
            </div>
            <div className="chat-input">
              <span>send a message</span>
              <b>chat</b>
            </div>
          </aside>
        </div>
      </WindowFrame>
    </div>
  );
}
