/**
 * Conversion d'un entier positif en toutes lettres (français), pour le
 * « montant en lettres » des factures. Gère les accords : cent(s),
 * quatre-vingt(s), million(s), milliard(s). « mille » est invariable.
 */

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
];

const TENS: Record<number, string> = {
  20: "vingt",
  30: "trente",
  40: "quarante",
  50: "cinquante",
  60: "soixante",
  70: "soixante",
  80: "quatre-vingt",
  90: "quatre-vingt",
};

/** Convertit 0..999 en lettres. `isThousandGroup` gère l'accord de « cent ». */
function underThousand(n: number, plural: boolean): string {
  if (n === 0) return "";
  if (n < 17) return UNITS[n]!;
  if (n < 100) {
    const t = Math.floor(n / 10) * 10;
    const u = n % 10;
    // 70-79 et 90-99 : base 60/80 + (10..19).
    if (t === 70 || t === 90) {
      const base = t === 70 ? 60 : 80;
      const rem = n - base; // 10..19
      const remWord = rem < 17 ? UNITS[rem]! : underThousand(rem, false);
      return `${TENS[t]}-${remWord}`;
    }
    if (u === 0) {
      // 80 seul prend un s (quatre-vingts) ; sinon pas de s.
      return t === 80 ? "quatre-vingts" : TENS[t]!;
    }
    // 21, 31, ... 61, 81 : liaison « et un » (sauf 81 → quatre-vingt-un).
    const sep = u === 1 && t !== 80 ? " et " : "-";
    return `${TENS[t]}${sep}${UNITS[u]!}`;
  }
  // 100..999
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const centWord =
    h === 1
      ? "cent"
      : // « cents » seulement si multiple ET rien après.
        rem === 0 && plural
        ? `${UNITS[h]!} cents`
        : `${UNITS[h]!} cent`;
  if (rem === 0) return centWord;
  return `${centWord} ${underThousand(rem, false)}`;
}

/** Entier positif en toutes lettres (français). */
export function integerToFrenchWords(value: number): string {
  const n = Math.max(0, Math.trunc(value));
  if (n === 0) return "zéro";

  const milliard = Math.floor(n / 1_000_000_000);
  const million = Math.floor((n % 1_000_000_000) / 1_000_000);
  const mille = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;

  const parts: string[] = [];

  if (milliard > 0) {
    parts.push(`${underThousand(milliard, true)} milliard${milliard > 1 ? "s" : ""}`);
  }
  if (million > 0) {
    parts.push(`${underThousand(million, true)} million${million > 1 ? "s" : ""}`);
  }
  if (mille > 0) {
    // « mille » invariable ; « un mille » ne se dit pas → « mille ».
    parts.push(mille === 1 ? "mille" : `${underThousand(mille, true)} mille`);
  }
  if (reste > 0) {
    parts.push(underThousand(reste, true));
  }

  return parts.join(" ").trim();
}

/** Montant en francs CFA en toutes lettres, capitalisé. Ex. « Sept cent mille francs CFA ». */
export function amountToFrenchWordsCFA(value: number): string {
  const words = integerToFrenchWords(value);
  const capitalized = words.charAt(0).toUpperCase() + words.slice(1);
  return `${capitalized} franc${value >= 2 ? "s" : ""} CFA`;
}
