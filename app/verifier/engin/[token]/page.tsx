import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérification de facture — FasoStock",
  robots: { index: false, follow: false },
};

type VerifyRow = {
  sale_number: string;
  sale_date: string;
  total: number;
  store_name: string;
  company_name: string;
  client_name: string | null;
  engine_designation: string | null;
  engine_brand: string | null;
  engine_model: string | null;
  engine_chassis: string | null;
  internal_reference: string | null;
  /**
   * Règlement : ces champs ne sont PLUS imprimés sur la facture A4 (elle circule et se
   * photocopie). On les montre ici, derrière le geste de scanner.
   */
  amount_paid: number | null;
  amount_due: number | null;
  payment_status: "paid" | "partial" | "unpaid" | null;
  payment_methods: string[] | null;
};

function fcfa(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} CFA`;
}

const PAYMENT_STATUS_LABEL: Record<string, { text: string; color: string }> = {
  paid: { text: "Payé intégralement", color: "#059669" },
  partial: { text: "Partiellement payé", color: "#b45309" },
  unpaid: { text: "Non payé", color: "#b91c1c" },
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Espèces",
  mobile_money: "Mobile money",
  card: "Carte",
  transfer: "Virement",
  other: "Autre",
};

function methodsLabel(methods: string[] | null): string | null {
  if (!methods || methods.length === 0) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of methods) {
    const label = PAYMENT_METHOD_LABEL[m] ?? m;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.join(", ") || null;
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px dashed #e5e7eb" }}>
      <span style={{ color: "#6b7280", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#111827", textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default async function VerifyEnginePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let row: VerifyRow | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("verify_engine_sale", { p_token: token });
    const arr = (data ?? []) as VerifyRow[];
    row = arr[0] ?? null;
  } catch {
    row = null;
  }

  const found = row != null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "32px 16px",
        fontFamily: "-apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#C1272D" }}>FasoStock</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Vérification officielle de facture</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)", overflow: "hidden" }}>
          <div
            style={{
              background: found ? "#059669" : "#b91c1c",
              color: "#fff",
              padding: "18px 20px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ fontSize: 26 }}>{found ? "✓" : "✕"}</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {found ? "Facture authentique" : "Facture introuvable"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.9 }}>
                {found
                  ? "Cette facture existe dans notre système."
                  : "Aucune facture ne correspond à ce code."}
              </div>
            </div>
          </div>

          {found && row ? (
            <div style={{ padding: "16px 20px" }}>
              <Row label="N° Facture" value={row.sale_number} />
              <Row
                label="Date"
                value={new Date(row.sale_date).toLocaleString("fr-FR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
              <Row label="Montant total" value={fcfa(row.total)} />
              <Row label="Vendeur" value={row.company_name} />
              <Row label="Boutique" value={row.store_name} />
              <Row label="Client" value={row.client_name} />
              <Row
                label="Engin"
                value={
                  row.engine_designation ||
                  [row.engine_brand, row.engine_model].filter(Boolean).join(" ") ||
                  null
                }
              />
              <Row label="N° châssis" value={row.engine_chassis} />
              <Row label="Référence interne" value={row.internal_reference} />

              {/* Règlement — l'information que la facture papier n'imprime plus. */}
              {row.payment_status ? (
                <div style={{ marginTop: 18 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      textTransform: "uppercase",
                      letterSpacing: ".4px",
                      color: "#6b7280",
                      borderTop: "1px solid #e5e7eb",
                      paddingTop: 14,
                      marginBottom: 4,
                    }}
                  >
                    Règlement
                  </div>
                  <Row
                    label="Montant payé"
                    value={row.amount_paid != null ? fcfa(row.amount_paid) : null}
                  />
                  <Row
                    label="Reste à payer"
                    value={row.amount_due != null ? fcfa(row.amount_due) : null}
                  />
                  <Row label="Mode de paiement" value={methodsLabel(row.payment_methods)} />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "8px 0",
                    }}
                  >
                    <span style={{ color: "#6b7280", fontWeight: 600 }}>Statut</span>
                    <span
                      style={{
                        color:
                          PAYMENT_STATUS_LABEL[row.payment_status]?.color ?? "#111827",
                        fontWeight: 700,
                        textAlign: "right",
                      }}
                    >
                      {PAYMENT_STATUS_LABEL[row.payment_status]?.text ?? row.payment_status}
                    </span>
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
                    Situation à jour au moment de ce scan. Elle change à chaque versement
                    enregistré par le vendeur.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ padding: "24px 20px", textAlign: "center", color: "#6b7280", fontSize: 14 }}>
              Vérifiez que le QR code a été scanné correctement, ou contactez le vendeur.
            </div>
          )}
        </div>

        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 16 }}>
          Vérification fournie par FasoStock — page destinée au porteur de cette facture.
          Aucune coordonnée ni information bancaire n&apos;y figure.
        </p>
      </div>
    </main>
  );
}
