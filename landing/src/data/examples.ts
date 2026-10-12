export type Verdict = "beep" | "clean";

export type Example = {
  text: string;
  word: string; // substring of text that gets judged
  verdict: Verdict; // what earmuffs does
  heard: string; // what the kid hears; [beep] marks the bleep
  reason: string;
  list: Verdict; // what a plain word list does
  listWhy: string;
};

export const EXAMPLES: Example[] = [
  {
    text: "dick grayson is the best robin",
    word: "dick",
    verdict: "clean",
    heard: "dick grayson is the best robin",
    reason: "it's a name, not an insult.",
    list: "beep",
    listWhy: "sees “dick” and panics.",
  },
  {
    text: "what the fuck was that",
    word: "fuck",
    verdict: "beep",
    heard: "what the [beep] was that",
    reason: "a textbook f-bomb.",
    list: "beep",
    listWhy: "this one's on the list.",
  },
  {
    text: "assassin's creed time",
    word: "assassin's",
    verdict: "clean",
    heard: "assassin's creed time",
    reason: "it's a video game.",
    list: "beep",
    listWhy: "it contains “ass”.",
  },
  {
    text: "this boss is fvcking hard",
    word: "fvcking",
    verdict: "beep",
    heard: "this boss is [beep] hard",
    reason: "a disguised swear is still a swear.",
    list: "clean",
    listWhy: "never heard of “fvcking”.",
  },
  {
    text: "my cousin lives in scunthorpe",
    word: "scunthorpe",
    verdict: "clean",
    heard: "my cousin lives in scunthorpe",
    reason: "a lovely town in england.",
    list: "beep",
    listWhy: "there's a swear hiding in the middle.",
  },
  {
    text: "i'm gonna kick his ass",
    word: "ass",
    verdict: "beep",
    heard: "i'm gonna kick his [beep]",
    reason: "the rude kind of ass.",
    list: "beep",
    listWhy: "this one's on the list.",
  },
  {
    text: "what the hell was that",
    word: "hell",
    verdict: "clean",
    heard: "what the hell was that",
    reason: "mild, so we let it play.",
    list: "beep",
    listWhy: "can't tell mild from rude.",
  },
  {
    text: "son of a b—",
    word: "b—",
    verdict: "beep",
    heard: "son of a [beep]",
    reason: "we know where that sentence was going.",
    list: "clean",
    listWhy: "it only sees the letter “b”.",
  },
  {
    text: "cocktail party later",
    word: "cocktail",
    verdict: "clean",
    heard: "cocktail party later",
    reason: "it's a drink.",
    list: "beep",
    listWhy: "it starts with a rude word.",
  },
  {
    text: "that was sh1t",
    word: "sh1t",
    verdict: "beep",
    heard: "that was [beep]",
    reason: "a 1 instead of an i doesn't fool us.",
    list: "clean",
    listWhy: "“sh1t” isn't spelled right.",
  },
  {
    text: "shiitake mushrooms rule",
    word: "shiitake",
    verdict: "clean",
    heard: "shiitake mushrooms rule",
    reason: "it's a mushroom.",
    list: "beep",
    listWhy: "squash the double i and look what it spells.",
  },
  {
    text: "he's being a dick",
    word: "dick",
    verdict: "beep",
    heard: "he's being a [beep]",
    reason: "this time it is an insult.",
    list: "beep",
    listWhy: "this one's on the list.",
  },
  {
    text: "damn, so close",
    word: "damn",
    verdict: "clean",
    heard: "damn, so close",
    reason: "mild, so we let it play.",
    list: "beep",
    listWhy: "can't tell mild from rude.",
  },
  {
    text: "class is cancelled",
    word: "class",
    verdict: "clean",
    heard: "class is cancelled",
    reason: "it's school.",
    list: "beep",
    listWhy: "it contains “ass”.",
  },
];

export const LIST_WRONG = EXAMPLES.filter((e) => e.list !== e.verdict).length;
