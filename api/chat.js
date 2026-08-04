export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI no configurada. Agrega ANTHROPIC_API_KEY en Vercel.' });

  const { message, languageName, levelName, levelDesc, topics, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Mensaje vacío' });

  const topicList = Array.isArray(topics) && topics.length
    ? topics.join(', ')
    : levelDesc || 'vocabulario y gramática básica';

  const system = `Eres un tutor de ${languageName} entusiasta y motivador. El estudiante está en ${levelName}.
Los temas que está estudiando ahora: ${topicList}.

Instrucciones:
- Responde PRINCIPALMENTE en ${languageName} para que el estudiante practique
- Usa vocabulario y estructuras apropiadas para su nivel
- Si necesitas explicar gramática o algo difícil, añade una pequeña aclaración en español entre paréntesis
- Corrige errores con amabilidad: di la forma correcta y continúa
- Haz una pregunta de seguimiento al final para mantener la conversación
- Sé breve y natural: máximo 3-4 oraciones
- Nunca rompas el rol de tutor
- Si el estudiante escribe en español, responde igual pero en ${languageName} con traducción`;

  const trimmedHistory = (history || []).slice(-10);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        system,
        messages: [...trimmedHistory, { role: 'user', content: message }]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('Anthropic API error:', r.status, t);
      return res.status(502).json({ error: 'Error del servicio IA' });
    }

    const data = await r.json();
    return res.status(200).json({ reply: data.content[0].text });
  } catch (e) {
    console.error('Chat handler error:', e);
    return res.status(500).json({ error: 'Error interno' });
  }
}
