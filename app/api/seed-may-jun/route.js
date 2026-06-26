import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const sessions = [
  {id:'s40',date:'2026-05-04',type:'gym',muscles:['Hombros','Pecho','Bíceps'],notes:'Press hombros 35kg×8 consolidado. Press banca 60kg×12 mejor sesión del bloque. Curl predicador 25kg×10 estable.',exercises:[{n:'Press hombros multipower',kg:35,s:3,r:8},{n:'Press banca',kg:60,s:3,r:12},{n:'Curl predicador',kg:25,s:3,r:10}]},
  {id:'s41',date:'2026-05-08',type:'gym',muscles:['Hombros','Pecho','Bíceps'],notes:'Press hombros máquina 35kg×14. Empuje frontal pecho 53kg×12 PR. Curl predicador 27.5kg×12 nuevo peso efectivo.',exercises:[{n:'Press hombros máquina',kg:35,s:3,r:14},{n:'Empuje frontal pecho',kg:53,s:3,r:12},{n:'Curl predicador',kg:27.5,s:3,r:12}]},
  {id:'s42',date:'2026-05-18',type:'gym',muscles:['Tríceps','Espalda'],notes:'Tríceps trasnuca 29kg×8. Dorsal inclinado 41kg×8. Tríceps en corto 53kg×8. Sesión breve pero intensa.',exercises:[{n:'Tríceps trasnuca polea',kg:29,s:3,r:8},{n:'Dorsal inclinado',kg:41,s:3,r:8},{n:'Tríceps en corto polea',kg:53,s:3,r:8}]},
  {id:'s43',date:'2026-05-19',type:'gym',muscles:['Tríceps','Espalda','Bíceps'],notes:'Dorsal inclinado 53kg×8. Tríceps trasnuca 29kg consolidado. Dominadas agarre cerrado banda naranja 12+9+5.',exercises:[{n:'Tríceps trasnuca polea',kg:29,s:3,r:8},{n:'Dorsal inclinado',kg:53,s:3,r:8},{n:'Tríceps en corto polea',kg:41,s:3,r:8},{n:'Dominadas',kg:0,s:3,r:12}]},
  {id:'s44',date:'2026-05-26',type:'gym',muscles:['Tríceps','Espalda','Bíceps'],notes:'Dorsal inclinado 59kg×8 PR. Tríceps en corto 47kg×8. Tríceps trasnuca 35kg. Dominadas sin asistencia agarre neutro 6+6+3.',exercises:[{n:'Tríceps trasnuca polea',kg:35,s:3,r:6},{n:'Dorsal inclinado',kg:59,s:3,r:8},{n:'Tríceps en corto polea',kg:47,s:3,r:8},{n:'Dominadas',kg:0,s:3,r:6}]},
  {id:'s45',date:'2026-05-28',type:'gym',muscles:['Tríceps','Espalda','Bíceps'],notes:'Dorsal inclinado 65kg×8 nuevo máximo. Tríceps en corto 53kg×8 consolidado. Tríceps trasnuca fatiga ronda 3. Dominadas sin asistencia 5+4+3.',exercises:[{n:'Tríceps trasnuca polea',kg:35,s:3,r:4},{n:'Dorsal inclinado',kg:65,s:3,r:8},{n:'Tríceps en corto polea',kg:53,s:3,r:8},{n:'Dominadas',kg:0,s:3,r:5}]},
  {id:'s46',date:'2026-06-01',type:'gym',muscles:['Hombros','Piernas','Pecho','Tríceps'],notes:'Fondos banda amarilla 4+2. Dip Stop 30kg. Peso muerto EZ 47.5kg 9+7. Cuád 75kg 8+5. Banca 55kg rest-pause 9+1. Femoral 47kg.',exercises:[{n:'Fondos',kg:0,s:3,r:6},{n:'Dip Stop hombro',kg:30,s:3,r:10},{n:'Peso muerto barra EZ',kg:47.5,s:3,r:9},{n:'Extensión cuádriceps',kg:75,s:3,r:8},{n:'Press banca',kg:55,s:3,r:9},{n:'Curl femoral',kg:47,s:3,r:7},{n:'Tríceps polea',kg:23,s:3,r:12}]},
  {id:'s47',date:'2026-06-02',type:'gym',muscles:['Hombros','Espalda'],notes:'Fondos banda amarilla 5+2 mejora. Dip Stop 30kg 7+3. Peso muerto EZ 47.5kg 7+7 sólido. Pierna omitida.',exercises:[{n:'Fondos',kg:0,s:3,r:7},{n:'Dip Stop hombro',kg:30,s:3,r:10},{n:'Peso muerto barra EZ',kg:47.5,s:3,r:7}]},
];

