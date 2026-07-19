import QRCode from "qrcode";

/** Données de rendu de la facture A4 « Vente Engin » (toutes dynamiques). */
export type EngineInvoiceData = {
  invoiceNumber: string;
  dateLabel: string;
  timeLabel: string;
  dateLongLabel: string;

  // Vendeur (config boutique — personnalisable par entreprise)
  companyName: string;
  subtitle: string | null;
  slogan: string | null;
  address: string | null;
  phones: string[];
  logoUrl: string | null;
  primaryColor: string;
  footerText: string | null;
  signatory: string | null;
  agentName: string | null;
  place: string | null;

  // Client
  clientName: string | null;
  clientCivility: string | null;
  clientProfession: string | null;
  clientFullIdentity: string | null;
  clientIdType: string | null;
  clientIdNumber: string | null;
  clientAddress: string | null;
  clientAddressExtra: string | null;
  clientPhone1: string | null;
  clientPhone2: string | null;
  clientEmail: string | null;

  // Engin
  engineWheels: number | null;
  engineBrand: string | null;
  engineModel: string | null;
  engineDesignation: string | null;
  engineChassis: string | null;
  engineMotor: string | null;
  engineColor: string | null;
  engineCondition: string | null;
  quantity: number;

  // Montant
  total: number;
  amountInWords: string | null;

  // Paiement
  paymentMethodLabel: string | null;
  amountPaid: number | null;
  reste: number | null;
  paymentStatusLabel: string | null;

  // Garantie
  warranty: boolean;
  warrantyDuration: string | null;
  warrantyKmLimit: string | null;
  warrantyCovered: string | null;
  warrantyConditions: string | null;

  // Accessoires
  accHelmet: boolean;
  accToolkit: boolean;
  accManual: boolean;
  accKeys: boolean;
  accVest: boolean;
  accOther: string | null;

  // Divers
  observations: string | null;
  internalReference: string | null;
  verifyUrl: string;
};

