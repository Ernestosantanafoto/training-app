export const MUSCLES = ['Piernas','Pecho','Espalda','Bíceps','Tríceps','Hombros','Cardio'];

export const BIO_FIELDS = [
  {k:'peso',    lbl:'Peso',           unit:'kg',   color:'#e8ff47', neg:true},
  {k:'grasa',   lbl:'Grasa %',        unit:'%',    color:'#ff4747', neg:true},
  {k:'musculo', lbl:'Músculo',         unit:'kg',   color:'#47b8ff', neg:false},
  {k:'esq',     lbl:'M. esq. %',      unit:'%',    color:'#47ffb8', neg:false},
  {k:'agua',    lbl:'Agua %',          unit:'%',    color:'#47d4ff', neg:false},
  {k:'proteina',lbl:'Proteína %',      unit:'%',    color:'#ff8c47', neg:false},
  {k:'visceral',lbl:'Visceral',        unit:'',     color:'#ff4777', neg:true},
  {k:'bmr',     lbl:'BMR',             unit:'kcal', color:'#c8ff47', neg:false},
  {k:'edad',    lbl:'Edad corp.',      unit:'años', color:'#a347ff', neg:true},
];

export function fmtDate(d) {
  if (!d) return '—';
  const [y,m,dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

export function fmtShort(d) {
  if (!d) return '—';
  const [,m,dd] = d.split('-');
  return `${dd}/${m}`;
}

export function fmtTime(s) {
  return `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
}

export function getIntensity(ss) {
  if (!ss || !ss.length) return 0;
  let score = 0;
  ss.forEach(s => {
    const type = s.type || '';
    const notes = (s.notes || '').toLowerCase();
    const ex = s.exercises || [];
    if (type === 'senderismo') {
      const km = parseFloat((notes.match(/([0-9]+[.,][0-9]+)km/) || notes.match(/([0-9]+)k/) || ['','0'])[1].replace(',','.'));
      score += km >= 20 ? 4 : km >= 12 ? 3 : km >= 6 ? 2 : 1;
    } else if (type === 'trail') {
      score += 3;
    } else if (type === 'run') {
      const km = parseFloat((notes.match(/([0-9]+[.,]?[0-9]*)k/) || ['','0'])[1].replace(',','.'));
      score += km >= 15 ? 3 : km >= 10 ? 2 : 1;
    } else if (type === 'ultimate') {
      score += 2;
    } else if (type === 'bike') {
      const km = parseFloat((notes.match(/([0-9]+[.,]?[0-9]*)km/) || ['','0'])[1].replace(',','.'));
      score += km >= 40 ? 4 : km >= 20 ? 3 : km >= 10 ? 2 : 2;
    } else if (type === 'tenis' || type === 'padel') {
      score += 2;
    } else if (type === 'natacion') {
      score += 2;
    } else if (type === 'otro') {
      score += 2;
    } else if (type === 'gym') {
      const hasAdvanced = notes.includes('rest-pause') || notes.includes('dropset') || notes.includes('pr');
      const interrupted = notes.includes('interrump') || notes.includes('incompleto') || notes.includes('molestia');
      if (interrupted) score += 1;
      else if (hasAdvanced && ex.length >= 4) score += 4;
      else if (hasAdvanced || ex.length >= 4) score += 3;
      else if (ex.length >= 2) score += 2;
      else score += 1;
    }
  });
  return Math.min(4, Math.max(1, Math.round(score / ss.length)));
}

// Colores por tipo de actividad
export const TYPE_COLORS = {
  gym:        { color: '#e8ff47', bg: 'rgba(232,255,71,0.08)',  border: 'rgba(232,255,71,0.35)', label: 'gym' },
  run:        { color: '#e07060', bg: 'rgba(200,50,30,0.22)',   border: 'rgba(200,50,30,0.5)',   label: 'run' },
  trail:      { color: '#ff8c47', bg: 'rgba(255,140,71,0.2)',   border: 'rgba(255,140,71,0.5)',  label: 'trail' },
  senderismo: { color: '#47b8ff', bg: 'rgba(71,184,255,0.18)',  border: 'rgba(71,184,255,0.5)',  label: 'senderismo' },
  ultimate:   { color: '#ff47a3', bg: 'rgba(255,71,163,0.2)',   border: 'rgba(255,71,163,0.5)',  label: 'ultimate' },
  bike:       { color: '#47ffb8', bg: 'rgba(71,255,184,0.18)',  border: 'rgba(71,255,184,0.5)',  label: 'bike' },
  tenis:      { color: '#c8ff47', bg: 'rgba(200,255,71,0.18)',  border: 'rgba(200,255,71,0.45)', label: 'tenis' },
  padel:      { color: '#a347ff', bg: 'rgba(163,71,255,0.2)',   border: 'rgba(163,71,255,0.5)',  label: 'padel' },
  natacion:   { color: '#47d4ff', bg: 'rgba(71,212,255,0.18)',  border: 'rgba(71,212,255,0.5)',  label: 'natación' },
  otro:       { color: '#999999', bg: 'rgba(153,153,153,0.15)', border: 'rgba(153,153,153,0.4)', label: 'otro' },
};

export function typeColor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.otro;
}

export function isCardioType(type) {
  return ['run','trail','senderismo','ultimate','bike','tenis','padel','natacion','otro'].includes(type);
}
