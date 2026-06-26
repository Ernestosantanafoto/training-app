const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';

async function groq(messages, maxTokens = 2000) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0.3 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Groq error');
  return data.choices[0].message.content;
}

function fixYear(dateStr, currentYear) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateStr;
  let [_, y, mo, d] = m;
  const year = parseInt(y);
  // If AI returned a year more than 1 in the past, or any year before current, snap to current year.
  // (Months/days are kept as-is. Only fixes the common year hallucination.)
  if (year < currentYear) {
    return `${currentYear}-${mo}-${d}`;
  }
  return dateStr;
}

export async function POST(request) {
  if (!GROQ_API_KEY) {
    return Response.json({ error: 'GROQ_API_KEY no configurada' }, { status: 500 });
  }

  try {
    const { type, text } = await request.json();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentYear = now.getFullYear();

    if (type === 'session') {
      const raw = await groq([
        {
          role: 'system',
          content: `Eres un asistente de registro de entrenamientos. Extrae los datos del texto y devuelve SOLO JSON válido, sin markdown, sin explicaciones, sin texto antes o después.
Formato exacto:
{"date":"YYYY-MM-DD","type":"gym","muscles":["Pecho"],"exercises":[{"n":"nombre ejercicio","kg":0,"s":1,"r":1}],"notes":"resumen completo"}
- type debe ser EXACTAMENTE uno de: gym, run, trail, senderismo, ultimate, bike, tenis, natacion, padel, otro
- Mapeo de variantes al tipo correcto:
  * bike = ciclismo, bici, bicicleta, spinning, bici indoor, ciclo indoor, rodillo, MTB, carretera
  * tenis = tenis, beach tenis, beach tennis, tennis
  * padel = padel, pádel
  * run = correr, carrera, running, rodaje, series, footing
  * trail = trail, trail running, carrera de montaña
  * senderismo = senderismo, hiking, ruta, montaña andando, caminata
  * natacion = natación, nadar, piscina, aguas abiertas
  * ultimate = ultimate, ultimate frisbee, frisbee
- muscles: Piernas, Pecho, Espalda, Bíceps, Tríceps, Hombros, Cardio
- Si es actividad cardiovascular o deporte (run/trail/senderismo/ultimate/bike/tenis/natacion/padel): exercises=[], muscles=["Cardio"]
- Si es gym: rellena exercises con cada ejercicio, su peso (kg), series (s) y repeticiones (r)
- notes: incluye TODAS las conclusiones, PRs, observaciones, distancias, tiempos, ritmos y datos relevantes sin omitir nada
- FECHA: El año actual es ${currentYear}. Si el texto menciona solo día y mes (sin año), usa SIEMPRE el año ${currentYear}. NUNCA uses años anteriores como 2024 o 2025 salvo que el texto lo diga explícitamente.
- Si no hay ninguna fecha en el texto, usa: ${today}
SOLO JSON.`
        },
        { role: 'user', content: text }
      ], 1500);

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return Response.json({ error: 'No se pudo parsear la respuesta' }, { status: 422 });
      const parsed = JSON.parse(match[0]);
      parsed.date = fixYear(parsed.date, currentYear);
      return Response.json({ result: parsed });
    }

    if (type === 'bio') {
      const raw = await groq([
        {
          role: 'system',
          content: `Eres un asistente que extrae datos de composición corporal de un texto. Devuelve SOLO JSON válido, sin markdown, sin explicaciones.
Formato exacto (incluye solo los campos que aparezcan en el texto, omite los que no):
{"date":"YYYY-MM-DD","peso":0,"grasa":0,"musculo":0,"esq":0,"agua":0,"proteina":0,"visceral":0,"bmr":0,"edad":0}
Significado de cada campo:
- peso: peso corporal en kg
- grasa: porcentaje de grasa corporal (%)
- musculo: masa muscular en kg
- esq: porcentaje de músculo esquelético (%)
- agua: porcentaje de agua corporal (%)
- proteina: porcentaje de proteína (%)
- visceral: nivel de grasa visceral (número)
- bmr: metabolismo basal en kcal
- edad: edad corporal/metabólica en años
- FECHA: El año actual es ${currentYear}. Si el texto menciona solo día y mes, usa el año ${currentYear}. Nunca uses 2024 ni 2025 salvo que el texto lo indique.
- Si no hay ninguna fecha, usa: ${today}
SOLO JSON con los campos detectados.`
        },
        { role: 'user', content: text }
      ], 800);

      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return Response.json({ error: 'No se pudo parsear la respuesta' }, { status: 422 });
      const parsedBio = JSON.parse(match[0]);
      parsedBio.date = fixYear(parsedBio.date, currentYear);
      return Response.json({ result: parsedBio });
    }

    if (type === 'diary') {
      const result = await groq([
        {
          role: 'system',
          content: `Eres el diario de entrenamiento personal de Ernesto Santana. 
Escribe una entrada narrativa detallada basándote en los datos del entrenamiento.
IMPORTANTE: 
- Conserva TODOS los datos, ejercicios, cargas, series y conclusiones. No omitas nada.
- Mantén el detalle técnico completo (pesos, repeticiones, técnica)
- Incluye las observaciones sobre sensaciones, fatiga, progresión
- Usa HTML simple: <strong> para énfasis, <span class="pr"> para PRs o mejoras, <span class="warn"> para avisos/molestias, <span class="note"> para observaciones generales
- Máximo 4 párrafos bien desarrollados
- Tono personal y analítico, en español
SOLO el texto HTML, sin markdown, sin explicaciones previas.`
        },
        { role: 'user', content: `Datos del entrenamiento: ${text}` }
      ], 2000);

      return Response.json({ result });
    }

    return Response.json({ error: 'Tipo no reconocido' }, { status: 400 });

  } catch (err) {
    console.error('Groq error:', err);
    return Response.json({ error: err.message || 'Error de IA' }, { status: 500 });
  }
}
