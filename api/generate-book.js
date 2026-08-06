import { callAi } from './_ai.js';

const LEVEL_GUIDE = {
  A1: 'Frases muy cortas y simples, presente simple, vocabulario básico cotidiano. Cada capítulo: 80-120 palabras.',
  A2: 'Frases cortas, presente y pasado simple, vocabulario cotidiano ampliado. Cada capítulo: 120-180 palabras.',
  B1: 'Frases de longitud media, varios tiempos verbales, vocabulario más variado. Cada capítulo: 180-260 palabras.',
  B2: 'Estructuras más complejas, vocabulario abstracto, matices. Cada capítulo: 250-350 palabras.',
  C1: 'Registro rico, estructuras complejas, vocabulario avanzado e idiomático. Cada capítulo: 300-420 palabras.'
};

function slugify(str) {
  return (str || 'libro')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'libro';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { languageName, langId, level, existingTitles = [] } = req.body || {};
  if (!languageName || !langId || !level) {
    return res.status(400).json({ error: 'Faltan datos (idioma o nivel)' });
  }

  const guide = LEVEL_GUIDE[level] || LEVEL_GUIDE.A1;
  // Las traducciones al español solo tienen sentido si el idioma que se
  // practica NO es ya el español (si no, el modelo termina "traduciendo"
  // a cualquier otro idioma al azar, como pasó generando un libro en
  // español con qEs/optsEs en inglés).
  const needsBilingual = (level === 'A1' || level === 'A2') && langId !== 'es';
  const avoidList = existingTitles.length
    ? `Estos títulos ya existen en la librería, NO los repitas ni escribas algo muy parecido: ${existingTitles.join(', ')}.`
    : '';

  const system = `Eres un escritor de lecturas graduadas para estudiantes de idiomas, escribiendo para la app LinguaPro. Escribes una historia original y corta en ${languageName}, nivel ${level} del Marco Común Europeo.

Nivel de dificultad: ${guide}

${avoidList}

Responde ÚNICAMENTE con un objeto JSON válido (sin markdown, sin \`\`\`), con esta forma EXACTA:
{
  "title": "título del libro en ${languageName}",
  "genre": "género breve (ej. Misterio, Vida Cotidiana, Aventura)",
  "description": "1-2 oraciones en español describiendo el libro",
  "chapters": [
    {
      "title": "título del capítulo en ${languageName}",
      "text": "el texto del capítulo en ${languageName}, con saltos de línea \\n\\n entre párrafos",
      "vocab": [
        { "word": "palabra en ${languageName}", "def": "definición sencilla EN ${languageName.toUpperCase()}"${needsBilingual ? ', "defEs": "traducción de esa definición al español"' : ''} }
      ],
      "quiz": [
        { "q": "pregunta de comprensión en ${languageName}", "opts": ["opción 1","opción 2","opción 3","opción 4"], "ci": 0${needsBilingual ? ', "qEs": "traducción de la pregunta al español", "optsEs": ["trad 1","trad 2","trad 3","trad 4"]' : ''} }
      ]
    }
  ]
}

Reglas:
- Exactamente 3 capítulos, cada uno una escena o avance real de la historia (no repitas la misma escena).
- Cada capítulo: exactamente 5 palabras de vocabulario y 4 preguntas de quiz.
- "ci" es el índice (0-3) de la opción correcta en "opts".
- La historia debe tener un arco narrativo simple: inicio, desarrollo, cierre.
- No uses markdown ni símbolos de formato en ningún texto.`;

  try {
    const raw = await callAi(
      `Escribe un libro nuevo y original de nivel ${level} en ${languageName}.`,
      [],
      system,
      { maxTokens: 4000, temperature: 0.9, json: true }
    );

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error('generate-book: JSON parse failed', raw.slice(0, 500));
      return res.status(502).json({ error: 'La IA devolvió un formato inválido. Intenta de nuevo.' });
    }

    if (!parsed.title || !Array.isArray(parsed.chapters) || !parsed.chapters.length) {
      return res.status(502).json({ error: 'La IA devolvió un libro incompleto. Intenta de nuevo.' });
    }

    const bookId = `ai-${langId}-${level.toLowerCase()}-${slugify(parsed.title)}-${Date.now().toString(36)}`;
    const book = {
      id: bookId,
      title: parsed.title,
      author: 'LinguaPro IA',
      level,
      language: langId,
      genre: parsed.genre || 'Historia Original',
      description: parsed.description || '',
      custom: true,
      chapters: parsed.chapters.map((ch, i) => ({
        id: `${bookId}-${i + 1}`,
        title: ch.title || `Capítulo ${i + 1}`,
        text: ch.text || '',
        vocab: Array.isArray(ch.vocab) ? ch.vocab : [],
        quiz: Array.isArray(ch.quiz) ? ch.quiz : []
      }))
    };

    return res.status(200).json({ book });
  } catch (e) {
    console.error('generate-book handler error:', e);
    return res.status(502).json({ error: e.message || 'Error del servicio IA' });
  }
}
