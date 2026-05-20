/** Drapeau emoji ISO 3166-1 alpha-2 (ex. BF → 🇧🇫). */
export function countryFlagEmoji(countryCode: string): string {
  const code = countryCode.toUpperCase();
  if (code.length !== 2) return "🏳️";
  return code
    .split("")
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}
