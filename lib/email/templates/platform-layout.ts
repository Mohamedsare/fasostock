import { escapeHtml } from "@/lib/email/templates/layout";

export type PlatformEmailHero = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** orange | emerald | slate */
  tone?: "orange" | "emerald" | "slate";
};

const HERO_GRADIENT: Record<NonNullable<PlatformEmailHero["tone"]>, string> = {
  orange: "linear-gradient(135deg,#ea580c 0%,#c2410c 55%,#9a3412 100%)",
  emerald: "linear-gradient(135deg,#059669 0%,#047857 55%,#065f46 100%)",
  slate: "linear-gradient(135deg,#334155 0%,#1e293b 55%,#0f172a 100%)",
};

export function platformEmailLayout(params: {
  preheader: string;
  title: string;
  hero: PlatformEmailHero;
  bodyHtml: string;
  footerNote?: string;
}): string {
  const tone = params.hero.tone ?? "orange";
  const gradient = HERO_GRADIENT[tone];
  const footerNote =
    params.footerNote ??
    "Rapport automatique FasoStock — ne pas répondre à cet email.";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <span style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;">${escapeHtml(params.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:20px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 18px 48px -28px rgba(15,23,42,0.35);">
          <tr>
            <td style="padding:28px 32px 24px;background:${gradient};">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.82);">${escapeHtml(params.hero.eyebrow)}</p>
              <p style="margin:0;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">${escapeHtml(params.hero.title)}</p>
              ${params.hero.subtitle ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:rgba(255,255,255,0.88);">${escapeHtml(params.hero.subtitle)}</p>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 12px;font-size:15px;line-height:1.65;color:#334155;">
              ${params.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;">
                <tr>
                  <td style="padding-top:18px;font-size:12px;line-height:1.55;color:#64748b;">
                    <p style="margin:0;font-weight:700;color:#475569;">FasoStock · Console plateforme</p>
                    <p style="margin:8px 0 0;">${escapeHtml(footerNote)}</p>
                    <p style="margin:8px 0 0;"><a href="mailto:contact@fasostock.com" style="color:#ea580c;text-decoration:none;font-weight:600;">contact@fasostock.com</a></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function platformStatGrid(
  items: Array<{ label: string; value: string; hint?: string; accent?: string }>,
): string {
  const rows: string[] = [];
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const tds = pair
      .map((item) => {
        const accent = item.accent ?? "#ea580c";
        return `<td width="50%" valign="top" style="padding:6px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
          <tr>
            <td style="padding:16px 18px;">
              <p style="margin:0;font-size:24px;line-height:1.1;font-weight:800;letter-spacing:-0.03em;color:${accent};">${escapeHtml(item.value)}</p>
              <p style="margin:8px 0 0;font-size:12px;font-weight:700;color:#475569;">${escapeHtml(item.label)}</p>
              ${item.hint ? `<p style="margin:4px 0 0;font-size:11px;line-height:1.45;color:#64748b;">${escapeHtml(item.hint)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>`;
      })
      .join("");
    rows.push(`<tr>${tds}${pair.length === 1 ? '<td width="50%"></td>' : ""}</tr>`);
  }

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">${rows.join("")}</table>`;
}

export function platformSectionTitle(title: string, subtitle?: string): string {
  return `<div style="margin:0 0 14px;">
    <p style="margin:0;font-size:13px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(title)}</p>
    ${subtitle ? `<p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#475569;">${escapeHtml(subtitle)}</p>` : ""}
  </div>`;
}

export function platformInfoCard(params: {
  title: string;
  lines: Array<{ label: string; value: string }>;
  accent?: string;
}): string {
  const accent = params.accent ?? "#fff7ed";
  const rows = params.lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;width:38%;vertical-align:top;">${escapeHtml(line.label)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#0f172a;vertical-align:top;">${escapeHtml(line.value)}</td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:${accent};border:1px solid #fed7aa;border-radius:16px;">
    <tr>
      <td style="padding:18px 20px;">
        <p style="margin:0 0 10px;font-size:16px;font-weight:800;color:#9a3412;">${escapeHtml(params.title)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td>
    </tr>
  </table>`;
}

export function platformCtaButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    <tr>
      <td align="center">
        <a href="${safeHref}" style="display:inline-block;padding:14px 28px;background:#ea580c;color:#ffffff;font-weight:800;text-decoration:none;border-radius:9999px;font-size:14px;letter-spacing:0.01em;box-shadow:0 10px 24px -12px rgba(234,88,12,0.65);">${safeLabel}</a>
      </td>
    </tr>
  </table>`;
}

export function platformRankList(
  items: Array<{ rank: number; title: string; meta: string; value: string }>,
): string {
  if (items.length === 0) {
    return `<p style="margin:0 0 18px;padding:14px 16px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;font-size:13px;color:#64748b;">Aucune activité notable sur cette période.</p>`;
  }

  const rows = items
    .map(
      (item) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;width:36px;vertical-align:top;">
          <span style="display:inline-block;min-width:28px;height:28px;line-height:28px;text-align:center;border-radius:9999px;background:#fff7ed;color:#ea580c;font-size:12px;font-weight:800;">${item.rank}</span>
        </td>
        <td style="padding:10px 8px;border-bottom:1px solid #f1f5f9;vertical-align:top;">
          <p style="margin:0;font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(item.title)}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#64748b;">${escapeHtml(item.meta)}</p>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:right;vertical-align:top;font-size:13px;font-weight:800;color:#0f172a;white-space:nowrap;">${escapeHtml(item.value)}</td>
      </tr>`,
    )
    .join("");

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">${rows}</table>`;
}
