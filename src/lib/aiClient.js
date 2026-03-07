/**
 * FasoStock - Client pour l'API IA (appel à /api/ai)
 * En local : lancez "npm run dev:local" (ou "npm run api" + "npm run dev") avec DEEPSEEK_API_KEY dans .env ou .env.local.
 */
const getBaseUrl = () => {
  if (import.meta.env.DEV) return '';
  return window.location.origin;
};

function getErrorMessage(res, text) {
  if (res.status === 404) {
    return 'L\'API IA n\'est pas disponible. Lancez "npm run dev:local" (avec DEEPSEEK_API_KEY dans .env) ou "vercel dev".';
  }
  if (res.status === 502 || res.status === 503) {
    return 'Service IA temporairement indisponible. Réessayez dans un instant.';
  }
  try {
    const err = typeof text === 'string' ? JSON.parse(text || '{}') : text;
    return err.message || err.error || `Erreur API IA (${res.status})`;
  } catch {
    return text?.slice(0, 200) || `Erreur API IA (${res.status})`;
  }
}

export async function invokeAI({ prompt, response_json_schema }) {
  const url = `${getBaseUrl()}/api/ai`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, response_json_schema }),
    });
  } catch (err) {
    throw new Error(
      import.meta.env.DEV
        ? 'Impossible de joindre l\'API IA. Lancez "npm run dev:local" (API + front) ou "npm run api" dans un terminal.'
        : (err?.message || 'Erreur réseau API IA')
    );
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(getErrorMessage(res, text));
  }

  if (response_json_schema) {
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }
  return text;
}
