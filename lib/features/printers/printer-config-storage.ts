/**
 * Persistance locale des associations imprimante ↔ type de document (QZ Tray).
 * Clé séparée par utilisateur + entreprise, avec option « cet appareil » (profil navigateur).
 */

export const PRINTER_CONFIG_VERSION = 2 as const;

export type PrinterScope = "user" | "device";

export type StoredPrinterAssociations = {
  v: typeof PRINTER_CONFIG_VERSION;
  thermalPrinterName: string | null;
  a4PrinterName: string | null;
  scope: PrinterScope;
  updatedAt: string;
};

const CLIENT_ID_KEY = "fs_client_install_id";

function getOrCreateClientId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `fs_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

export function buildPrinterConfigStorageKey(
  userId: string,
  companyId: string,
  scope: PrinterScope,
): string {
  if (scope === "device") {
    const cid = getOrCreateClientId();
    return `fs_qz_printers_v${PRINTER_CONFIG_VERSION}_d_${companyId}_${cid}`;
  }
  return `fs_qz_printers_v${PRINTER_CONFIG_VERSION}_u_${userId}_${companyId}`;
}

export function loadPrinterAssociations(
  key: string,
): StoredPrinterAssociations | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPrinterAssociations>;
    if (parsed.v !== PRINTER_CONFIG_VERSION) return null;
    return {
      v: PRINTER_CONFIG_VERSION,
      thermalPrinterName:
        typeof parsed.thermalPrinterName === "string"
          ? parsed.thermalPrinterName
          : null,
      a4PrinterName:
        typeof parsed.a4PrinterName === "string" ? parsed.a4PrinterName : null,
      scope: parsed.scope === "device" ? "device" : "user",
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Lit la préférence enregistrée : d’abord la clé « utilisateur », puis « appareil ».
 * Utile pour le POS lorsque l’utilisateur n’a pas encore ouvert la page Imprimantes.
 */
export function getPrinterSelectionForSession(
  userId: string,
  companyId: string,
): { thermal: string | null; a4: string | null; scope: PrinterScope } | null {
  const userKey = buildPrinterConfigStorageKey(userId, companyId, "user");
  const u = loadPrinterAssociations(userKey);
  if (u && (u.thermalPrinterName || u.a4PrinterName)) {
    return {
      thermal: u.thermalPrinterName,
      a4: u.a4PrinterName,
      scope: "user",
    };
  }
  const devKey = buildPrinterConfigStorageKey(userId, companyId, "device");
  const d = loadPrinterAssociations(devKey);
  if (d && (d.thermalPrinterName || d.a4PrinterName)) {
    return {
      thermal: d.thermalPrinterName,
      a4: d.a4PrinterName,
      scope: "device",
    };
  }
  return null;
}

export function savePrinterAssociations(
  key: string,
  data: Omit<StoredPrinterAssociations, "v" | "updatedAt"> &
    Partial<Pick<StoredPrinterAssociations, "updatedAt">>,
): void {
  if (typeof window === "undefined") return;
  const payload: StoredPrinterAssociations = {
    v: PRINTER_CONFIG_VERSION,
    thermalPrinterName: data.thermalPrinterName,
    a4PrinterName: data.a4PrinterName,
    scope: data.scope,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
