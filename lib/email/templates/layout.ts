/** Enveloppe HTML minimale pour les emails transactionnels FasoStock. */
export function emailLayout(params: { title: string; bodyHtml: string; preheader?: string }): string {
  const preheader = params.preheader ?? params.title;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;">
  <span style="display:none;max-height:0;overflow:hidden;color:transparent;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr>
            <td style="padding:24px 28px;background:linear-gradient(135deg,#ea580c 0%,#c2410c 100%);">
              <p style="margin:0;font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">FasoStock</p>
              <p style="margin:6px 0 0;font-size:12px;color:#ffedd5;">Gestion de stock &amp; caisse — Burkina Faso</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;font-size:15px;line-height:1.6;color:#334155;">
              ${params.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b;">
              <p style="margin:0;">Cet email a été envoyé par FasoStock (fasostock.com).</p>
              <p style="margin:8px 0 0;">Besoin d'aide ? <a href="mailto:contact@fasostock.com" style="color:#ea580c;">contact@fasostock.com</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ctaButton(href: string, label: string): string {
  const safeHref = escapeHtml(href);
  const safeLabel = escapeHtml(label);
  return `<p style="margin:24px 0 0;text-align:center;">
    <a href="${safeHref}" style="display:inline-block;padding:12px 24px;background:#ea580c;color:#ffffff;font-weight:700;text-decoration:none;border-radius:9999px;font-size:14px;">${safeLabel}</a>
  </p>`;
}
