// app/api/nutrition/route.js
// Parsea texto libre de comida -> {name, kcal, protein, meal} usando Groq.
// Mismo proveedor de IA que ya usas en /api/ai. Solo texto, nunca imagenes.

export const runtime = 'edge';

const SYSTEM = `Eres un nutricionista que estima calorias y proteinas de comidas descritas en lenguaje natural en espanol.
Devuelve SIEMPRE y SOLO un JSON valido, sin texto adicional, sin markdown, sin backticks.
Formato exacto:
{"items":[{"name":"...","kcal":000,"protein":00,"meal":"desayuno|tentempie|comida|cena|otro"}],"total_kcal":000,"total_protein":00,"note":"..."}
Reglas:
- Estima de forma realista para porciones normales espanolas.
- Si el usuario da gramos o cantidades, usalos.
- "meal" deduce el tipo de comida por contexto; si no se sabe, usa "otro".
- protein en gramos, kcal totales del item.
- "note" breve (max 12 palabras) con cualquier aviso util, o "".
- Nunca inventes campos. Numeros enteros para kcal, enteros o 1 decimal para protein.`;

export async function POST(req) {
  try {
    const { text } = await req.json();
    if (!text || !text.trim()) {
      return Response.json({ error: 'texto vacio' }, { status: 400 });
    }

    const key = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY;
    if (!key) {
      return Response.json({ error: 'falta GROQ_API_KEY' }, { status: 500 });
    }

    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text },
        ],
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      return Response.json({ error: 'IA fallo', detail: err }, { status: 502 });
    }

    const data = await r.json();
    const raw = data?.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { items: [] };
    }

    if (!Array.isArray(parsed.items)) parsed.items = [];
    parsed.total_kcal = parsed.total_kcal ??
      parsed.items.reduce((s, i) => s + (Number(i.kcal) || 0), 0);
    parsed.total_protein = parsed.total_protein ??
      parsed.items.reduce((s, i) => s + (Number(i.protein) || 0), 0);

    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
