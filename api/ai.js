/**
 * FasoStock - API route Vercel pour appels IA (DeepSeek)
 * Utiliser DEEPSEEK_API_KEY dans les variables d'environnement Vercel
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'DEEPSEEK_API_KEY non configurée',
      message: 'Ajoutez DEEPSEEK_API_KEY dans les variables d\'environnement Vercel pour activer les rapports IA, prévisions et campagnes.',
    });
  }

  try {
    const { prompt, response_json_schema } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'prompt requis' });
    }

    const messages = [
      { role: 'system', content: 'Tu es un assistant expert en analyse commerciale pour une boutique de pièces moto en Afrique. Réponds en français, de manière concise et professionnelle.' },
      { role: 'user', content: prompt },
    ];

    const body = {
      model: 'deepseek-chat',
      messages,
      temperature: 0.3,
    };

    if (response_json_schema) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || response.statusText);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (response_json_schema) {
      try {
        const parsed = JSON.parse(content);
        return res.status(200).json(parsed);
      } catch {
        return res.status(200).json({ raw: content });
      }
    }

    return res.status(200).send(content);
  } catch (err) {
    console.error('AI API error:', err);
    return res.status(500).json({
      error: 'Erreur IA',
      message: err.message || 'Une erreur est survenue lors de l\'appel à l\'API.',
    });
  }
}
