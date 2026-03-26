/**
 * React Query / persistance peuvent désérialiser une `Map` en objet `{}`.
 * Garantit un `Map<string, number>` avec `.get` utilisable.
 */
export function ensureStringNumberMap(value: unknown): Map<string, number> {
  if (value instanceof Map) return value;
  if (value == null || typeof value !== "object") return new Map();
  const m = new Map<string, number>();
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    m.set(String(k), Number.isFinite(n) ? n : 0);
  }
  return m;
}
