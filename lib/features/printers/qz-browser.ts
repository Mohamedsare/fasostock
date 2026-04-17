/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Connexion QZ Tray côté navigateur (client uniquement).
 * La signature des requêtes passe par POST /api/qz/sign (clé privée côté serveur).
 */

export type QzModule = typeof import("qz-tray");

let qzPromise: Promise<QzModule["default"]> | null = null;

export function loadQz(): Promise<QzModule["default"]> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("QZ indisponible côté serveur"));
  }
  if (!qzPromise) {
    qzPromise = import("qz-tray").then((m) => m.default ?? (m as any));
  }
  return qzPromise;
}

export async function configureQzSecurity(qz: QzModule["default"]): Promise<void> {
  qz.security.setSignatureAlgorithm("SHA512");

  qz.security.setCertificatePromise((resolve: (c: string | null) => void) => {
    resolve(null);
  });

  qz.security.setSignaturePromise((toSign: string) => {
    return (resolve: (sig: string) => void, reject: (e: Error) => void) => {
      void (async () => {
        try {
          const res = await fetch("/api/qz/sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ request: toSign }),
          });
          const json = (await res.json()) as { signature?: string; error?: string };
          if (!res.ok) {
            throw new Error(
              json.error ??
                (res.status === 503
                  ? "Signature QZ non configurée sur le serveur (QZ_PRIVATE_KEY_PEM)."
                  : `Signature refusée (${res.status})`),
            );
          }
          if (!json.signature) throw new Error("Réponse de signature invalide");
          resolve(json.signature);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      })();
    };
  });
}

export async function connectQz(qz: QzModule["default"]): Promise<void> {
  if (qz.websocket.isActive()) return;
  await configureQzSecurity(qz);
  try {
    await qz.websocket.connect();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already exists") && qz.websocket.isActive()) return;
    throw e;
  }
}

export type PrinterRow = {
  name: string;
  /** Libellé brut renvoyé par l’OS / QZ (souvent proche du nom). */
  status?: string;
};

export async function listPrintersDetailed(
  qz: QzModule["default"],
): Promise<PrinterRow[]> {
  try {
    const details = (await qz.printers.details()) as unknown;
    if (Array.isArray(details) && details.length > 0) {
      const rows = details
        .map((d: any) => ({
          name: String(d.name ?? d.printer ?? ""),
          status:
            d.status != null
              ? String(d.status)
              : d.default === true
                ? "Par défaut"
                : undefined,
        }))
        .filter((r) => r.name.length > 0);
      if (rows.length > 0) return rows;
    }
  } catch {
    /* fallback find */
  }
  const names = (await qz.printers.find()) as string | string[];
  if (Array.isArray(names)) return names.map((name) => ({ name }));
  return [{ name: String(names) }];
}

function escPosTestTicket(): string {
  const ESC = "\x1B";
  const GS = "\x1D";
  const lines = [
    ESC + "@",
    ESC + "a" + "\x01",
    "FasoStock — test ticket\n",
    "------------------------\n",
    "Impression thermique OK\n",
    "\n\n",
    GS + "V" + "\x00",
  ];
  return lines.join("");
}

const A4_TEST_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
body{font-family:system-ui,-apple-system,sans-serif;padding:16mm;font-size:11pt;color:#111}
h1{font-size:16pt;margin:0 0 8px} .muted{color:#555;font-size:10pt}
</style></head><body>
<h1>Test facture A4</h1>
<p class="muted">FasoStock — si ce document sort sur la bonne imprimante, l’association est correcte.</p>
<p>${new Date().toLocaleString("fr-FR")}</p>
</body></html>`;

export async function printThermalTest(
  qz: QzModule["default"],
  printerName: string,
): Promise<void> {
  const config = qz.configs.create(printerName);
  await qz.print(config, [
    {
      type: "raw",
      format: "command",
      flavor: "plain",
      data: escPosTestTicket(),
    },
  ]);
}

export async function printA4Test(
  qz: QzModule["default"],
  printerName: string,
): Promise<void> {
  const config = qz.configs.create(printerName, {
    size: { width: 8.27, height: 11.69 },
    units: "in",
    scaleContent: true,
  });
  await qz.print(config, [
    {
      type: "pixel",
      format: "html",
      flavor: "plain",
      data: A4_TEST_HTML,
    },
  ]);
}
