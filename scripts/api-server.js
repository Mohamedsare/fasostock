/**
 * Serveur API IA local pour le dev (équivalent de api/ai.js Vercel).
 * Lit DEEPSEEK_API_KEY depuis .env ou .env.local.
 * Lancer avec: npm run api (ou node scripts/api-server.js)
 */
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.API_PORT) || 3001;

function loadEnv(file) {
  const path = join(process.cwd(), file);
  if (!existsSync(path)) return;
  try {
    const content = readFileSync(path, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch (_) {}
}

loadEnv('.env');
loadEnv('.env.local');

async function handleAi(body) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return { status: 500, json: { error: 'DEEPSEEK_API_KEY non configurée', message: 'Créez un fichier .env ou .env.local à la racine avec DEEPSEEK_API_KEY=sk-...' } };
  }
  const { prompt, response_json_schema } = body;
  if (!prompt) return { status: 400, json: { error: 'prompt requis' } };

  const messages = [
    { role: 'system', content: 'Tu es un assistant expert en analyse commerciale pour une boutique de pièces moto en Afrique. Réponds en français, de manière concise et professionnelle.' },
    { role: 'user', content: prompt },
  ];
  const reqBody = { model: 'deepseek-chat', messages, temperature: 0.3 };
  if (response_json_schema) reqBody.response_format = { type: 'json_object' };

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(reqBody),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || response.statusText);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (response_json_schema) {
    try {
      return { status: 200, json: JSON.parse(content) };
    } catch {
      return { status: 200, json: { raw: content } };
    }
  }
  return { status: 200, text: content };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/api/ai') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  let body = '';
  for await (const chunk of req) body += chunk;
  let parsed;
  try {
    parsed = JSON.parse(body || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }
  try {
    const result = await handleAi(parsed);
    res.writeHead(result.status, { 'Content-Type': result.json !== undefined ? 'application/json' : 'text/plain; charset=utf-8' });
    res.end(result.json !== undefined ? JSON.stringify(result.json) : result.text);
  } catch (err) {
    console.error('AI API error:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Erreur IA', message: err.message || "Une erreur est survenue lors de l'appel à l'API." }));
  }
});

server.listen(PORT, () => {
  console.log(`[FasoStock] API IA locale sur http://localhost:${PORT}/api/ai`);
  if (!process.env.DEEPSEEK_API_KEY) console.warn('[FasoStock] DEEPSEEK_API_KEY absente : ajoutez-la dans .env ou .env.local');
});