function tx(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fcfa(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} CFA`;
}

/** Ligne clé/valeur ; valeur absente → « — » en gris. */
function kv(label: string, value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return `
    <div class="kv">
      <span class="k">${tx(label)}</span>
      <span class="v ${v ? "" : "muted"}">${v ? tx(v) : "—"}</span>
    </div>`;
}

function check(on: boolean, label: string): string {
  return `<div class="chk"><span class="box">${on ? "✓" : ""}</span>${tx(label)}</div>`;
}

export async function renderEngineInvoiceHtml(data: EngineInvoiceData): Promise<string> {
  const primary = data.primaryColor?.match(/^#?[0-9a-fA-F]{6}$/)
    ? data.primaryColor.startsWith("#")
      ? data.primaryColor
      : `#${data.primaryColor}`
    : "#C1272D";

  const qrDataUrl = await QRCode.toDataURL(data.verifyUrl, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const wheelsLabel =
    data.engineWheels === 2 ? "2 roues" : data.engineWheels === 3 ? "3 roues" : null;
  const conditionLabel =
    data.engineCondition === "neuf"
      ? "Neuf"
      : data.engineCondition === "occasion"
        ? "Occasion"
        : null;

  const phonesLine = data.phones.filter((p) => p.trim()).join(" | ");

  const accessories = [
    check(data.accHelmet, "Casque de protection"),
    check(data.accToolkit, "Kit d'outils"),
    check(data.accManual, "Manuel d'utilisation"),
    check(data.accKeys, "Clés de contact"),
    check(data.accVest, "Gilet de sécurité"),
    data.accOther?.trim() ? check(true, `Autre : ${data.accOther.trim()}`) : "",
  ].join("");

  const logoHtml = data.logoUrl
    ? `<img class="logo" src="${tx(data.logoUrl)}" alt="" />`
    : `<div class="logo logo-ph">🏍️</div>`;

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  @page { size: A4; margin: 0; }
  body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #1f2937; font-size: 12px; }
  .page { width: 210mm; min-height: 297mm; padding: 10mm 10mm 6mm; }
  .muted { color: ${primary}; font-weight: 600; }

  /* En-tête */
  .hdr { position: relative; display: flex; align-items: center; gap: 14px; background: #f3f4f6; border-radius: 4px; padding: 12px 16px; overflow: hidden; }
  .hdr::before { content: ""; position: absolute; top: 0; left: 0; width: 34%; height: 100%; background: ${primary}; transform: skewX(-14deg) translateX(-20%); }
  .logo-box { position: relative; z-index: 1; width: 90px; height: 64px; display: flex; align-items: center; justify-content: center; }
  .logo { max-width: 82px; max-height: 60px; object-fit: contain; }
  .logo-ph { font-size: 40px; }
  .hdr-txt { position: relative; z-index: 1; flex: 1; text-align: center; }
  .hdr-name { font-size: 26px; font-weight: 800; color: ${primary}; letter-spacing: .5px; }
  .hdr-paren { font-size: 15px; font-weight: 700; color: #111827; }
  .hdr-sub { font-size: 12px; font-weight: 700; color: #1d4ed8; margin-top: 3px; text-transform: uppercase; }
  .hdr-slogan { font-size: 11px; color: #6b7280; margin-top: 2px; }

  /* Bandeau infos facture */
  .strip { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; }
  .contact { font-size: 11px; color: #374151; line-height: 1.5; }
  .contact .addr { font-weight: 700; }
  .facture-pill { background: ${primary}; color: #fff; font-size: 22px; font-weight: 800; letter-spacing: 2px; padding: 10px 34px; border-radius: 4px; }
  .fnum { border: 1px solid #e5e7eb; border-radius: 4px; padding: 8px 12px; font-size: 11px; min-width: 150px; }
  .fnum .row { display: flex; justify-content: space-between; gap: 12px; padding: 2px 0; }
  .fnum .lbl { color: #6b7280; font-weight: 700; }
  .fnum .val { font-weight: 700; color: #111827; }

  .intro { margin: 12px 2px 4px; font-size: 12px; }

  /* Blocs */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
  .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 8px; align-items: start; }
  .card { border: 1px solid #e5e7eb; border-radius: 4px; overflow: hidden; }
  .card-h { background: #f3f4f6; border-left: 5px solid ${primary}; padding: 8px 12px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; }
  .card-b { padding: 10px 12px; }
  .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: 11.5px; border-bottom: 1px dashed #f1f1f1; }
  .kv:last-child { border-bottom: 0; }
  .kv .k { color: #374151; font-weight: 700; }
  .kv .v { text-align: right; color: #111827; }
  .chk { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 11.5px; }
  .chk .box { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border: 1.5px solid #9ca3af; border-radius: 3px; font-size: 11px; color: ${primary}; font-weight: 800; }

  .amount-big { font-size: 22px; font-weight: 800; color: #111827; }
  .total-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; background: ${primary}; color: #fff; padding: 10px 14px; border-radius: 4px; font-weight: 800; font-size: 15px; }

  .qr-wrap { text-align: center; }
  .qr-wrap img { width: 76px; height: 76px; }
  .sign-space { height: 78px; }

  .foot { margin-top: 12px; background: ${primary}; color: #fff; border-radius: 4px; padding: 8px 14px; text-align: center; font-size: 11px; font-weight: 700; }
</style></head>
<body>
  <div class="page">
    <div class="hdr">
      <div class="logo-box">${logoHtml}</div>
      <div class="hdr-txt">
        <div class="hdr-name">${tx(data.companyName)}</div>
        ${data.subtitle ? `<div class="hdr-sub">${tx(data.subtitle)}</div>` : ""}
        ${data.slogan ? `<div class="hdr-slogan">${tx(data.slogan)}</div>` : ""}
      </div>
    </div>

    <div class="strip">
      <div class="contact">
        ${data.address ? `<div class="addr">${tx(data.address)}</div>` : ""}
        ${phonesLine ? `<div>Tél. ${tx(phonesLine)}</div>` : ""}
      </div>
      <div class="facture-pill">FACTURE</div>
      <div class="fnum">
        <div class="row"><span class="lbl">N° FACTURE</span><span class="val">${tx(data.invoiceNumber)}</span></div>
        <div class="row"><span class="lbl">DATE</span><span class="val">${tx(data.dateLabel)}</span></div>
        <div class="row"><span class="lbl">HEURE</span><span class="val">${tx(data.timeLabel)}</span></div>
      </div>
    </div>

    <p class="intro">Je soussigné <strong>${tx(data.signatory || data.companyName)}</strong> reconnais avoir vendu l'engin décrit ci-dessous :</p>

    <div class="grid">
      <div class="card">
        <div class="card-h">Informations du client</div>
        <div class="card-b">
          ${kv("Nom / Structure", data.clientName)}
          ${kv("Civilité", data.clientCivility)}
          ${kv("Profession / Fonction", data.clientProfession)}
          ${kv("Type de pièce", data.clientIdType)}
          ${kv("N° de pièce", data.clientIdNumber)}
          ${kv("Adresse", data.clientAddress)}
          ${kv("Téléphone", data.clientPhone1)}
          ${kv("E-mail", data.clientEmail)}
        </div>
      </div>
      <div class="card">
        <div class="card-h">Informations de l'engin</div>
        <div class="card-b">
          ${kv("Type d'engin", wheelsLabel)}
          ${kv("Marque", data.engineBrand)}
          ${kv("Modèle", data.engineModel)}
          ${kv("Désignation", data.engineDesignation)}
          ${kv("N° châssis", data.engineChassis)}
          ${kv("N° moteur", data.engineMotor)}
          ${kv("Couleur", data.engineColor)}
          ${kv("État", conditionLabel)}
          ${kv("Quantité", String(data.quantity))}
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-h">Montant</div>
        <div class="card-b">
          ${kv("Montant en lettres", data.amountInWords)}
          <div class="kv"><span class="k">Montant en chiffres</span><span class="v amount-big">${fcfa(data.total)}</span></div>
          <div class="total-bar"><span>TOTAL À PAYER</span><span>${fcfa(data.total)}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h">Paiement</div>
        <div class="card-b">
          ${kv("Mode de paiement", data.paymentMethodLabel)}
          ${kv("Montant payé", data.amountPaid != null ? fcfa(data.amountPaid) : null)}
          ${kv("Reste à payer", data.reste != null ? fcfa(data.reste) : null)}
          ${kv("Statut", data.paymentStatusLabel)}
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-h">Accessoires remis avec la moto</div>
        <div class="card-b">${accessories}</div>
      </div>
      <div class="card">
        <div class="card-h">Garantie éventuelle</div>
        <div class="card-b">
          ${kv("Garantie", data.warranty ? "Oui" : "Non")}
          ${kv("Durée", data.warrantyDuration)}
          ${kv("Kilométrage limite", data.warrantyKmLimit)}
          ${kv("Éléments couverts", data.warrantyCovered)}
          ${kv("Conditions", data.warrantyConditions)}
        </div>
      </div>
    </div>

    <div class="grid3">
      <div class="card">
        <div class="card-h">Transaction</div>
        <div class="card-b">
          ${kv("Date / Heure", `${data.dateLongLabel} · ${data.timeLabel}`)}
          ${kv("Lieu", data.place)}
          ${kv("Agent vendeur", data.agentName)}
        </div>
      </div>
      <div class="card">
        <div class="card-h">QR de vérification</div>
        <div class="card-b qr-wrap">
          <img src="${qrDataUrl}" alt="QR" />
        </div>
      </div>
      <div class="card">
        <div class="card-h">Signature et cachet du vendeur</div>
        <div class="card-b"><div class="sign-space"></div></div>
      </div>
    </div>

    <div class="foot">
      <span>MERCI POUR LA CONFIANCE</span>
    </div>
  </div>
</body></html>`;
}
