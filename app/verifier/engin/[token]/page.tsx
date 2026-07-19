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
};

function fcfa(n: number): string {
  return `${Math.round(Number(n) || 0).toLocaleString("fr-FR")} CFA`;
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
            </div>
          ) : (
            <div style={{ padding: "24px 20px", textAlign: "center", color: "#6b7280", fontSize: 14 }}>
              Vérifiez que le QR code a été scanné correctement, ou contactez le vendeur.
            </div>
          )}
        </div>

        <p style={{ textAlign: "center", color: "#9ca3af", fontSize: 11, marginTop: 16 }}>
          Vérification fournie par FasoStock — les informations sensibles ne sont pas affichées.
        </p>
      </div>
    </main>
  );
}