const diary = [
  {id:'d40',date:'2026-05-04',type:'gym',text:`<span class="pr">Mejor sesión del bloque.</span> Press banca 60kg × 12 — salto claro de rendimiento. Hombros consolidados en 35kg. Curl predicador 25kg × 10, listo para subir a 27.5kg.`},
  {id:'d41',date:'2026-05-08',type:'gym',text:`<span class="pr">Empuje frontal pecho 53kg × 12 repetido.</span> Curl predicador sube a 27.5kg × 12 — nuevo peso efectivo consolidado. Press hombros máquina 35kg con volumen muy alto.`},
  {id:'d42',date:'2026-05-18',type:'gym',text:`Sesión breve pero muy intensa. <span class="pr">Progresión en los tres ejercicios: tríceps trasnuca 29kg, dorsal inclinado 41kg, tríceps en corto 53kg × 8.</span>`},
  {id:'d43',date:'2026-05-19',type:'gym',text:`<span class="pr">Dorsal inclinado sube a 53kg × 8.</span> Dominadas agarre cerrado con banda naranja hasta el fallo en la última serie. Sesión equilibrada de tríceps, dorsal y bíceps.`},
  {id:'d44',date:'2026-05-26',type:'gym',text:`<span class="pr">Dorsal inclinado 59kg × 8 — nueva marca.</span> Tríceps en corto cómodo a 47kg. <span class="pr">Dominadas sin asistencia agarre neutro: 6+6+3.</span> Clara progresión en dorsal y tríceps.`},
  {id:'d45',date:'2026-05-28',type:'gym',text:`<span class="pr">Dorsal inclinado 65kg × 8 — nuevo máximo absoluto.</span> Tríceps en corto 53kg × 8 consolidado. <span class="warn">Tríceps trasnuca con fatiga elevada — mejor estabilizar antes de subir.</span> Dominadas sin banda progresando.`},
  {id:'d46',date:'2026-06-01',type:'gym',text:`Entrenamiento largo y completo. <span class="pr">Cuádriceps 75kg con 13 reps acumuladas.</span> Peso muerto EZ 47.5kg sólido. Press banca 55kg en rest-pause validado. <span class="note">Gestión prudente del hombro en fondos.</span>`},
  {id:'d47',date:'2026-06-02',type:'gym',text:`Sesión corta y eficiente. <span class="pr">Fondos 5+2 mejora la referencia anterior.</span> Dip Stop 30kg consolidado. Peso muerto EZ 47.5kg muy sólido (7+7). <span class="note">Hombro gestionado sin incidencias.</span>`},
];

