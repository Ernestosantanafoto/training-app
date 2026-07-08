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

El JSON incluye "hoy_ahora" con el estado VIVO del dia: hora local, kcal y proteina ya comidas HOY, sesiones hechas HOY y gasto Garmin parcial de hoy si existe. Tus 4 lineas hablan de HOY EN ADELANTE, no de ayer:
◐ [recuperacion: sueno de ANOCHE (el mas reciente) + fc/bb -> como afrontar lo que queda de hoy]
◆ [comida de HOY: con hoy_ahora.kcal_comidas_hoy y prot_hoy_g vs objetivo, di que le falta HOY (se concreto: cuanta proteina y kcal quedan); segun la hora, orienta la siguiente comida]
⚡ [entreno de HOY: segun sesiones_hoy, grupos_48h y cardio_hoy, di que toca o que NO toca hoy]
◆ [constancia: racha y un empujon concreto]
Cuidado: la primera y ultima linea usan simbolos distintos: la 2a linea usa ⌁ no ◆. Orden exacto de simbolos: ◐ ⌁ ⚡ ◆.

El JSON incluye "flags" con patrones ya calculados. Usalos asi:
- flags.cardio_hoy true y gym_hoy false -> en la linea de entreno, desaconseja añadir hierro hoy o recomienda hacerlo suave: sus datos demuestran que cardio+hierro el mismo dia le desploma los pesos.
- flags.grupos_entrenados_48h -> NO recomiendes entrenar esos grupos hoy; sugiere un dia del protocolo con grupos descansados (prioridades: pecho, hombros, brazos, abdomen).
- flags.fc_ultima >= flags.fc_media_30d + 4 -> señala fatiga/recuperacion pendiente en la linea de sueño.
- flags.bb_ultimo bajo (<40) -> dia de gestionar energia, no de forzar.
- flags.pct_kcal_indulgente_7d > 35 -> mencionalo con datos y sin drama en la linea de balance o constancia.

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
