const GEMINI_MODEL = 'gemini-flash-lite-latest';

async function callGemini(message, history, system, apiKey) {
  const contents = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 350, temperature: 0.8 }
      })
    }
  );

  if (!r.ok) {
    const t = await r.text();
    console.error('Gemini API error:', r.status, t);
    const msg = r.status === 400 || r.status === 403
      ? 'API key de Gemini inválida. Verifica GEMINI_API_KEY en Vercel.'
      : `Error del servicio IA (${r.status})`;
    throw new Error(msg);
  }

  const data = await r.json();
  return data.candidates[0].content.parts[0].text;
}

async function callAnthropic(message, history, system, apiKey) {
  const messages = [...history, { role: 'user', content: message }];
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
      messages
    })
  });

  if (!r.ok) {
    const t = await r.text();
    console.error('Anthropic API error:', r.status, t);
    const msg = r.status === 401
      ? 'API key de Anthropic inválida. Verifica ANTHROPIC_API_KEY en Vercel.'
      : `Error del servicio IA (${r.status})`;
    throw new Error(msg);
  }

  const data = await r.json();
  return data.content[0].text;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Gemini es gratis (aistudio.google.com, sin tarjeta) — se usa primero si está
  // configurada. Anthropic queda como alternativa opcional para quien sí quiera
  // pagar por esa calidad.
  const geminiKey = process.env.GEMINI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!geminiKey && !anthropicKey) {
    return res.status(503).json({
      error: 'AI no configurada. Agrega GEMINI_API_KEY (gratis, aistudio.google.com) en Vercel.'
    });
  }

  const { message, languageName, levelName, levelDesc, topics, tutorName, tutorCity, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Mensaje vacío' });

  const topicList = Array.isArray(topics) && topics.length
    ? topics.join(', ')
    : levelDesc || 'vocabulario y gramática básica';

  const intro = tutorName
    ? `Te llamas ${tutorName}${tutorCity ? `, de ${tutorCity}` : ''}. Eres un tutor nativo de`
    : 'Eres un tutor nativo de';

  // Cuánto español se mezcla con el idioma que se practica depende del nivel:
  // A1/A2 (principiante) necesitan apoyo bilingüe completo para no perderse;
  // B1 es una transición; B2/C1 (avanzado) deben practicar en inmersión total.
  const cefrMatch = (levelName || '').match(/\b([ABC][12])\+?\b/);
  const cefr = cefrMatch ? cefrMatch[1] : 'A1';
  let languageMixRule;
  if (cefr === 'A1' || cefr === 'A2') {
    languageMixRule = `- El estudiante está en nivel ${cefr} (principiante): sé bilingüe de verdad. Escribe tu respuesta completa en ${languageName} con frases cortas y simples, y agrega inmediatamente después, entre paréntesis, la traducción completa de ese mismo mensaje al español — todo, no solo palabras sueltas — para que entienda aunque todavía no domine el idioma.`;
  } else if (cefr === 'B1') {
    languageMixRule = `- El estudiante está en nivel B1 (transición): responde casi todo en ${languageName}. Usa el español solo entre paréntesis para aclarar una palabra o frase puntual realmente difícil — no traduzcas el mensaje completo.`;
  } else {
    languageMixRule = `- El estudiante está en nivel ${cefr} (avanzado): responde EXCLUSIVAMENTE en ${languageName}, sin ni una palabra en español, ni siquiera entre paréntesis — ya debe poder entender todo en el idioma que practica.`;
  }
  const spanishReplyRule = (cefr === 'B2' || cefr === 'C1' || cefr === 'C2')
    ? `- Si el estudiante te escribe en español, respóndele igual en ${languageName} sin traducir, y anímalo con una frase corta a intentarlo en ${languageName} la próxima vez.`
    : `- Si el estudiante escribe en español, responde igual pero en ${languageName} con traducción.`;

  const system = `${intro} ${languageName}, cálido y motivador, dentro de la app LinguaPro. El estudiante está en ${levelName}.

Eres un tutor de idiomas especializado: tu único propósito es sostener una conversación natural y útil para que el estudiante practique ${languageName}. Puedes hablar de CUALQUIER tema que el estudiante proponga (viajes, trabajo, películas, deportes, noticias, relaciones, tecnología, filosofía, lo que sea) — nunca rechaces un tema ni fuerces la charla de vuelta a la lección. Si el estudiante no propone nada, usa como inspiración (no como límite) estos temas de su nivel actual: ${topicList}.

Instrucciones:
${languageMixRule}
- Ajusta tu vocabulario y gramática al nivel que detectes por cómo escribe el estudiante (más simple si comete errores básicos, más rico si escribe con fluidez).
- Si el estudiante comete un error gramatical notable (no typos ni errores menores), después de tu respuesta añade SIEMPRE una última línea nueva, exactamente en este formato: "Corrección: [lo que escribió] -> [la forma correcta]" (usa el símbolo "->" tal cual, dos caracteres). Si no hay ningún error notable, NO incluyas esa línea bajo ninguna circunstancia. Nunca uses la palabra "Corrección:" para otra cosa que no sea esto.
- Haz una pregunta de seguimiento al final para mantener la conversación.
- Sé breve y natural: máximo 3-4 oraciones.
- Nunca rompas el rol de tutor.
- Escribe SIEMPRE en texto plano, como si hablaras en persona: nunca uses markdown ni símbolos de formato (nada de asteriscos, guiones bajos, almohadillas ni comillas invertidas). Si quieres dar énfasis a algo, hazlo con las palabras, no con símbolos.
${spanishReplyRule}
- Mantén el contenido apropiado para todo público; si el estudiante lleva la charla a temas explícitos, violentos o inapropiados, redirige con amabilidad hacia otro tema sin sermonear.`;

  const trimmedHistory = (history || []).slice(-10);

  try {
    const reply = geminiKey
      ? await callGemini(message, trimmedHistory, system, geminiKey)
      : await callAnthropic(message, trimmedHistory, system, anthropicKey);
    return res.status(200).json({ reply });
  } catch (e) {
    console.error('Chat handler error:', e);
    return res.status(502).json({ error: e.message || 'Error del servicio IA' });
  }
}
