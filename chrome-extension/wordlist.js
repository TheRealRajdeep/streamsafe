// Instant profanity safety net + candidate selection. Runs in the page (MAIN
// world) and in Node (bench), so it only touches the shared __ss namespace.
(() => {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const ss = (root.__ss = root.__ss || {});

  // Moderate + severe only. Mild words (damn, hell, crap, piss) are allowed.
  const PATTERNS = [
    /^(fuck|fuk|fck|fvck|phuck|fuq|fcuk)(s|ed|er|ers|in|ing|ings|off|face|wit|tard|head|boy|hole)?$/,
    /^m[ou]th(er|a)f\w*$/,
    /^(shit|sht|shyt)(s|ty|tier|ting|ted|head|heads|show|faced|hole|bag|load)?$/,
    /^(bull|horse|dip|chicken)shit(s|ting|ted)?$/,
    /^ass(es)?$/,
    /^(asshole|arsehole)s?$/,
    /^(dumb|jack|smart|fat|lazy)ass(es)?$/,
    /^bitch(es|ing|y|ed)?$/,
    /^sonofabitch$/,
    /^bastards?$/,
    /^dick(s|head|heads|hole|wad)?$/,
    /^cock(s|sucker|suckers|sucking)?$/,
    /^(pussy|pussies)$/,
    /^cunts?$/,
    /^pricks?$/,
    /^twats?$/,
    /^wank(er|ers|ing)?$/,
    /^sluts?$/,
    /^whores?$/,
    /^(wtf|stfu|gtfo)$/,
  ];

  // Spelled-out forms used to resolve masked tokens like f***, s**t, f***ing.
  const CANONICAL = ['fuck', 'fucks', 'fucked', 'fucker', 'fucking', 'fuckin', 'motherfucker', 'shit', 'shitty',
    'bullshit', 'ass', 'asshole', 'bitch', 'bitches', 'bastard', 'dick', 'dickhead', 'cock', 'pussy', 'cunt', 'twat',
    'whore', 'slut'];

  // Roots that make a token "suspicious" even when it isn't a whole-word hit
  // (class, assassin, cocktail…). The classifier decides those in context.
  const ROOTS = ['fuck', 'fuk', 'fvck', 'shit', 'ass', 'bitch', 'bastard', 'dick', 'cock', 'pussy', 'cunt', 'prick',
    'twat', 'wank', 'slut', 'whore'];

  const HOMOGLYPHS = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'ѕ': 's', 'к': 'k',
    'ƒ': 'f', 'ß': 'ss', 'ü': 'u', 'ù': 'u', 'ú': 'u', 'ö': 'o', 'ò': 'o', 'ó': 'o', 'ä': 'a', 'à': 'a',
    'á': 'a', 'â': 'a', 'é': 'e', 'è': 'e', 'ê': 'e', 'í': 'i', 'ì': 'i', 'ï': 'i',
  };
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

  // Lowercase, undo homoglyphs and leetspeak, drop separators. Keeps '*'.
  function normalize(token) {
    let s = String(token).toLowerCase();
    let out = '';
    for (const ch of s) {
      if (HOMOGLYPHS[ch]) out += HOMOGLYPHS[ch];
      else if (LEET[ch]) out += LEET[ch];
      else out += ch;
    }
    out = out.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    return out.replace(/[^a-z*]/g, '');
  }

  const collapse = (s, max) => s.replace(/(.)\1+/g, (m, c) => c.repeat(Math.min(m.length, max)));

  function matchesMasked(s) {
    if (!s.includes('*') || !/[a-z]/.test(s)) return false;
    const re = new RegExp('^' + s.replace(/\*/g, '[a-z]') + '$');
    return CANONICAL.some((w) => re.test(w));
  }

  function isProfane(token) {
    const n = normalize(token);
    if (!n) return false;
    if (matchesMasked(n)) return true;
    // Test with repeats collapsed to 2 ("ass") and to 1 ("fuuuck" -> "fuck").
    for (const v of new Set([collapse(n, 2), collapse(n, 1)])) {
      if (PATTERNS.some((re) => re.test(v))) return true;
    }
    return false;
  }

  // Worth asking the classifier about: word-list hit, masked form, or a token
  // that contains a profanity root (class, assassin, Dick…).
  function isSuspicious(token) {
    const n = normalize(token);
    if (!n) return false;
    if (isProfane(token) || n.includes('*')) return true;
    const c = collapse(n, 1);
    return ROOTS.some((r) => n.includes(r) || c.includes(collapse(r, 1)));
  }

  const STOPWORDS = new Set((
    'a about above after again against all am an and any are as at be because been before being below between both ' +
    'but by can could did do does doing down during each few for from further had has have having he her here hers ' +
    'herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off ' +
    'on once only or other our ours ourselves out over own same she should so some such than that the their theirs ' +
    'them themselves then there these they this those through to too under until up very was we were what when where ' +
    'which while who whom why will with would you your yours yourself yourselves im youre dont cant wont didnt isnt ' +
    'thats its ok okay yeah yes oh uh um like go going get got one two three know think want really right well see ' +
    'come back time now good bro guys man dude lol lmao gg'
  ).split(' '));

  function isStopword(token) {
    return STOPWORDS.has(String(token).toLowerCase().replace(/[^a-z]/g, ''));
  }

  Object.assign(ss, { normalize, isProfane, isSuspicious, isStopword });
})();
