// app/api/coach/route.js
// El "Pulso": briefing diario que cruza sueño, gasto, dieta, entrenos y racha.
// Mismo proveedor (Groq) que /api/nutrition. Solo texto.

export const runtime = 'edge';

const SYSTEM = `Eres el coach integral de una app personal de fitness y nutricion.
Recibes un JSON con los datos REALES de los ultimos 7 dias del usuario: Garmin (gasto kcal, sueno, FC reposo, pasos), ingesta diaria (kcal y proteina), objetivo diario, entrenos realizados, racha de registro y dias libres.

Contexto fijo del usuario:
- Objetivo: perder grasa abdominal manteniendo musculo. Deficit MODERADO, nunca agresivo.
- Proteina objetivo ~160 g/dia (su punto flojo en dieta).
- Dormir 7h+ es su mayor punto debil (media ~6h58, se acuesta tarde).
- Grupos prioritarios: pecho, hombros, brazos, abdomen.
- Le cuesta la constancia: empuja sin sermonear. Celebra lo cumplido antes de corregir.

Devuelve SOLO texto plano en espanol: EXACTAMENTE 4 lineas, cada una de maximo 110 caracteres, empezando con su simbolo y un espacio:
◐ [sueno/recuperacion: lee el ultimo sueno registrado y di como afrontar hoy]
⌁ [energia/balance: compara ingesta vs gasto reales de los ultimos dias y di si el deficit va bien]
⚡ [entreno: que toca hoy segun lo que hizo esta semana y como durmio]
◆ [constancia: estado de racha y registro, con un empujon concreto y humano]

Reglas: usa SOLO datos presentes en el JSON; si falta algo, di algo util sin inventar numeros. Redondea. Nada de saludos, markdown, comillas ni lineas extra. Especifico y humano, cero frases genericas de motivacion vacia.`;

export async function POST(req) {
  try {
    const { snapshot } = await req.json();
    if (!snapshot) return Response.json({ error: 'sin datos' }, { status: 400 });

    const key = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: 'falta GROQ_API_KEY' }, { status: 500 });

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.6,
        max_tokens: 300,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: JSON.stringify(snapshot) },
        ],
      }),
    });

    if (!r.ok) return Response.json({ error: 'IA fallo' }, { status: 502 });
    const data = await r.json();
    const text = (data?.choices?.[0]?.message?.content || '').trim();
    if (!text) return Response.json({ error: 'respuesta vacia' }, { status: 502 });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
