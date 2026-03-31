/** Réduit le fuite de secrets dans les logs distants — aligné `sensitive_data_scrubber.dart` (Flutter). */

const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.+-]+\b/g;

const KV_SENSITIVE =
  /(password|passwd|secret|token|authorization|api[_-]?key|anon[_-]?key|bearer)\s*[:=]\s*[^\s,;}\]]+/gi;

export function scrubSensitiveData(input: string | null | undefined, maxLen = 4000): string {
  if (input == null || input === "") return "";
  let s = input.replace(JWT_LIKE, "[REDACTED_JWT]");
  s = s.replace(KV_SENSITIVE, (_m, key: string) => `${key}=[REDACTED]`);
  return s.length <= maxLen ? s : `${s.slice(0, maxLen)}…`;
}
