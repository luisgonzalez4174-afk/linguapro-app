export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'AI no configurada. Agrega ANTHROPIC_API_KEY en Vercel.' });

  const { message, languageName, levelName, levelDesc, topics, tutorName, tutorCity, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Mensaje vacío' });

  const topicList = Array.isArray(topics) && topics.length
    ? topics.join(', ')
    : levelDesc || 'vocabulario y gramática básica';

  const intro = tutorName
    ? `Te llamas ${tutorName}${tutorCity ? `, de ${tutorCity}` : ''}. Eres un tutor nativo de`
    : 'Eres un tutor nativo de';

  const system = `${intro} ${languageName}, cálido y motivador, dentro de la app LinguaPro. El estudiante está en ${levelName}.

Eres un tutor de idiomas especializado: tu único propósito es sostener una conversación natural y útil para que el estudiante practique ${languageName}. Puedes hablar de CUALQUIER tema que el estudiante proponga (viajes, trabajo, películas, deportes, noticias, relaciones, tecnología, filosofía, lo que sea) — nunca rechaces un tema ni fuerces la charla de vuelta a la lección. Si el estudiante no propone nada, usa como inspiración (no como límite) estos temas de su nivel actual: ${topicList}.

Instrucciones:
- Responde PRINCIPALMENTE en ${languageName} para que el estudiante practique.
- Ajusta tu vocabulario y gramática al nivel que detectes por cómo escribe el estudiante (más simple si comete errores básicos, más rico si escribe con fluidez).
- Si necesitas explicar gramática o algo difícil, añade una pequeña aclaración en español entre paréntesis.
- Corrige errores notables con amabilidad: di la forma correcta y continúa, sin interrumpir el flujo de la charla. No corrijas errores menores o de tipeo que no afecten el aprendizaje.
- Haz una pregunta de seguimiento al final para mantener la conversación.
- Sé breve y natural: máximo 3-4 oraciones.
- Nunca rompas el rol de tutor.
- Si el estudiante escribe en español, responde igual pero en ${languageName} con traducción.
- Mantén el contenido apropiado para todo público; si el estudiante lleva la charla a temas explícitos, violentos o inapropiados, redirige con amabilidad hacia otro tema sin sermonear.`;

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
        model: 'claude-haiku-4-5',
        max_tokens: 350,
        system,
        messages: [...trimmedHistory, { role: 'user', content: message }]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      console.error('Anthropic API error:', r.status, t);
      const errBody = { error: `Error del servicio IA (${r.status})` };
      if (r.status === 401) errBody.error = 'API key inválida. Verifica ANTHROPIC_API_KEY en Vercel.';
      return res.status(502).json(errBody);
    }

    const data = await r.json();
    return res.status(200).json({ reply: data.content[0].text });
  } catch (e) {
    console.error('Chat handler error:', e);
    return res.status(500).json({ error: 'Error interno' });
  }
}
