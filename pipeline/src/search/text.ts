// Text analysis shared verbatim by the indexer (pipeline) and the query
// side (app imports this file directly). Any change here requires a
// pipeline rebuild so index and query stay in agreement.

// Standard Porter stemmer.
export function stem(w: string): string {
  if (w.length < 3) return w;

  const isCons = (s: string, i: number): boolean => {
    const c = s[i]!;
    if ("aeiou".includes(c)) return false;
    if (c === "y") return i === 0 ? true : !isCons(s, i - 1);
    return true;
  };
  const measure = (s: string): number => {
    let m = 0;
    let prevVowel = false;
    for (let i = 0; i < s.length; i++) {
      const cons = isCons(s, i);
      if (cons && prevVowel) m++;
      prevVowel = !cons;
    }
    return m;
  };
  const hasVowel = (s: string): boolean => {
    for (let i = 0; i < s.length; i++) if (!isCons(s, i)) return true;
    return false;
  };
  const endsDoubleCons = (s: string): boolean =>
    s.length >= 2 && s[s.length - 1] === s[s.length - 2] && isCons(s, s.length - 1);
  const cvc = (s: string): boolean => {
    if (s.length < 3) return false;
    const l = s.length;
    if (!isCons(s, l - 3) || isCons(s, l - 2) || !isCons(s, l - 1)) return false;
    return !"wxy".includes(s[l - 1]!);
  };

  let w2 = w;

  // 1a
  if (w2.endsWith("sses")) w2 = w2.slice(0, -2);
  else if (w2.endsWith("ies")) w2 = w2.slice(0, -2);
  else if (!w2.endsWith("ss") && w2.endsWith("s")) w2 = w2.slice(0, -1);

  // 1b
  let flag1b = false;
  if (w2.endsWith("eed")) {
    if (measure(w2.slice(0, -3)) > 0) w2 = w2.slice(0, -1);
  } else if (w2.endsWith("ed") && hasVowel(w2.slice(0, -2))) {
    w2 = w2.slice(0, -2);
    flag1b = true;
  } else if (w2.endsWith("ing") && hasVowel(w2.slice(0, -3))) {
    w2 = w2.slice(0, -3);
    flag1b = true;
  }
  if (flag1b) {
    if (w2.endsWith("at") || w2.endsWith("bl") || w2.endsWith("iz")) w2 += "e";
    else if (endsDoubleCons(w2) && !"lsz".includes(w2[w2.length - 1]!)) w2 = w2.slice(0, -1);
    else if (measure(w2) === 1 && cvc(w2)) w2 += "e";
  }

  // 1c
  if (w2.endsWith("y") && hasVowel(w2.slice(0, -1))) w2 = w2.slice(0, -1) + "i";

  // 2
  const step2: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"], ["anci", "ance"],
    ["izer", "ize"], ["abli", "able"], ["alli", "al"], ["entli", "ent"],
    ["eli", "e"], ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"], ["fulness", "ful"],
    ["ousness", "ous"], ["aliti", "al"], ["iviti", "ive"], ["biliti", "ble"],
  ];
  for (const [suf, rep] of step2) {
    if (w2.endsWith(suf)) {
      const base = w2.slice(0, -suf.length);
      if (measure(base) > 0) w2 = base + rep;
      break;
    }
  }

  // 3
  const step3: [string, string][] = [
    ["icate", "ic"], ["ative", ""], ["alize", "al"], ["iciti", "ic"],
    ["ical", "ic"], ["ful", ""], ["ness", ""],
  ];
  for (const [suf, rep] of step3) {
    if (w2.endsWith(suf)) {
      const base = w2.slice(0, -suf.length);
      if (measure(base) > 0) w2 = base + rep;
      break;
    }
  }

  // 4
  const step4 = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
    "ment", "ent", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
  ];
  for (const suf of step4) {
    if (w2.endsWith(suf)) {
      const base = w2.slice(0, -suf.length);
      if (measure(base) > 1) w2 = base;
      break;
    }
  }
  if (w2.endsWith("ion")) {
    const base = w2.slice(0, -3);
    if (measure(base) > 1 && (base.endsWith("s") || base.endsWith("t"))) w2 = base;
  }

  // 5a
  if (w2.endsWith("e")) {
    const base = w2.slice(0, -1);
    const m = measure(base);
    if (m > 1 || (m === 1 && !cvc(base))) w2 = base;
  }
  // 5b
  if (measure(w2) > 1 && endsDoubleCons(w2) && w2.endsWith("l")) w2 = w2.slice(0, -1);

  return w2;
}

const STOPWORDS = new Set(
  (
    "a an and are as at be but by for from had has have he her him his i in is it its " +
    "me my no not of on or our she so that the their them then there they this to was " +
    "we were what when which who will with you your all if would when where how am were " +
    "thee thou thy thine ye hath doth dost unto art wilt shalt o er neer eer twas tis " +
    "upon shall did do does done been being than these those such may might must let us"
  ).split(/\s+/),
);

// Lowercase, strip diacritics and punctuation (curly quotes/apostrophes
// collapse: "heart's" -> hearts), split on non-alphanumerics.
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Analysis for indexing: surface stem plus a "@group" tag for any token in
// the proper-name synonym map (applied pre-stemming to the raw token).
export function analyze(text: string, groupOf: (token: string) => string | undefined): string[] {
  const out: string[] = [];
  for (const tok of tokenize(text)) {
    out.push(stem(tok));
    // possessives/plurals: "joves" (from "Jove's") should still hit the group
    const g = groupOf(tok) ?? (tok.endsWith("s") ? groupOf(tok.slice(0, -1)) : undefined);
    if (g) out.push("@" + g);
  }
  return out;
}

export function buildGroupLookup(synonyms: Record<string, string[]>): (token: string) => string | undefined {
  const map = new Map<string, string>();
  for (const [group, variants] of Object.entries(synonyms)) {
    map.set(group.toLowerCase(), group);
    for (const v of variants) map.set(v.toLowerCase(), group);
  }
  return (token) => map.get(token);
}