const raw = [
  {id:'r40',date:'2026-05-04',type:'gym',text:`Fecha: 4 mayo 2026\n\nR1: Press hombros 20kgx14 / Banca 40kgx14 / Predicador 12.5kgx14\nR2: Press hombros 35kgx8 / Banca 60kgx12 / Predicador 25kgx10\nR3: Press hombros 35kgx6 / Banca 60kgx8 / Predicador 25kgx10\nCore: plancha 30x3`},
  {id:'r41',date:'2026-05-08',type:'gym',text:`Fecha: 8 mayo 2026\n\nPress hombros máquina: 35kgx14 x3\nEmpuje frontal pecho: 47kgx10 / 53kgx12 / 53kgx12\nCurl predicador EZ: 25kgx12 / 25kgx12 / 27.5kgx12\nCore: omitido`},
  {id:'r42',date:'2026-05-18',type:'gym',text:`Fecha: 18 mayo 2026\n\nR1: Triceps trasnuca 17kgx14 / Dorsal inclinado 29kgx14 / Triceps corto 41kgx12\nR2: Triceps trasnuca 23kgx6-8 / Dorsal inclinado 35kgx6-8 / Triceps corto 47kgx6-8\nR3: Triceps trasnuca 29kgx8 / Dorsal inclinado 41kgx8 / Triceps corto 53kgx8`},
  {id:'r43',date:'2026-05-19',type:'gym',text:`Fecha: 19 mayo 2026\n\nR1: Triceps trasnuca 17kgx14 / Dorsal inclinado 41kgx14 / Triceps corto 29kgx12\nR2: Triceps trasnuca 29kgx8 / Dorsal inclinado 53kgx8 / Triceps corto 41kgx8\nR3: Triceps trasnuca 29kgx6-8 / Dorsal inclinado 53kgx6-8 / Triceps corto 41kgx6-8\nDominadas agarre cerrado banda naranja: 12+9+5`},
  {id:'r44',date:'2026-05-26',type:'gym',text:`Fecha: 26 mayo 2026\n\nR1: Triceps trasnuca 17kgx14 / Dorsal inclinado 41kgx14 / Triceps corto 29kgx14\nR2: Triceps trasnuca 29kgx8 / Dorsal inclinado 53kgx8 / Triceps corto 41kgx8\nR3: Triceps trasnuca 35kgx6 / Dorsal inclinado 59kgx8 / Triceps corto 47kgx8\nDominadas agarre neutro sin asistencia: 6+6+3`},
  {id:'r45',date:'2026-05-28',type:'gym',text:`Fecha: 28 mayo 2026 (8:00h)\n\nR1: Triceps trasnuca 17kgx14 / Dorsal inclinado 41kgx14 / Triceps corto 29kgx14\nR2: Triceps trasnuca 35kgx6 / Dorsal inclinado 59kgx8 / Triceps corto 47kgx8\nR3: Triceps trasnuca 35kgx4 / Dorsal inclinado 65kgx8 / Triceps corto 53kgx8\nDominadas agarre neutro sin asistencia: 5+4+3`},
  {id:'r46',date:'2026-06-01',type:'gym',text:`Fecha: 1 junio 2026 (9:00h)\n\nBLOQUE 1\nR1: Fondos banda roja 12-14r / Dip Stop 20kgx12-14 / PM EZ 37.5kgx12-14 / Cuad 41kgx12-14\nR2: Fondos banda amarilla 4r / Dip Stop 30kgx10 / PM EZ 37.5kgx10 / Cuad 69kgx10\nR3 rest-pause: Fondos 4+2 / Dip Stop 30kg 8+3.5 / PM EZ 47.5kg 9+7 / Cuad 75kg 8+5\nBLOQUE 2\nR1: Banca 30kgx14 / Femoral 35kgx14 / Triceps polea 23kgx14\nR2: Banca 40kgx14 / Femoral 47kgx9 / Triceps polea 23kgx14\nR3 rest-pause: Banca 55kg 9+1 / Femoral 47kg 7+5 / Triceps polea 23kg 12+4`},
  {id:'r47',date:'2026-06-02',type:'gym',text:`Fecha: 2 junio 2026\n\nR1: Fondos banda roja 8r / Dip Stop 20kgx14 / PM EZ 37.5kgx14\nR2: Fondos banda amarilla 4r / Dip Stop 30kgx10 / PM EZ 47.5kgx10\nR3 rest-pause: Fondos 5+2 / Dip Stop 30kg 7+3 / PM EZ 47.5kg 7+7\nCuadriceps: omitido / Femoral: omitido`},
];

export async function POST() {
  try {
    const { error: se } = await supabase.from('training_sessions').upsert(sessions, { onConflict: 'id' });
    if (se) throw new Error('sessions: ' + se.message);
    const { error: de } = await supabase.from('training_diary').upsert(diary, { onConflict: 'id' });
    if (de) throw new Error('diary: ' + de.message);
    const { error: re } = await supabase.from('training_raw').upsert(raw, { onConflict: 'id' });
    if (re) throw new Error('raw: ' + re.message);
    return Response.json({ ok: true, inserted: sessions.length });
  } catch(err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
