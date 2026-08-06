import { callAi } from './_ai.js';

// Explica por qué una respuesta de Quiz o ReadGym estuvo mal, en 1-2
// oraciones, breve y sin regañar. Se usa tanto para las preguntas de
// comprensión/vocabulario de ReadGym como para el Quiz semanal.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { question, chosenAnswer, correctAnswer, languageName } = req.body || {};
  if (!question || chosenAnswer == null || correctAnswer == null) {
    return res.status(400).json({ error: 'Faltan datos de la pregunta' });
  }

  const system = `Eres un tutor de idiomas que ayuda a un estudiante hispanohablante que está aprendiendo ${languageName || 'un idioma'} dentro de la app LinguaPro. El estudiante acaba de responder mal una pregunta de comprensión o vocabulario.

Explica en español, en 1-2 oraciones breves y claras, por qué su respuesta está mal y por qué la respuesta correcta es la correcta. Sé cálido y alentador — nunca regañón ni condescendiente, como si fuera un profesor paciente explicando algo pequeño. No repitas la pregunta completa, ve directo a la explicación. Responde en texto plano, sin markdown ni símbolos de formato.`;

  const message = `Pregunta: "${question}"\nEl estudiante respondió (incorrecto): "${chosenAnswer}"\nLa respuesta correcta era: "${correctAnswer}"\n\nExplica el porqué.`;

  try {
    const explanation = await callAi(message, [], system, { maxTokens: 150, temperature: 0.6 });
    return res.status(200).json({ explanation });
  } catch (e) {
    console.error('Explain handler error:', e);
    return res.status(502).json({ error: e.message || 'Error del servicio IA' });
  }
}
