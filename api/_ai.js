// Helper compartido por los endpoints de IA (chat, explain, generate-book).
// El prefijo "_" hace que Vercel NO trate este archivo como su propia ruta.
const GEMINI_MODEL = 'gemini-flash-lite-latest';

export function getAiKeys() {
  return {
    geminiKey: process.env.GEMINI_API_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY
  };
}

export async function callGemini(message, history, system, apiKey, opts = {}) {
  const contents = history.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: message }] });

  const generationConfig = {
    maxOutputTokens: opts.maxTokens || 350,
    temperature: opts.temperature != null ? opts.temperature : 0.8
  };
  if (opts.json) generationConfig.responseMimeType = 'application/json';

  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents,
        generationConfig
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

export async function callAnthropic(message, history, system, apiKey, opts = {}) {
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
      max_tokens: opts.maxTokens || 350,
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

// Llama al proveedor que esté configurado (Gemini primero, gratis; Anthropic
// como alternativa). Lanza si ninguno está configurado.
export async function callAi(message, history, system, opts = {}) {
  const { geminiKey, anthropicKey } = getAiKeys();
  if (!geminiKey && !anthropicKey) {
    throw new Error('AI no configurada. Agrega GEMINI_API_KEY (gratis, aistudio.google.com) en Vercel.');
  }
  return geminiKey
    ? callGemini(message, history, system, geminiKey, opts)
    : callAnthropic(message, history, system, anthropicKey, opts);
}
