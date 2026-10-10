// Scripted "stream" for the hero demo.
// Caption markup:  [word|shown]  = swear, beeped and shown censored
//                  {word|note}   = looks risky but is fine (name / mild word)
export type Token = {
  w: string;
  kind?: "swear" | "allowed";
  shown?: string;
  note?: string;
};

const LINE_MARKUP = [
  "okay chat we are SO back",
  "what the [fuck|f***] was that boss",
  "{dick|a name, not a swear} grayson is the best robin, fight me",
  "this hitbox is [bullshit|bull****] bro",
  "what the {hell|mild, so it plays} one more try",
  "let's [fucking|f***ing] go!!",
];

function parseToken(raw: string): Token {
  const swear = raw.match(/^\[(.+)\|(.+)\]$/);
  if (swear) return { w: swear[1], kind: "swear", shown: swear[2] };
  const allowed = raw.match(/^\{(.+)\|(.+)\}$/);
  if (allowed) return { w: allowed[1], kind: "allowed", note: allowed[2] };
  return { w: raw };
}

// Notes contain spaces, so keep bracket groups whole when splitting.
export const LINES: Token[][] = LINE_MARKUP.map((m) =>
  (m.match(/\{[^}]+\}|\[[^\]]+\]|\S+/g) ?? []).map(parseToken),
);

export type ChatMsg = { user: string; color: string; parts: { text: string; swear?: boolean }[] };

const CHAT_MARKUP: [string, string, string][] = [
  ["kappa_king", "#ff7a45", "LETSGOOO"],
  ["noobmaster", "#1fb5ff", "that boss is [shit] lol"],
  ["pixelpanda", "#ff4fa3", "dick grayson >>> jason todd"],
  ["cozycat", "#00b37a", "hi from canada 🍁"],
  ["ratjam", "#b67cff", "bro is [ass] at parrying"],
  ["grandma_gamer", "#38bdf8", "you got this sweetie"],
  ["lurker_99", "#e8a800", "[fvck] this boss fr"],
  ["zoomer44", "#fb7185", "gg go next"],
  ["saltyboi", "#7cc63a", "what a [bitch] of a fight"],
  ["moonbeam", "#c084fc", "the music in this area 😌"],
];

export const CHAT: ChatMsg[] = CHAT_MARKUP.map(([user, color, text]) => ({
  user,
  color,
  parts: text.split(/(\[[^\]]+\])/).filter(Boolean).map((p) =>
    p.startsWith("[") ? { text: p.slice(1, -1), swear: true } : { text: p },
  ),
}));
