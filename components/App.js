'use client';
import { useState, useEffect, useMemo } from 'react';
import { useTrainingData } from '../lib/useTrainingData';
import { supabase } from '../lib/supabase';
import { fmtDate, fmtShort, getIntensity, BIO_FIELDS, typeColor, isCardioType } from '../lib/helpers';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import Entrenador from './Entrenador';
import NuevaSesion from './NuevaSesion';
import { useNutritionData, dayTotals, dayStatus, calcStreak, rankedTemplates } from '../lib/useNutritionData';

// ── Persistencia de UI (localStorage, seguro en navegador real) ──
function loadUI(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try { const v = window.localStorage.getItem('ui_'+key); return v===null ? fallback : JSON.parse(v); }
  catch { return fallback; }
}
function saveUI(key, val) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem('ui_'+key, JSON.stringify(val)); } catch {}
}


const PANELS = ['dashboard','prs','bio','diario','entreno'];
const NAV = [
  { icon:'◈', lbl:'Dashboard' },
  { icon:'★', lbl:'Stats' },
  { icon:'◉', lbl:'Bio' },
  { icon:'✎', lbl:'Diario' },
  { icon:'⚡', lbl:'Entreno', main:true },
];

// ── Helpers ───────────────────────────────────────────────────
function CopyBtn({ getText }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className={`copy-btn${copied?' copied':''}`}
      onClick={() => { navigator.clipboard.writeText(getText()); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? '✓ copiado' : '⎘ copiar'}
    </button>
  );
}

function IntensityBars({ level, color }) {
  if (!level) return null;
  return (
    <div style={{ display:'flex', gap:1, alignItems:'flex-end', height:7, marginTop:1 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{ width:3, height:3+i, background: i<=level ? color : 'rgba(255,255,255,0.1)', borderRadius:1 }}/>
      ))}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────
function Dashboard({ sessions, onDayClick, mode, dietData }) {
  const today = new Date();
  const [calYear, setCalYear]   = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()+1);

  const calMonthStr = String(calMonth).padStart(2,'0');
  const calPrefix   = `${calYear}-${calMonthStr}`;
  const monthSess   = sessions.filter(s => s?.date?.startsWith(calPrefix));

  // Métricas nuevas: total de actividades y días únicos con actividad
  const totalActs = monthSess.length;
  const activeDays = new Set(monthSess.map(s => s.date).filter(Boolean)).size;

  // Ranking de actividades del mes (por tipo)
  const typeCount = {};
  monthSess.forEach(s => { if(s.type) typeCount[s.type] = (typeCount[s.type]||0)+1; });
  const ranking = Object.entries(typeCount).sort((a,b) => b[1]-a[1]);

  const goMonth = dir => {
    let m = calMonth+dir, y = calYear;
    if (m>12){m=1;y++;} if (m<1){m=12;y--;}
    setCalMonth(m); setCalYear(y);
  };

  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDow    = new Date(calYear, calMonth-1, 1).getDay();
  const calOffset   = firstDow===0 ? 6 : firstDow-1;
  const calDays     = [];
  for (let i=0; i<calOffset; i++) calDays.push(null);
  for (let d=1; d<=daysInMonth; d++) {
    const ds = `${calYear}-${calMonthStr}-${String(d).padStart(2,'0')}`;
    calDays.push({ d, ss: sessions.filter(s => s.date===ds) });
  }
  const calTitle = new Date(calYear, calMonth-1, 1).toLocaleString('es-ES',{month:'long',year:'numeric'}).toUpperCase();

  // ====== MODO DIETA ======
  if (mode === 'dieta') {
    return <DietaDashboard calYear={calYear} calMonth={calMonth} calDays={calDays}
      calTitle={calTitle} goMonth={goMonth}
      D={dietData} sessions={sessions} />;
  }

  // ====== MODO ENTRENOS ======
  return (
    <div>
      {/* Métricas: total actividades + días con actividad */}
      <div className="mrow" style={{ gridTemplateColumns:'repeat(2,1fr)' }}>
        <div className="mbox"><div className="mnum" style={{color:'var(--ac)'}}>{totalActs}</div><div className="mlbl">Actividades del mes</div></div>
        <div className="mbox"><div className="mnum" style={{color:'var(--ac)'}}>{activeDays}</div><div className="mlbl">Días con actividad</div></div>
      </div>

      {/* Calendar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <button onClick={() => goMonth(-1)} style={{background:'none',border:'none',color:'var(--mu)',cursor:'pointer',fontSize:18,padding:'0 4px'}}>‹</button>
        <div className="sl" style={{flex:1,marginBottom:0}}>{calTitle}</div>
        <button onClick={() => goMonth(1)} style={{background:'none',border:'none',color:'var(--mu)',cursor:'pointer',fontSize:18,padding:'0 4px'}}>›</button>
      </div>

      <div className="cal" style={{marginBottom:20}}>
        {['L','M','X','J','V','S','D'].map(d => <div key={d} className="ch">{d}</div>)}
        {calDays.map((cell, i) => {
          if (!cell) return <div key={i} style={{aspectRatio:'1',background:'var(--sf)',border:'1px solid var(--bd)'}}/>;
          const {d, ss} = cell;
          const ds = `${calYear}-${calMonthStr}-${String(d).padStart(2,'0')}`;
          if (!ss.length) return <div key={d} style={{aspectRatio:'1',background:'var(--sf)',border:'1px solid var(--bd)',display:'flex',alignItems:'flex-start',justifyContent:'flex-start'}}><span style={{opacity:.2,fontFamily:"'Bebas Neue',sans-serif",fontSize:11,padding:'2px 0 0 3px'}}>{String(d).padStart(2,'0')}</span></div>;

          const cardioSess = ss.filter(s => isCardioType(s.type));
          const gymSess = ss.filter(s => s.type === 'gym');
          const orderedSess = [...gymSess, ...cardioSess];
          const n = orderedSess.length;
          const topSess = [...orderedSess].sort((a,b)=>getIntensity([b])-getIntensity([a]))[0];
          const cellBorder = topSess ? typeColor(topSess.type).border : 'var(--bd)';

          return (
            <button key={d} onClick={() => onDayClick&&onDayClick(ds)}
              style={{aspectRatio:'1',display:'flex',flexDirection:'column',background:'#0a0a0a',border:`1px solid ${cellBorder}`,overflow:'hidden',cursor:'pointer',padding:0,width:'100%'}}>
              {orderedSess.map((s, idx) => {
                const tc = typeColor(s.type);
                const lvl = getIntensity([s]);
                const isFirst = idx === 0;
                return (
                  <div key={s.id || idx}
                    style={{flex:`1 1 ${100/n}%`, minHeight:0, width:'100%', background:tc.bg,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1,
                      borderTop: isFirst ? 'none' : '1px solid rgba(255,255,255,0.07)', overflow:'hidden'}}>
                    {isFirst && <span style={{fontFamily:"'Bebas Neue',sans-serif", fontSize: n>=3?9:11, color:tc.color, lineHeight:1}}>{String(d).padStart(2,'0')}</span>}
                    <span style={{fontSize: n>=3?4.5:5, color:tc.color, letterSpacing:.4, textTransform:'uppercase', opacity:.85, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%'}}>{tc.label}</span>
                    {n <= 2 && <IntensityBars level={lvl} color={tc.color}/>}
                  </div>
                );
              })}
            </button>
          );
        })}
      </div>

      {/* Ranking de actividades del mes */}
      <div className="sl">Ranking del mes</div>
      {ranking.length===0 ? <div className="empty">Sin actividad este mes.</div> : (
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>
          {ranking.map(([type,count]) => {
            const tc = typeColor(type);
            const maxC = ranking[0][1];
            const pct = (count/maxC)*100;
            return (
              <div key={type} style={{display:'flex',alignItems:'center',gap:10}}>
                <span style={{width:84,flexShrink:0,fontSize:9,letterSpacing:1,textTransform:'uppercase',color:tc.color}}>{tc.label||type}</span>
                <div style={{flex:1,height:10,background:'var(--sf)',border:'1px solid var(--bd)',overflow:'hidden'}}>
                  <div style={{width:`${pct}%`,height:'100%',background:tc.color,opacity:.55}}/>
                </div>
                <span style={{width:28,textAlign:'right',fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:tc.color}}>{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PRs ───────────────────────────────────────────────────────
function PRsContent({ sessions }) {
  const [prFilter, setPrFilter] = useState('');
  const [exFilter, setExFilter] = useState('');
  const byEx = {};
  sessions.forEach(s => {
    (s.exercises||[]).filter(e => e.n&&e.kg>0).forEach(e => {
      if (!byEx[e.n]||e.kg>byEx[e.n].kg||(e.kg===byEx[e.n].kg&&(e.r||0)>(byEx[e.n].r||0)))
        byEx[e.n] = { kg:e.kg, r:e.r, date:s.date };
    });
  });
  const allPRs  = Object.entries(byEx).sort((a,b) => b[1].kg-a[1].kg);
  const sorted  = allPRs.filter(([name]) => !prFilter||name.toLowerCase().includes(prFilter.toLowerCase()));
  const topKg   = allPRs[0]?.[1]?.kg || 0;

  // Gráficas de evolución de carga (movidas desde Dashboard)
  const allEx = [...new Set(sessions.flatMap(s => (s.exercises||[]).map(e => e.n).filter(Boolean)))].sort();
  const exWithData = allEx.filter(name => {
    const matches = !exFilter || name.toLowerCase().includes(exFilter.toLowerCase());
    return matches && sessions.some(s => (s.exercises||[]).some(e => e.n===name && e.kg>0));
  });

  return (
    <div>
      <div className="sl" style={{marginTop:0}}>Récords personales</div>
      <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:16,border:'1px solid var(--bd2)',background:'var(--sf)'}}>
        <input className="search-box" style={{border:'none',flex:1,fontSize:16}} placeholder="Filtrar ejercicio..."
          value={prFilter} onChange={e => setPrFilter(e.target.value)}/>
        {prFilter && <button onClick={() => setPrFilter('')} style={{background:'none',border:'none',color:'var(--mu3)',cursor:'pointer',padding:'0 12px',fontSize:16}}>✕</button>}
      </div>
      {!allPRs.length ? <div className="empty">Sin datos aún.</div> : (
        <div className="pr-grid">
          {sorted.map(([name, pr]) => {
            const pct = topKg > 0 ? (pr.kg/topKg)*100 : 0;
            const isTop = pr.kg===topKg;
            return (
              <div key={name} className={`pr-card${isTop?' top':''}`}>
                {isTop && <div className="pr-badge">TOP</div>}
                <div style={{fontSize:8,letterSpacing:1.5,textTransform:'uppercase',color:'var(--mu)',marginBottom:8}}>{name}</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,lineHeight:1,color:'var(--ac)'}}>{pr.kg}<span style={{fontSize:14,color:'var(--mu)',fontFamily:"'DM Mono',monospace"}}> kg</span></div>
                {pr.r>0 && <div style={{fontSize:10,color:'var(--mu3)',marginTop:3}}>{pr.r} reps</div>}
                <div style={{fontSize:8,color:'var(--mu)',marginTop:6}}>{fmtDate(pr.date)}</div>
                <div style={{height:2,background:'var(--bd)',marginTop:10}}><div style={{height:'100%',width:`${pct}%`,background:'var(--ac)',transition:'width .6s'}}/></div>
              </div>
            );
          })}
        </div>
      )}

      {/* Gráficas de evolución de carga */}
      <div className="sl sl-mt">Evolución de carga</div>
      <div style={{display:'flex',alignItems:'center',gap:0,marginBottom:16,border:'1px solid var(--bd2)',background:'var(--sf)'}}>
        <input className="search-box" style={{border:'none',flex:1,fontSize:16}} placeholder="Filtrar ejercicio..."
          value={exFilter} onChange={e => setExFilter(e.target.value)}/>
        {exFilter && <button onClick={() => setExFilter('')} style={{background:'none',border:'none',color:'var(--mu3)',cursor:'pointer',padding:'0 12px',fontSize:16}}>✕</button>}
      </div>
      {exFilter && <div style={{fontSize:9,color:'var(--mu)',letterSpacing:1,marginBottom:8,textTransform:'uppercase'}}>{exWithData.length} ejercicio{exWithData.length!==1?'s':''} encontrado{exWithData.length!==1?'s':''}</div>}
      {exWithData.length===0 && exFilter && <div className="empty">Sin resultados para "{exFilter}"</div>}
      <div className="charts-grid">
        {exWithData.map(name => {
          const pts = sessions.filter(s => s?.date).map(s => {
            const ex = (s.exercises||[]).filter(e => e.n===name && e.kg>0);
            if (!ex.length) return null;
            const mk = Math.max(...ex.map(e => e.kg));
            return { x: fmtShort(s.date), iso: s.date, kg: mk, r: Math.max(...ex.map(e => e.r||0)) };
          }).filter(Boolean);
          pts.sort((a,b) => a.iso.localeCompare(b.iso));
          if (pts.length < 2) return null;
          return (
            <div key={name} className="chart-wrap">
              <div className="chart-label">{name}</div>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={pts} margin={{top:8,right:8,bottom:0,left:0}}>
                  <XAxis dataKey="x" tick={{fill:'#555',fontSize:9,fontFamily:'DM Mono'}} tickLine={false} axisLine={false}/>
                  <YAxis tick={{fill:'#555',fontSize:9,fontFamily:'DM Mono'}} tickLine={false} axisLine={false} width={32} domain={['auto','auto']}/>
                  <Tooltip contentStyle={{background:'#111',border:'1px solid #333',fontSize:10,fontFamily:'DM Mono'}} labelStyle={{color:'#e8ff47'}}
                    formatter={(v,n,p) => [`${v} kg × ${p.payload?.r||'?'} reps`,'']}/>
                  <Line type="monotone" dataKey="kg" stroke="var(--ac)" strokeWidth={2} dot={{fill:'var(--ac)',stroke:'#0a0a0a',strokeWidth:1.5,r:3}} connectNulls/>
                </LineChart>
              </ResponsiveContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stats: PRs + Vida (visualizador de datos Garmin/dieta) ────
function PRs({ sessions, dietData }) {
  const [tab, setTab] = useState(() => loadUI('statsTab','prs'));
  useEffect(() => { saveUI('statsTab', tab); }, [tab]);
  return (
    <div>
      <div className="diary-tabs" style={{marginBottom:20}}>
        <div className={`diary-tab${tab==='prs'?' active':''}`} onClick={()=>setTab('prs')}>PRs</div>
        <div className={`diary-tab${tab==='vida'?' active':''}`} onClick={()=>setTab('vida')} style={tab==='vida'?{color:'#1d9e75',borderColor:'#1d9e75'}:{}}>Vida</div>
      </div>
      {tab==='prs' && <PRsContent sessions={sessions}/>}
      {tab==='vida' && <VidaStats dietData={dietData}/>}
    </div>
  );
}

function VidaStats({ dietData }) {
  const D = dietData;
  const series = useMemo(() => {
    const g = [...((D && D.garmin) || [])].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    const inByDate = {};
    ((D && D.entries) || []).forEach(e => { inByDate[e.date] = (inByDate[e.date]||0) + (e.kcal||0); });
    return g.slice(-30).map(x => ({
      date: x.date, x: fmtShort(x.date),
      pasos: x.steps ?? null,
      gasto: x.kcal_total ?? null,
      ingesta: inByDate[x.date] ?? null,
      fc: x.resting_hr ?? null,
      sueno: x.sleep_h ?? null,
      punt: x.sleep_score ?? null,
      bb: x.body_battery ?? null,
      estres: x.stress ?? null,
      intensidad: x.intensity_min ?? null,
    }));
  }, [D && D.garmin, D && D.entries]);

  const last7 = series.slice(-7);
  const avg = k => { const v = last7.map(r=>r[k]).filter(n=>n!=null); return v.length ? v.reduce((s,n)=>s+n,0)/v.length : null; };
  const aPasos = avg('pasos'), aSueno = avg('sueno'), aFc = avg('fc'), aGasto = avg('gasto');
  const tierSplit = useMemo(() => {
    const map = {}; ((D && D.templates) || []).forEach(t => { if (t.name) map[t.name] = t.tier || 'verde'; });
    const wk = new Date(); wk.setDate(wk.getDate() - 7); const ws = wk.toLocaleDateString('en-CA');
    let v = 0, g = 0, p = 0, tot = 0;
    ((D && D.entries) || []).forEach(e => {
      if (e.date < ws) return; const tr = map[e.name]; if (!tr) return;
      tot += e.kcal || 0;
      if (tr === 'verde') v += e.kcal || 0; else if (tr === 'goloso') g += e.kcal || 0; else p += e.kcal || 0;
    });
    if (tot <= 0) return null;
    const rv = Math.round(v/tot*100), rg = Math.round(g/tot*100);
    return { v: rv, g: rg, p: Math.max(0, 100 - rv - rg) };
  }, [D && D.entries, D && D.templates]);
  const fmtH = h => h==null ? '—' : `${Math.floor(h)}h${String(Math.round((h%1)*60)).padStart(2,'0')}`;

  if (!series.length) return <div className="empty">Aún sin datos de vida. Añádelos desde ⚡ → DATOS GARMIN.</div>;

  return (
    <div>
      <div className="sl" style={{marginTop:0}}>Media últimos 7 días</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:2,marginBottom:20}}>
        <StatBox v={aPasos!=null?Math.round(aPasos).toLocaleString('es-ES'):'—'} l="Pasos" c="var(--ac3)"/>
        <StatBox v={fmtH(aSueno)} l="Sueño" c="#b494e8"/>
        <StatBox v={aFc!=null?Math.round(aFc):'—'} l="FC reposo" c="#e07060"/>
        <StatBox v={aGasto!=null?Math.round(aGasto).toLocaleString('es-ES'):'—'} l="Gasto kcal" c="var(--ac)"/>
      </div>

      {tierSplit && (
        <div style={{marginBottom:20}}>
          <div className="sl">Calidad de la ingesta · 7 días</div>
          <div style={{display:'flex',height:14,overflow:'hidden',border:'1px solid var(--bd)'}}>
            {tierSplit.v>0 && <div style={{width:`${tierSplit.v}%`,background:'#1d9e75'}}/>}
            {tierSplit.g>0 && <div style={{width:`${tierSplit.g}%`,background:'#ef9f27'}}/>}
            {tierSplit.p>0 && <div style={{width:`${tierSplit.p}%`,background:'#e24b4a'}}/>}
          </div>
          <div style={{display:'flex',gap:14,marginTop:6,fontSize:9,fontFamily:"'DM Mono',monospace",letterSpacing:.5}}>
            <span style={{color:'#1d9e75'}}>● sano {tierSplit.v}%</span>
            <span style={{color:'#ef9f27'}}>● goloso {tierSplit.g}%</span>
            <span style={{color:'#e24b4a'}}>● pecado {tierSplit.p}%</span>
          </div>
        </div>
      )}

      <VChart title="Gasto vs ingesta · kcal" data={series} legend
        lines={[{k:'gasto',c:'#e07060',n:'Gasto (Garmin)'},{k:'ingesta',c:'#1d9e75',n:'Ingesta (dieta)'}]}/>
      <VChart title="Sueño · horas" data={series} ref7
        lines={[{k:'sueno',c:'#b494e8',n:'Sueño'}]}/>
      <VChart title="FC en reposo · ppm" data={series}
        lines={[{k:'fc',c:'#e07060',n:'FC reposo'}]}/>
      <VChart title="Pasos" data={series}
        lines={[{k:'pasos',c:'#47b8ff',n:'Pasos'}]}/>
      <VChart title="Body Battery · Δ del día" data={series}
        lines={[{k:'bb',c:'#1d9e75',n:'Body Battery'}]}/>
      <VChart title="Estrés medio" data={series}
        lines={[{k:'estres',c:'#ef9f27',n:'Estrés'}]}/>
      <VChart title="Minutos de intensidad" data={series}
        lines={[{k:'intensidad',c:'#47b8ff',n:'Min. intensidad'}]}/>
    </div>
  );
}

const StatBox = ({v,l,c}) => (
  <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:'12px 14px'}}>
    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,lineHeight:1,color:c}}>{v}</div>
    <div style={{fontSize:8,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginTop:3}}>{l}</div>
  </div>
);

function VChart({ title, data, lines, legend, ref7 }) {
  return (
    <div className="chart-wrap" style={{marginBottom:16}}>
      <div className="chart-label">{title}</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{top:8,right:8,bottom:0,left:0}}>
          <XAxis dataKey="x" tick={{fill:'#555',fontSize:9,fontFamily:'DM Mono'}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fill:'#555',fontSize:9,fontFamily:'DM Mono'}} tickLine={false} axisLine={false} width={36} domain={['auto','auto']}/>
          <Tooltip contentStyle={{background:'#111',border:'1px solid #333',fontSize:10,fontFamily:'DM Mono'}} labelStyle={{color:'#e8ff47'}}/>
          {legend && <Legend wrapperStyle={{fontSize:9,color:'#888'}}/>}
          {ref7 && <ReferenceLine y={7} stroke="rgba(232,255,71,0.4)" strokeDasharray="4 4"/>}
          {lines.map(l => <Line key={l.k} type="monotone" dataKey={l.k} name={l.n} stroke={l.c} strokeWidth={2} dot={{fill:l.c,stroke:'#0a0a0a',strokeWidth:1.5,r:3}} connectNulls/>)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Biometría ─────────────────────────────────────────────────
function Biometria({ bios, addBio }) {
  const [bioTab, setBioTab] = useState('comparativa');
  const allSorted = [...bios].filter(b=>b&&b.date).sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const latest = allSorted[0];
  const oldestId = allSorted.length ? allSorted[allSorted.length-1].id : null;
  const latestId = allSorted.length ? allSorted[0].id : null;
  const [selIds, setSelIds] = useState(() => {
    const ids = [...allSorted].reverse().map(b=>b.id);
    if (ids.length<=1) return ids;
    return [ids[0], ids[ids.length-1]];
  });
  const toggleSel = id => {
    if (id===oldestId||id===latestId) return;
    setSelIds(prev => {
      const next = prev.includes(id) ? prev.filter(x=>x!==id) : [...prev,id];
      const mid  = next.filter(x=>x!==oldestId&&x!==latestId);
      mid.sort((a,b) => { const da=allSorted.find(x=>x.id===a)?.date||''; const db=allSorted.find(x=>x.id===b)?.date||''; return da.localeCompare(db); });
      const r=[]; if(oldestId)r.push(oldestId); r.push(...mid); if(latestId&&latestId!==oldestId)r.push(latestId); return r;
    });
  };
  const selected = selIds.map(id=>allSorted.find(b=>b.id===id)).filter(Boolean).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const [chartKeys, setChartKeys] = useState(['peso','grasa']);
  const chartSorted = [...bios].filter(b=>b&&b.date).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const chartData = chartSorted.map(b => { const o={date:fmtShort(b.date)}; chartKeys.forEach(k=>{o[k]=b[k]??null;}); return o; });
  const TFIELDS = [
    {k:'peso',lbl:'Peso',unit:'kg',dir:-1},{k:'grasa',lbl:'Grasa %',unit:'%',dir:-1},
    {k:'musculo',lbl:'Músculo',unit:'kg',dir:1},{k:'esq',lbl:'M. esq. %',unit:'%',dir:1},
    {k:'agua',lbl:'Agua %',unit:'%',dir:1},{k:'proteina',lbl:'Proteína %',unit:'%',dir:1},
    {k:'visceral',lbl:'Visceral',unit:'',dir:-1},{k:'bmr',lbl:'BMR',unit:'kcal',dir:1},{k:'edad',lbl:'Edad corp.',unit:'años',dir:-1},
  ];
  const dColor = (d,dir) => { if(d===null||d===0)return'var(--mu3)'; return((d>0&&dir===1)||(d<0&&dir===-1))?'var(--ac)':'var(--ac2)'; };

  return (
    <div>
      <div className="diary-tabs" style={{marginBottom:20}}>
        <div className={`diary-tab${bioTab==='comparativa'?' active':''}`} onClick={()=>setBioTab('comparativa')}>Comparativa</div>
        <div className={`diary-tab${bioTab==='resumen'?' active':''}`} onClick={()=>setBioTab('resumen')}>Resumen</div>
      </div>

      {bioTab==='comparativa' && <div>
        <div className="sl">Evolución</div>
        <div className="metric-filter">
          {BIO_FIELDS.filter(f=>chartSorted.some(b=>b[f.k]!=null)).map(f => {
            const active = chartKeys.includes(f.k);
            return <button key={f.k} className="mf-btn" onClick={()=>setChartKeys(prev=>prev.includes(f.k)?(prev.length>1?prev.filter(x=>x!==f.k):prev):[...prev,f.k])}
              style={{background:active?`${f.color}18`:'transparent',borderColor:active?f.color:'var(--bd2)',color:active?f.color:'var(--mu3)'}}>{f.lbl}</button>;
          })}
        </div>
        <div className="chart-wrap" style={{marginBottom:28}}>
          <div className="chart-label">{chartKeys.map(k=>BIO_FIELDS.find(f=>f.k===k)?.lbl).join(' · ')}</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{top:8,right:16,bottom:0,left:0}}>
              <XAxis dataKey="date" tick={{fill:'#555',fontSize:9}} tickLine={false} axisLine={false}/>
              <YAxis tick={{fill:'#555',fontSize:9}} tickLine={false} axisLine={false} width={36}/>
              <Tooltip contentStyle={{background:'#111',border:'1px solid #333',fontSize:10}} labelStyle={{color:'#e8ff47'}}/>
              {chartKeys.length>1&&<Legend wrapperStyle={{fontSize:9,color:'#888'}}/>}
              {chartKeys.map(k=>{const f=BIO_FIELDS.find(f=>f.k===k);return<Line key={k} type="monotone" dataKey={k} stroke={f?.color||'#e8ff47'} strokeWidth={2} dot={{fill:f?.color||'#e8ff47',stroke:'#0a0a0a',strokeWidth:1.5,r:4}} name={f?.lbl} connectNulls/>;})}</LineChart>
          </ResponsiveContainer>
        </div>
        <div className="sl sl-mt">Comparativa</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:16}}>
          {[...allSorted].reverse().map(b => {
            const active=selIds.includes(b.id); const isLatest=b.id===latestId; const isOldest=b.id===oldestId;
            return <button key={b.id} onClick={()=>toggleSel(b.id)} style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,padding:'4px 10px',cursor:isOldest||isLatest?'default':'pointer',background:isLatest?'rgba(232,255,71,0.15)':isOldest?'rgba(232,255,71,0.06)':active?'rgba(232,255,71,0.08)':'transparent',border:active?'1px solid var(--ac)':'1px solid var(--bd2)',color:active?'var(--ac)':'var(--mu3)',position:'relative'}}>
              {fmtDate(b.date)}
              {isLatest&&<span style={{position:'absolute',top:-6,right:-2,fontSize:6,background:'var(--ac)',color:'#0a0a0a',padding:'1px 3px'}}>ACTUAL</span>}
              {isOldest&&<span style={{position:'absolute',top:-6,left:-2,fontSize:6,background:'var(--mu2)',color:'var(--mu3)',padding:'1px 3px'}}>INICIO</span>}
            </button>;
          })}
        </div>
        <div style={{overflowX:'hidden',marginBottom:28}}>
          <table className="bio-tbl">
            <thead><tr>
              <th>Métrica</th>
              {selected.map((b,i)=>{const isF=i===0;const isL=i===selected.length-1;return<th key={b.id} style={{color:isL?'var(--ac)':isF?'var(--mu3)':'var(--mu)',borderBottom:isL?'2px solid var(--ac)':'1px solid var(--bd)',background:isL?'rgba(232,255,71,0.04)':'transparent'}}>{fmtDate(b.date)}{isL&&<div style={{fontSize:6,color:'var(--ac)'}}>ACTUAL</div>}{isF&&<div style={{fontSize:6,color:'var(--mu)'}}>INICIO</div>}</th>;})}
              {selected.length>1&&<th>Δ</th>}
            </tr></thead>
            <tbody>
              {TFIELDS.map(f=>{
                const vals=selected.map(b=>b[f.k]??null);
                if(vals.every(v=>v===null))return null;
                const first=vals[0],last=vals[vals.length-1];
                const delta=selected.length>1&&first!==null&&last!==null?+(last-first).toFixed(2):null;
                const dStr=delta===null?'—':(delta>0?'+':'')+delta+(f.unit?' '+f.unit:'');
                return<tr key={f.k} className={f.k==='grasa'||f.k==='musculo'?'hi':''}>
                  <td>{f.lbl}</td>
                  {selected.map((b,i)=>{const v=b[f.k];const isL=i===selected.length-1;return<td key={b.id} className={isL?'cur':''}>{v!=null?v+(f.unit?' '+f.unit:''):'—'}</td>;})}
                  {selected.length>1&&<td style={{color:dColor(delta,f.dir),fontWeight:500,fontSize:10}}>{dStr}</td>}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        <div className="sl">Mediciones</div>
        <div className="bio-measures">
          {allSorted.map(b=>{const isL=b.id===latest?.id;const gc=b.grasa>20?'r':b.grasa>15?'y':'g';const mc=b.musculo>60?'g':b.musculo>50?'y':'r';return<div key={b.id} className={`bio-card${isL?' latest':''}`}>{isL&&<div className="bio-actual">ACTUAL</div>}<div className="bio-date">{fmtDate(b.date)}</div><div className="bio-peso">{b.peso??'—'}<span style={{fontSize:16,color:'var(--mu)',fontFamily:"'DM Mono',monospace"}}> kg</span></div><div className="bio-tags">{b.grasa!=null&&<span className={`bio-tag ${gc}`}>Grasa {b.grasa}%</span>}{b.musculo!=null&&<span className={`bio-tag ${mc}`}>Músculo {b.musculo} kg</span>}{b.edad!=null&&<span className="bio-tag">Edad {b.edad}</span>}</div></div>;})}
        </div>
      </div>}

      {bioTab==='resumen' && <BioResumen bios={bios}/>}
    </div>
  );
}

function BioResumen({ bios }) {
  const sorted = [...bios].filter(b=>b&&b.date).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  if (sorted.length<2) return <div className="empty">Necesitas al menos 2 mediciones.</div>;
  const first=sorted[0], latest=sorted[sorted.length-1];
  const days=Math.round((new Date(latest.date)-new Date(first.date))/(1000*60*60*24));
  const FIELDS=[{k:'peso',lbl:'Peso',unit:'kg',dir:-1},{k:'grasa',lbl:'Grasa',unit:'%',dir:-1},{k:'musculo',lbl:'Músculo',unit:'kg',dir:1},{k:'esq',lbl:'M. esq.',unit:'%',dir:1},{k:'agua',lbl:'Agua',unit:'%',dir:1},{k:'proteina',lbl:'Proteína',unit:'%',dir:1},{k:'visceral',lbl:'Visceral',unit:'',dir:-1},{k:'bmr',lbl:'BMR',unit:'kcal',dir:1},{k:'edad',lbl:'Edad',unit:'años',dir:-1}];
  const getDelta=k=>latest[k]!=null&&first[k]!=null?+(latest[k]-first[k]).toFixed(2):null;
  const getColor=k=>{const d=getDelta(k);const f=FIELDS.find(x=>x.k===k);if(!f||d===null||d===0)return'var(--mu3)';return((d>0&&f.dir===1)||(d<0&&f.dir===-1))?'var(--ac)':'var(--ac2)';};
  const getBorder=k=>{const d=getDelta(k);const f=FIELDS.find(x=>x.k===k);if(!f||d===null||d===0)return'var(--bd)';return((d>0&&f.dir===1)||(d<0&&f.dir===-1))?'rgba(232,255,71,0.3)':'rgba(255,71,71,0.25)';};
  const fmtD=k=>{const d=getDelta(k);const f=FIELDS.find(x=>x.k===k);if(d===null)return'—';return(d>0?'+':'')+d+(f.unit?' '+f.unit:'');};
  return(
    <div>
      <div className="sl" style={{marginTop:0}}>Resumen del ciclo</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:2,marginBottom:16}}>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:'12px 14px'}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:'var(--ac)'}}>{Math.floor(days/7)}<span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:'var(--mu)',marginLeft:3}}>sem</span></div><div style={{fontSize:8,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginTop:3}}>Duración</div></div>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:'12px 14px'}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:'var(--ac)'}}>{sorted.length}</div><div style={{fontSize:8,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginTop:3}}>Mediciones</div></div>
      </div>
      <div className="sl">Δ Inicio → Actual</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:2,marginBottom:20}}>
        {FIELDS.map(f=>{const d=getDelta(f.k);if(d===null)return null;return<div key={f.k} style={{background:'var(--sf)',border:`1px solid ${getBorder(f.k)}`,padding:'10px 12px'}}><div style={{fontSize:8,letterSpacing:1,textTransform:'uppercase',color:'var(--mu3)',marginBottom:4}}>{f.lbl}</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:getColor(f.k)}}>{fmtD(f.k)}</div><div style={{fontSize:9,color:'var(--mu)',marginTop:2}}>{first[f.k]!=null?first[f.k]+(f.unit?' '+f.unit:''):'—'} → {latest[f.k]!=null?latest[f.k]+(f.unit?' '+f.unit:''):'—'}</div></div>;})}
      </div>
    </div>
  );
}

// ── Historial ─────────────────────────────────────────────────
function Historial({ sessions, onDelete }) {
  const sorted = [...sessions].filter(s=>s&&s.id&&s.date&&s.type).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return(
    <div>
      <div className="sl" style={{marginTop:0}}>{sorted.length} sesiones registradas</div>
      {!sorted.length?<div className="empty">Sin sesiones aún.</div>:sorted.map(s=>{
        const tc=typeColor(s.type);
        return<div key={s.id} className="sc"><div className="sh"><span className="sd">{fmtDate(s.date)}</span><span className="sbg" style={s.type!=='gym'?{borderColor:tc.border,color:tc.color}:{}}>{s.type}</span></div>{s.muscles&&s.muscles.length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>{s.muscles.map(m=><span key={m} className="tag m">{m}</span>)}</div>}<div className="snotes">{s.notes}</div>{s.exercises&&s.exercises.filter(e=>e.kg>0).length>0&&<div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:8}}>{s.exercises.filter(e=>e.kg>0).map((e,i)=><span key={i} className="tag">{e.n} {e.kg}kg</span>)}</div>}<button className="del-btn" onClick={()=>{ if(confirm('¿Eliminar esta sesión?')) onDelete(s.id); }}>✕ eliminar</button></div>;
      })}
    </div>
  );
}

// ── Diario ────────────────────────────────────────────────────
function MonthSummary({ sessions, diary, year, month }) {
  const pad = n => String(n).padStart(2,'0');
  const prefix = `${year}-${pad(month)}`;
  const ms = sessions.filter(s=>s?.date?.startsWith(prefix));
  const md = (diary||[]).filter(e=>e?.date?.startsWith(prefix));
  const gymS = ms.filter(s=>s.type==='gym'); const runS=ms.filter(s=>s.type==='run'||s.type==='trail'||s.type==='ultimate'); const hikeS=ms.filter(s=>s.type==='senderismo');
  const prMap={};
  ms.forEach(s=>(s.exercises||[]).filter(e=>e.n&&e.kg>0).forEach(e=>{if(!prMap[e.n]||e.kg>prMap[e.n].kg)prMap[e.n]={kg:e.kg,r:e.r,date:s.date};}));
  const topPRs=Object.entries(prMap).sort((a,b)=>b[1].kg-a[1].kg).slice(0,6);
  const totalKm=runS.reduce((acc,s)=>{const m=(s.notes||'').match(/([0-9]+[.,]?[0-9]*)k/);return m?acc+parseFloat(m[1].replace(',','.')):acc;},0);
  const muscleCount={};
  gymS.forEach(s=>(s.muscles||[]).filter(m=>m!=='Cardio').forEach(m=>{muscleCount[m]=(muscleCount[m]||0)+1;}));
  const topMuscles=Object.entries(muscleCount).sort((a,b)=>b[1]-a[1]);
  const sortedD=[...md].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const strip=h=>{try{const d=document.createElement('div');d.innerHTML=h;return d.innerText||d.textContent||'';}catch(e){return h;}};
  const monthName=new Date(year,month-1,1).toLocaleString('es-ES',{month:'long',year:'numeric'});
  if(!ms.length)return<div style={{textAlign:'center',padding:48,color:'var(--mu)',fontSize:12,letterSpacing:1}}>Sin actividad en {monthName}</div>;
  return(
    <div>
      <div className="sl" style={{marginTop:0}}>Resumen — {monthName.toUpperCase()}</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:2,marginBottom:16}}>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:'12px 14px'}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,lineHeight:1,color:'var(--ac)'}}>{gymS.length}</div><div style={{fontSize:8,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginTop:3}}>Gym</div></div>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:'12px 14px'}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,lineHeight:1,color:'#e07060'}}>{runS.length}</div><div style={{fontSize:8,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginTop:3}}>Cardio</div></div>
        <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:'12px 14px'}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:34,lineHeight:1,color:'var(--ac3)'}}>{hikeS.length}</div><div style={{fontSize:8,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginTop:3}}>Senderismo</div></div>
      </div>
      {totalKm>0&&<div style={{background:'var(--sf)',border:'1px solid rgba(71,184,255,0.3)',padding:'12px 14px',marginBottom:16}}><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:30,color:'var(--ac3)'}}>{totalKm.toFixed(1)}</span><span style={{fontSize:11,color:'var(--mu)',fontFamily:"'DM Mono',monospace",marginLeft:6}}>km corridos</span></div>}
      {topPRs.length>0&&<><div className="sl">PRs del mes</div><div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:2,marginBottom:16}}>{topPRs.map(([name,pr])=><div key={name} style={{background:'var(--sf)',border:'1px solid rgba(232,255,71,0.2)',padding:'10px 12px'}}><div style={{fontSize:8,letterSpacing:1,textTransform:'uppercase',color:'var(--mu3)',marginBottom:3}}>{name}</div><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:26,color:'var(--ac)'}}>{pr.kg}<span style={{fontSize:11,color:'var(--mu)',fontFamily:"'DM Mono',monospace"}}> kg</span></div>{pr.r>0&&<div style={{fontSize:9,color:'var(--mu3)',marginTop:2}}>× {pr.r} reps · {fmtDate(pr.date)}</div>}</div>)}</div></>}
      {topMuscles.length>0&&<><div className="sl">Volumen muscular</div><div style={{display:'flex',flexWrap:'wrap',gap:3,marginBottom:16}}>{topMuscles.map(([m,n])=><div key={m} style={{background:'rgba(232,255,71,0.05)',border:'1px solid rgba(232,255,71,0.2)',padding:'5px 10px',display:'flex',gap:6,alignItems:'center'}}><span style={{fontSize:9,color:'var(--ac)',letterSpacing:1,textTransform:'uppercase'}}>{m}</span><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,color:'var(--ac)',lineHeight:1}}>{n}x</span></div>)}</div></>}
      {sortedD.length>0&&<><div className="sl">Diario del mes</div>{sortedD.map(e=><div key={e.id} className="diary-entry" style={{marginBottom:3}}><div className="diary-header"><span className="diary-day">{fmtDate(e.date)}</span><span className={`diary-type${e.type==='run'||e.type==='trail'||e.type==='ultimate'?' run':e.type==='senderismo'?' hike':''}`}>{e.type}</span></div><div className="diary-body">{strip(e.text).slice(0,240)}{strip(e.text).length>240?'…':''}</div></div>)}</>}
    </div>
  );
}

function Diario({ diary, raw, sessions, focusDate, onClearFocus, onDelete, onDeleteDiary, onDeleteRaw }) {
  const allDates=[...(sessions||[]).map(s=>s?.date),...(diary||[]).map(d=>d?.date)].filter(Boolean);
  const monthKeys=[...new Set(allDates.map(d=>d.slice(0,7)))].sort().reverse();
  const nowYM=new Date().toISOString().slice(0,7);
  const defMonth=monthKeys.includes(nowYM)?nowYM:(monthKeys[0]||nowYM);
  const [activeMonth,setActiveMonth]=useState(defMonth);
  const [tab,setTab]=useState('diario');
  useEffect(()=>{if(focusDate){setTab('diario');};},[focusDate]);
  const allD=[...(diary||[])].filter(e=>e&&e.id&&e.date&&e.type&&typeof e.text==='string').sort((a,b)=>{const dc=(b.date||'').localeCompare(a.date||'');return dc!==0?dc:(b.id||'').localeCompare(a.id||'');});
  const sortedD=focusDate?allD.filter(e=>e.date===focusDate):allD;
  const sortedR=[...(raw||[])].filter(e=>e&&e.id&&e.date&&e.type).sort((a,b)=>{const dc=(b.date||'').localeCompare(a.date||'');return dc!==0?dc:(b.id||'').localeCompare(a.id||'');});
  const strip=h=>{try{const d=document.createElement('div');d.innerHTML=h;return d.innerText||d.textContent||'';}catch(e){return h;}};
  const monthLabel=ym=>{const[y,m]=ym.split('-');return new Date(+y,+m-1,1).toLocaleString('es-ES',{month:'long'}).toUpperCase();};
  return(
    <div>
      <div className="diary-tabs">
        <div className={`diary-tab${tab==='diario'?' active':''}`} onClick={()=>setTab('diario')}>Diario</div>
        <div className={`diary-tab${tab==='historial'?' active':''}`} onClick={()=>setTab('historial')}>Historial</div>
        <div className={`diary-tab${tab==='sesiones'?' active':''}`} onClick={()=>setTab('sesiones')}>Entreno</div>
        <div className={`diary-tab${tab==='mes'?' active':''}`} onClick={()=>setTab('mes')}>Mes</div>
      </div>
      {tab==='historial'&&<Historial sessions={sessions} onDelete={onDelete}/>}
      {tab==='mes'&&<div><div style={{display:'flex',gap:2,marginBottom:20,flexWrap:'wrap'}}>{monthKeys.map(ym=><button key={ym} onClick={()=>setActiveMonth(ym)} style={{fontFamily:"'DM Mono',monospace",fontSize:9,letterSpacing:1,textTransform:'uppercase',padding:'6px 14px',cursor:'pointer',background:activeMonth===ym?'rgba(232,255,71,0.1)':'var(--sf)',border:activeMonth===ym?'1px solid var(--ac)':'1px solid var(--bd2)',color:activeMonth===ym?'var(--ac)':'var(--mu3)'}}>{monthLabel(ym)}</button>)}</div><MonthSummary sessions={sessions} diary={diary} year={parseInt(activeMonth.split('-')[0])} month={parseInt(activeMonth.split('-')[1])}/></div>}
      {tab==='diario'&&<div>
        {focusDate&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,padding:'6px 10px',background:'rgba(232,255,71,0.06)',border:'1px solid rgba(232,255,71,0.2)'}}>
          <span style={{fontSize:9,color:'var(--ac)',letterSpacing:2,textTransform:'uppercase'}}>Filtrando: {fmtDate(focusDate)}</span>
          <button onClick={onClearFocus} style={{fontSize:8,background:'none',border:'none',color:'var(--mu3)',cursor:'pointer',letterSpacing:1,fontFamily:"'DM Mono',monospace"}}>✕ ver todo</button>
        </div>}
        {!sortedD.length&&<div className="empty">Sin entradas.</div>}
        {sortedD.map((e,i)=>{const tc=typeColor(e.type);const isFocus=focusDate&&e.date===focusDate;return<div key={e.id} className={`diary-entry${i===0&&!focusDate?' latest':''}`} style={isFocus?{borderLeft:'3px solid var(--ac3)'}:{}}>{isFocus&&<div className="diary-new" style={{background:'var(--ac3)'}}>HOY</div>}{i===0&&!focusDate&&<div className="diary-new">ÚLTIMA</div>}<div className="diary-header"><span className="diary-day">{fmtDate(e.date)}</span><span className="diary-type" style={e.type!=='gym'?{borderColor:tc.border,color:tc.color}:{}}>{e.type}</span></div><div className="diary-body" dangerouslySetInnerHTML={{__html: e.text || ""}}/><CopyBtn getText={()=>fmtDate(e.date)+' - '+e.type.toUpperCase()+'\n\n'+strip(e.text)}/><button className="del-btn" style={{position:'absolute',bottom:10,left:12}} onClick={()=>{ if(confirm('¿Eliminar esta entrada del diario?')) onDeleteDiary(e.id); }}>✕ eliminar</button></div>;})}
      </div>}
      {tab==='sesiones'&&<div>
        {!sortedR.length&&<div className="empty">Sin sesiones.</div>}
        {sortedR.map(e=>{const tc=typeColor(e.type);return<div key={e.id} className="session-raw"><div className="session-raw-header"><span className="diary-day">{fmtDate(e.date)}</span><span className="diary-type" style={e.type!=='gym'?{borderColor:tc.border,color:tc.color}:{}}>{e.type}</span></div><div className="session-raw-text">{e.text}</div><CopyBtn getText={()=>e.text}/><button className="del-btn" style={{position:'absolute',bottom:10,left:12}} onClick={()=>{ if(confirm('¿Eliminar este registro de entreno?')) onDeleteRaw(e.id); }}>✕ eliminar</button></div>;})}
      </div>}
    </div>
  );
}

// ── Migrate banner ────────────────────────────────────────────
function MigrateBanner({ onDone }) {
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState('');
  const run = async () => {
    setStatus('loading');
    const r = await fetch('/api/migrate', { method:'POST' });
    const d = await r.json();
    if (d.migrated || d.message === 'Ya migrado') {
      setStatus('ok');
      setMsg(d.migrated ? `✓ Migrados: ${d.migrated.sessions} sesiones, ${d.migrated.bios} bios` : '✓ Datos ya en base de datos');
      setTimeout(() => { if(onDone) onDone(); }, 1000);
    } else {
      setStatus('err');
      setMsg(d.error || d.message || 'Error desconocido');
    }
  };
  return (
    <div style={{ background:'rgba(232,255,71,0.06)', border:'1px solid rgba(232,255,71,0.2)', padding:'12px 16px', marginBottom:20, display:'flex', flexDirection:'column', gap:8 }}>
      <div style={{ fontSize:9, letterSpacing:2, color:'var(--ac)', textTransform:'uppercase' }}>Primera vez — Migrar datos históricos a Supabase</div>
      <div style={{ fontSize:10, color:'var(--mu3)', lineHeight:1.6 }}>Importa todas las sesiones de feb-abr 2026 a la base de datos. Solo necesitas hacerlo una vez.</div>
      {msg && <div style={{ fontSize:10, color: status==='ok' ? 'var(--ac)' : 'var(--mu3)' }}>{msg}</div>}
      <button onClick={run} disabled={status==='loading'||status==='ok'||status==='warn'}
        style={{ width:'fit-content', padding:'8px 20px', background:'var(--ac)', border:'none', color:'#000', fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, cursor:'pointer', fontWeight:700, opacity: status==='loading'?0.5:1 }}>
        {status==='loading' ? 'MIGRANDO...' : status==='warn' ? msg : '▶ MIGRAR AHORA'}
      </button>
    </div>
  );
}

// ── EntrenoHub ────────────────────────────────────────────────
function EntrenoHub({ onSessionComplete, onSave, dietData, sessions, bios }) {
  const [view, setView] = useState('menu');
  const [garminOpen, setGarminOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);
  const [protoDays, setProtoDays] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('protocols').select('protocol_data').order('created_at', { ascending: false }).limit(1);
        if (alive && data && data.length && data[0].protocol_data && data[0].protocol_data.days) {
          setProtoDays(data[0].protocol_data.days.map(d => ({ id: d.id, name: d.name, color: d.color || '#e8ff47' })));
        }
      } catch (e) {}
    })();
    return () => { alive = false; };
  }, []);
  const GROUP_MUSCLES = { 'PECHO': ['Pecho'], 'HOMBROS': ['Hombros'], 'BRAZOS': ['Bíceps', 'Tríceps'], 'ABDOMEN': ['Core', 'Abdomen'], 'ESPALDA+PIERNA': ['Espalda', 'Piernas'] };
  const lastTrainedGroup = (name) => {
    const keys = GROUP_MUSCLES[(name || '').toUpperCase()] || [name];
    let last = null;
    (sessions || []).forEach(s => {
      if (s && s.type === 'gym' && (s.muscles || []).some(m => keys.includes(m))) { if (!last || s.date > last) last = s.date; }
    });
    return last;
  };

  if (view === 'gymfire') return (
    <div>
      <button onClick={() => setView('menu')} style={{background:'none',border:'none',color:'var(--mu)',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2,marginBottom:20,padding:0}}>← VOLVER</button>
      <Entrenador onSessionComplete={onSessionComplete}/>
    </div>
  );

  if (view === 'nueva') return (
    <div>
      <button onClick={() => setView('menu')} style={{background:'none',border:'none',color:'var(--mu)',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:2,marginBottom:20,padding:0}}>← VOLVER</button>
      <NuevaSesion onSave={async (s,d,r,b) => { await onSave(s,d,r,b); setView('menu'); }}/>
    </div>
  );



  return (
    <div>
      {/* ── ACCIÓN PRINCIPAL ── */}
      <div className="sl" style={{marginTop:0}}>Entrenar</div>
      <button onClick={() => setView('gymfire')} style={{width:'100%',padding:'22px 20px',background:'rgba(232,255,71,0.06)',border:'1px solid rgba(232,255,71,0.35)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <span style={{fontSize:30}}>⚡</span>
        <div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:2,color:'var(--ac)'}}>PROTOCOLO DE ENTRENAMIENTO</div>
          <div style={{fontSize:9,color:'var(--mu)',letterSpacing:2,marginTop:3}}>GYMFIRE · SESIÓN GUIADA CON TIMER Y LOG</div>
        </div>
      </button>
      {protoDays && (
        <div style={{display:'flex',flexWrap:'wrap',gap:6,margin:'-16px 0 24px'}}>
          {protoDays.map(d => {
            const last = lastTrainedGroup(d.name);
            const days = last ? Math.round((new Date(TODAY_STR() + 'T00:00:00') - new Date(last + 'T00:00:00')) / 86400000) : null;
            const warn = days !== null && days < 2;
            return (
              <div key={d.id} style={{fontSize:9,letterSpacing:1,fontFamily:"'DM Mono',monospace",padding:'5px 9px',border:`1px solid ${warn ? 'rgba(239,159,39,0.55)' : d.color + '55'}`,color: warn ? '#ef9f27' : d.color}}>
                {d.name} {days === null ? '· ✓' : warn ? (days === 0 ? '· ⚠ hoy' : '· ⚠ ayer') : `· ✓ ${days}d`}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ENTRADA DE DATOS ── */}
      <div className="sl">Registrar</div>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:24}}>
        {[
          {ic:'＋', c:'var(--mu3)', t:'AÑADIR SESIÓN', s:'TEXTO · IMAGEN · GARMIN · BÁSCULA', fn:()=>setView('nueva')},
          {ic:'⌁', c:'#1d9e75', t:'DATOS GARMIN', s:'PASOS · SUEÑO · CALORÍAS · FC · BODY BATTERY', fn:()=>setGarminOpen(true)},
          {ic:'◉', c:'var(--mu3)', t:'REVIEW VISUAL', s:'VALORACIÓN DE FOTO · CINTURA · PESO', fn:()=>setReviewOpen(true)},
        ].map((b,i)=>(
          <button key={i} onClick={b.fn} style={{width:'100%',padding:'14px 16px',background:'var(--sf)',border:'1px solid var(--bd2)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontSize:20,color:b.c,width:24,textAlign:'center',flexShrink:0}}>{b.ic}</span>
            <div style={{minWidth:0}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:17,letterSpacing:2,color:b.c}}>{b.t}</div>
              <div style={{fontSize:8,color:'var(--mu)',letterSpacing:1.5,marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.s}</div>
            </div>
          </button>
        ))}
      </div>

      {/* ── CICLO SEMANAL: exportar -> chat -> cargar ── */}
      <div className="sl">Ciclo del protocolo</div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:6,marginBottom:28}}>
        <button onClick={() => setExportOpen(true)} style={{padding:'16px 12px',background:'var(--sf)',border:'1px solid var(--bd2)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'center'}}>
          <div style={{fontSize:22,color:'var(--mu3)',marginBottom:4}}>↥</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,color:'var(--mu3)'}}>EXPORTAR</div>
          <div style={{fontSize:8,color:'var(--mu)',letterSpacing:1,marginTop:2}}>RESUMEN → CHAT</div>
        </button>
        <button onClick={() => setImportOpen(true)} style={{padding:'16px 12px',background:'rgba(232,255,71,0.04)',border:'1px solid rgba(232,255,71,0.3)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'center'}}>
          <div style={{fontSize:22,color:'var(--ac)',marginBottom:4}}>↧</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,color:'var(--ac)'}}>CARGAR</div>
          <div style={{fontSize:8,color:'var(--mu)',letterSpacing:1,marginTop:2}}>CHAT → PROTOCOLO</div>
        </button>
      </div>

      {/* ── SISTEMA ── */}
      <div className="sl">Sistema</div>
      <button onClick={() => setFullOpen(true)} style={{width:'100%',padding:'13px 16px',background:'var(--sf)',border:'1px solid var(--bd2)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:14,marginBottom:28}}>
        <span style={{fontSize:18,color:'var(--mu3)',width:24,textAlign:'center',flexShrink:0}}>⎔</span>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:16,letterSpacing:2,color:'var(--mu3)'}}>EXPORTAR TODO</div>
          <div style={{fontSize:8,color:'var(--mu)',letterSpacing:1.5,marginTop:2}}>VOLCADO COMPLETO PARA AUDITAR EN EL CHAT</div>
        </div>
      </button>
      {fullOpen && <DFullExportModal sessions={sessions} dietData={dietData} bios={bios} onClose={()=>setFullOpen(false)}/>}
      {importOpen && <DImportProtocolModal onClose={()=>setImportOpen(false)}/>}
      {exportOpen && <DExportModal sessions={sessions} onClose={()=>setExportOpen(false)}/>}
      {reviewOpen && <DReviewModal onClose={()=>setReviewOpen(false)} onSave={async(r)=>{ if(dietData) await dietData.addPhoto(r); setReviewOpen(false); }}/>}
      {garminOpen && <DGarminModal onClose={()=>setGarminOpen(false)} onSave={async(days)=>{ if(dietData) await dietData.addGarminDays(days); setGarminOpen(false); }}/>}
    </div>
  );
}

// ── PULSO: briefing diario que cruza todos los datos ──────────
function PulsoCard({ sessions, dietData }) {
  const [text, setText] = useState(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const D = dietData;
  const ready = !!(D && !D.loading && (((D.garmin || []).length) || ((D.entries || []).length)));

  const gen = async () => {
    setBusy(true); setFailed(false);
    try {
      const today = TODAY_STR();
      const wk = new Date(); wk.setDate(wk.getDate() - 7);
      const ws = wk.toLocaleDateString('en-CA');
      const byDate = {};
      (D.entries || []).forEach(e => { const t = byDate[e.date] || (byDate[e.date] = { k: 0, p: 0 }); t.k += e.kcal || 0; t.p += Number(e.protein) || 0; });
      // flags deterministas para que el coach razone con patrones, no solo numeros
      const yd = new Date(); yd.setDate(yd.getDate() - 1); const ys = yd.toLocaleDateString('en-CA');
      const todaySes = (sessions || []).filter(s => s && s.date === today);
      const grupos48h = [...new Set((sessions || []).filter(s => s && (s.date === today || s.date === ys) && s.type === 'gym').flatMap(s => s.muscles || []))];
      const fcVals = (D.garmin || []).filter(g => g.resting_hr).slice(0, 30).map(g => g.resting_hr);
      const fcAvg = fcVals.length ? Math.round(fcVals.reduce((a, b) => a + b, 0) / fcVals.length) : null;
      const bbLast = (D.garmin || []).find(g => g.body_battery != null);
      const tplTier = {}; (D.templates || []).forEach(t => { if (t.name) tplTier[t.name] = t.tier || 'verde'; });
      let kInd = 0, kTot = 0;
      (D.entries || []).forEach(e => { if (e.date < ws) return; const tr = tplTier[e.name]; if (!tr) return; kTot += e.kcal || 0; if (tr !== 'verde') kInd += e.kcal || 0; });
      const snapshot = {
        hoy: today,
        objetivo: { kcal: (D.target && D.target.kcal_target) || 2800, proteina_g: (D.target && D.target.protein_target) || 160 },
        racha_dieta: calcStreak(D.entries || [], D.freeDays || []),
        garmin_7d: (D.garmin || []).filter(g => g.date >= ws).map(g => ({ d: g.date, gasto: g.kcal_total, sueno_h: g.sleep_h, fc: g.resting_hr, pasos: g.steps, bb: g.body_battery, estres: g.stress })),
        dieta_7d: Object.entries(byDate).filter(([d]) => d >= ws).sort().map(([d, v]) => ({ d, kcal: Math.round(v.k), prot: Math.round(v.p) })),
        entrenos_7d: (sessions || []).filter(s => s && s.date >= ws).map(s => ({ d: s.date, tipo: s.type, musculos: (s.muscles || []).slice(0, 4) })),
        dias_libres: (D.freeDays || []).map(f => f.date).filter(d => d >= ws),
        hoy_ahora: {
          hora_local: new Date().toTimeString().slice(0, 5),
          kcal_comidas_hoy: Math.round((byDate[today] || { k: 0 }).k),
          prot_hoy_g: Math.round((byDate[today] || { p: 0 }).p),
          sesiones_hoy: todaySes.map(s => s.type),
          gasto_garmin_hoy_parcial: (() => { const g = (D.garmin || []).find(x => x.date === today); return g ? g.kcal_total : null; })(),
        },
        flags: {
          cardio_hoy: todaySes.some(s => s.type !== 'gym'),
          gym_hoy: todaySes.some(s => s.type === 'gym'),
          grupos_entrenados_48h: grupos48h,
          fc_media_30d: fcAvg,
          fc_ultima: fcVals[0] || null,
          bb_ultimo: bbLast ? { d: bbLast.date, v: bbLast.body_battery } : null,
          pct_kcal_indulgente_7d: kTot ? Math.round((kInd / kTot) * 100) : null,
        },
      };
      const r = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ snapshot }) });
      const data = await r.json();
      if (data.text) { setText(data.text); saveUI('pulso_' + today, data.text); }
      else setFailed(true);
    } catch (e) { setFailed(true); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!ready) return;
    const cached = loadUI('pulso_' + TODAY_STR(), null);
    if (cached) { setText(cached); return; }
    gen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) return null;
  const SYM = { '◐': '#b494e8', '⌁': '#1d9e75', '⚡': 'var(--ac)', '◆': '#ef9f27' };
  return (
    <div style={{ background: 'var(--sf)', border: '1px solid var(--bd2)', padding: '12px 14px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: text ? 8 : 0 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: 'var(--mu3)', fontFamily: "'DM Mono',monospace" }}>◈ PULSO DE HOY</span>
        <button onClick={gen} disabled={busy} style={{ background: 'none', border: 'none', color: 'var(--mu)', fontSize: 13, cursor: 'pointer', padding: '2px 8px' }}>{busy ? '…' : '↻'}</button>
      </div>
      {busy && !text && <div style={{ fontSize: 10, color: 'var(--mu)' }}>leyendo tus datos…</div>}
      {failed && !text && (
        <div style={{ fontSize: 10, color: 'var(--mu)' }}>
          no pude generar el pulso · <button onClick={gen} style={{ background: 'none', border: 'none', color: 'var(--ac)', fontSize: 10, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>reintentar</button>
        </div>
      )}
      {text && text.split('\n').filter(l => l.trim()).slice(0, 5).map((l, i) => {
        const t = l.trim(); const sym = t[0]; const known = SYM[sym];
        return (
          <div key={i} style={{ fontSize: 11, lineHeight: 1.7, display: 'flex', gap: 8 }}>
            <span style={{ color: known || 'var(--mu3)', flexShrink: 0 }}>{known ? sym : '·'}</span>
            <span style={{ opacity: .85 }}>{known ? t.slice(1).trim() : t}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── DietaDashboard (modo dieta, acento teal) ──────────────────
const TEAL = '#1d9e75';
const TIER_COLOR = { verde:'#1d9e75', goloso:'#ef9f27', pecado:'#e24b4a' };
const TIER_BORDER = { verde:'rgba(29,158,117,0.45)', goloso:'rgba(239,159,39,0.45)', pecado:'rgba(226,75,74,0.5)' };
const ST_COLOR = { verde:'#1d9e75', ambar:'#ef9f27', rojo:'#e24b4a', none:'rgba(255,255,255,0.12)' };
const fmtN = n => Math.round(n).toLocaleString('es-ES');
const TODAY_STR = () => new Date().toLocaleDateString('en-CA'); // fecha LOCAL, no UTC
const MEALS = ['desayuno','brunch','almuerzo','merienda','cena','otros'];
const MEAL_LBL = {desayuno:'Desayuno',brunch:'Brunch',almuerzo:'Almuerzo',merienda:'Merienda',cena:'Cena',otros:'Otros'};

function DietaDashboard({ calYear, calMonth, calDays, calTitle, goMonth, D, sessions }) {
  const [sel, setSel] = useState(TODAY_STR());
  const [textOpen, setTextOpen] = useState(false);
  const [foodText, setFoodText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState(null);
  const [meal, setMeal] = useState(() => { const v = loadUI('meal','desayuno'); return MEALS.includes(v) ? v : 'desayuno'; });
  const [newOpen, setNewOpen] = useState(false);
  const [pantryOpen, setPantryOpen] = useState(false);
  const [qty, setQty] = useState(1);
  const [dayPopup, setDayPopup] = useState(null);
  const [aiErr, setAiErr] = useState(null);
  const [dtab, setDtab] = useState(() => loadUI('dietTab','add'));
  useEffect(() => { saveUI('meal', meal); }, [meal]);
  useEffect(() => { saveUI('dietTab', dtab); }, [dtab]);

  // Agrupar registros por fecha UNA vez (evita filtrar todo el array por cada celda)
  const totalsByDate = useMemo(() => {
    const m = {};
    (D?.entries || []).forEach(e => {
      const t = m[e.date] || (m[e.date] = { kcal: 0, protein: 0, items: [] });
      t.kcal += e.kcal || 0; t.protein += Number(e.protein) || 0; t.items.push(e);
    });
    return m;
  }, [D?.entries]);
  const rankedMemo = useMemo(() => rankedTemplates(D?.templates, D?.entries), [D?.templates, D?.entries]);
  const streakMemo = useMemo(() => calcStreak(D?.entries || [], D?.freeDays || []), [D?.entries, D?.freeDays]);
  const freeSetMemo = useMemo(() => new Set((D?.freeDays || []).map(f => f.date)), [D?.freeDays]);

  // Objetivo dinamico: media del gasto real (Garmin) de los ultimos 7 dias con datos, menos deficit moderado
  const dynInfo = useMemo(() => {
    const today = TODAY_STR();
    const rows = (D?.garmin || []).filter(g => g.date < today && (g.kcal_total || 0) > 1200);
    const last7 = rows.slice(0, 7);
    if (!last7.length) return null;
    const avg = Math.round(last7.reduce((s, g) => s + g.kcal_total, 0) / last7.length);
    // deficit moderado de 600, con suelo de seguridad (nunca por debajo de 2300) y techo 3200
    const target = Math.min(3200, Math.max(2300, Math.round((avg - 600) / 10) * 10));
    return { avg, target, days: last7.length };
  }, [D?.garmin]);

  // Ultimo sueño registrado (para la cabecera)
  const lastSleep = useMemo(() => {
    const g = (D?.garmin || []).find(x => x.sleep_h != null);
    return g ? { date: g.date, h: g.sleep_h, score: g.sleep_score } : null;
  }, [D?.garmin]);

  const garminByDate = useMemo(() => {
    const m = {};
    (D?.garmin || []).forEach(g => { m[g.date] = g; });
    return m;
  }, [D?.garmin]);

  if (!D || D.loading) return <div className="empty">Cargando dieta…</div>;

  const EMPTY_DAY = { kcal: 0, protein: 0, items: [] };
  const getDay = ds => totalsByDate[ds] || EMPTY_DAY;

  const kcalTarget = (dynInfo && dynInfo.target) || D.target.kcal_target || 2800;
  const protTarget = D.target.protein_target || 160;
  const totals = getDay(sel);
  const streak = streakMemo;
  const kcalPct = Math.min(100,(totals.kcal/kcalTarget)*100);
  const protPct = Math.min(100,(totals.protein/protTarget)*100);
  const selGarmin = garminByDate[sel];
  // objetivo de CADA día: si ese día tiene gasto Garmin, su objetivo real fue (gasto − 600); si no, el global
  const dayTargetFor = ds => {
    if (ds >= TODAY_STR()) return kcalTarget; // hoy/futuro: objetivo dinámico global (el gasto de hoy aún es parcial)
    const g = garminByDate[ds]; const k = g && g.kcal_total;
    return (k && k > 1200) ? Math.min(3200, Math.max(2300, Math.round((k - 600) / 10) * 10)) : kcalTarget;
  };
  const selTarget = dayTargetFor(sel);
  const kcalLeft = Math.max(0,selTarget-totals.kcal);
  const sleepInfo = (selGarmin && selGarmin.sleep_h!=null)
    ? { h:selGarmin.sleep_h, score:selGarmin.sleep_score, own:true }
    : (lastSleep ? { ...lastSleep, own:false } : null);
  const R1=50,R2=36,C1=2*Math.PI*R1,C2=2*Math.PI*R2;
  const calMonthStr = String(calMonth).padStart(2,'0');

  const addTpl = t => { D.addEntry({date:sel,meal,name:t.name,kcal:t.kcal,protein:t.protein,source:'plantilla',estimated:t.estimated,qty}); setQty(1); };
  const ranked = rankedMemo;
  const freeSet = freeSetMemo;
  const selIsFree = freeSet.has(sel);
  // cerrador de proteina: combos de TU despensa que cierran el hueco de hoy
  const protGap = Math.round(protTarget - totals.protein);
  const protCombo = (() => {
    if (sel !== TODAY_STR() || selIsFree || protGap <= 25) return null;
    const pick = []; let sum = 0;
    for (const t of ranked.filter(t => Number(t.protein) >= 12)) {
      if (pick.length >= 3) break;
      pick.push(t); sum += Number(t.protein);
      if (sum >= protGap) break;
    }
    return (pick.length && sum >= protGap * 0.6) ? { pick, sum: Math.round(sum) } : null;
  })();


  const parseFood = async () => {
    if(!foodText.trim())return; setAiBusy(true); setAiErr(null);
    try{
      const r=await fetch('/api/nutrition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:foodText})});
      const data=await r.json();
      if(data.items&&data.items.length){ setAiPreview(data); }
      else { setAiErr(data.error?('La IA falló: '+data.error):'La IA no pudo interpretar esa comida. Prueba a describirla de otra forma.'); }
    }catch(e){ setAiErr('Sin conexión con la IA. Reintenta.'); } finally{setAiBusy(false);}
  };
  const confirmAi = async () => {
    if(!aiPreview?.items)return;
    await D.addEntriesBatch(aiPreview.items.map(i=>({...i,meal,date:sel,source:'texto'})));
    setAiPreview(null);setFoodText('');setTextOpen(false);
  };

  const lastPhoto = D.photos[0];
  const daysSince = lastPhoto ? Math.floor((Date.now()-new Date(lastPhoto.date).getTime())/86400000) : 99;

  return (
    <div>
      {D.error && <div style={{fontSize:10,color:'var(--ac2,#ff4747)',marginBottom:12,padding:'8px 12px',border:'1px solid rgba(255,71,71,.25)'}}>⚠ Error guardando en Supabase: {D.error}</div>}

      <button onClick={()=>setNewOpen(true)} style={{width:'100%',padding:'12px',marginBottom:14,background:'rgba(29,158,117,0.06)',border:`1px solid ${TEAL}`,color:TEAL,cursor:'pointer',fontFamily:"'DM Mono',monospace",fontSize:12,letterSpacing:1}}>＋ NUEVO ELEMENTO EN LA DESPENSA</button>

      <PulsoCard sessions={sessions} dietData={D}/>

      {/* anillo */}
      <div style={{background:'rgba(29,158,117,0.05)',border:'1px solid rgba(29,158,117,0.3)',padding:16,marginBottom:20,display:'flex',alignItems:'center',gap:16}}>
        <div style={{position:'relative',width:108,height:108,flexShrink:0}}>
          <svg viewBox="0 0 120 120" width="108" height="108">
            <circle cx="60" cy="60" r={R1} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11"/>
            <circle cx="60" cy="60" r={R1} fill="none" stroke="#378add" strokeWidth="11" strokeLinecap="round" strokeDasharray={C1} strokeDashoffset={C1*(1-kcalPct/100)} transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r={R2} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11"/>
            <circle cx="60" cy="60" r={R2} fill="none" stroke={TEAL} strokeWidth="11" strokeLinecap="round" strokeDasharray={C2} strokeDashoffset={C2*(1-protPct/100)} transform="rotate(-90 60 60)"/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{fmtN(totals.kcal)}</span>
            <span style={{fontSize:10,opacity:.5}}>de {fmtN(selTarget)}</span>
          </div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:11}}>
          <DBar label="Calorías" color="#378add" cur={totals.kcal} max={selTarget} right={`${fmtN(kcalLeft)} rest.`}/>
          <DBar label="Proteína" color={TEAL} cur={totals.protein} max={protTarget} right={`${Math.round(totals.protein)}/${protTarget} g`}/>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {dynInfo && <span style={{fontSize:9,color:'var(--mu3)',letterSpacing:.3}}>◎ objetivo según tu gasto real · media {dynInfo.days}d: {fmtN(dynInfo.avg)} kcal</span>}
            {sleepInfo && <span style={{fontSize:9,color:sleepInfo.h<7?'#ef9f27':'var(--mu3)',letterSpacing:.3}}>◐ sueño{sleepInfo.own?'':` (últ. ${fmtShort(sleepInfo.date)})`} {Math.floor(sleepInfo.h)}h{String(Math.round((sleepInfo.h%1)*60)).padStart(2,'0')}{sleepInfo.score?` · punt. ${sleepInfo.score}`:''}{sleepInfo.h<7?' · corto':''}</span>}
            {selGarmin && selGarmin.kcal_total>0 && <span style={{fontSize:9,color:'var(--mu3)',letterSpacing:.3}}>⌁ gasto {sel===TODAY_STR()?'hoy':'ese día'}: {fmtN(selGarmin.kcal_total)} · balance {totals.kcal-selGarmin.kcal_total>0?'+':''}{fmtN(totals.kcal-selGarmin.kcal_total)}</span>}
            {selTarget!==kcalTarget && <span style={{fontSize:9,color:TEAL,letterSpacing:.3}}>◎ objetivo de ese día: {fmtN(selTarget)} · ajustado a su gasto real</span>}
            {protCombo && <span style={{fontSize:9,color:'#25c290',letterSpacing:.3}}>◇ cierra tus {protGap} g con: {protCombo.pick.map(t=>`${t.name} (${Math.round(t.protein)})`).join(' + ')} ≈ {protCombo.sum} g</span>}
          </div>
          {sel!==TODAY_STR() && <button onClick={()=>setSel(TODAY_STR())} style={dMini}>← volver a hoy</button>}
        </div>
      </div>

      {/* Calendar (mismo, coloreado por cumplimiento) */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <button onClick={()=>goMonth(-1)} style={{background:'none',border:'none',color:'var(--mu)',cursor:'pointer',fontSize:18,padding:'0 4px'}}>‹</button>
        <div className="sl" style={{flex:1,marginBottom:0}}>{calTitle}</div>
        <button onClick={()=>goMonth(1)} style={{background:'none',border:'none',color:'var(--mu)',cursor:'pointer',fontSize:18,padding:'0 4px'}}>›</button>
      </div>
      <div style={{display:'flex',gap:10,fontSize:10,opacity:.6,marginBottom:8,justifyContent:'flex-end'}}>
        <DLg c={TEAL} t="objetivo"/><DLg c="#ef9f27" t="cerca"/><DLg c="#e24b4a" t="lejos"/><DLg c="var(--mu2)" t="libre"/>
      </div>
      <div className="cal" style={{marginBottom:20}}>
        {['L','M','X','J','V','S','D'].map(d=><div key={d} className="ch">{d}</div>)}
        {calDays.map((cell,i)=>{
          if(!cell)return <div key={i} style={{aspectRatio:'1',background:'var(--sf)',border:'1px solid var(--bd)'}}/>;
          const {d}=cell;
          const ds=`${calYear}-${calMonthStr}-${String(d).padStart(2,'0')}`;
          const t=getDay(ds);
          const isFree=freeSet.has(ds);
          const hasEst=t.items.some(it=>it.estimated);
          const isPast=ds<TODAY_STR();
          const tgt=dayTargetFor(ds);
          const st=isFree?'free':dayStatus(t.kcal,tgt,t.protein,protTarget,isPast);
          const isSel=ds===sel;
          const dotColor=st==='free'?'var(--mu2)':ST_COLOR[st];
          const kPct=Math.min(100,(t.kcal/tgt)*100);
          const pPct=Math.min(100,(t.protein/protTarget)*100);
          const hasData=t.items.length>0;
          return (
            <button key={d} onClick={()=>{ if(sel===ds){ setDayPopup(ds); } else { setSel(ds); } }}
              style={{aspectRatio:'1',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,background:isSel?'rgba(29,158,117,0.15)':isFree?'rgba(255,255,255,0.02)':'var(--sf)',border:isSel?`1px solid ${TEAL}`:'1px solid var(--bd)',cursor:'pointer',padding:0,width:'100%',position:'relative',overflow:'hidden'}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:11,opacity:(st==='none')?.3:.85,color:isSel?TEAL:'var(--tx)'}}>{String(d).padStart(2,'0')}</span>
              {st==='free'
                ? <span style={{fontSize:8,color:'var(--mu)',lineHeight:1}}>libre</span>
                : <span style={{width:6,height:6,borderRadius:'50%',background:dotColor}}/>}
              {hasEst && !isFree && <span style={{position:'absolute',top:1,right:3,fontSize:8,color:TEAL,opacity:.8}}>~</span>}
              {hasData && !isFree && (
                <div style={{position:'absolute',bottom:2,left:3,right:3,display:'flex',flexDirection:'column',gap:1}}>
                  <div style={{height:3,background:'rgba(255,255,255,0.1)',overflow:'hidden'}}><div style={{width:`${kPct}%`,height:'100%',background:'#4a9fe8'}}/></div>
                  <div style={{height:3,background:'rgba(255,255,255,0.1)',overflow:'hidden'}}><div style={{width:`${pPct}%`,height:'100%',background:'#25c290'}}/></div>
                </div>
              )}
            </button>
          );
        })}
      </div>
      <p style={{fontSize:9,color:'var(--mu)',letterSpacing:.5,margin:'-14px 0 16px',textAlign:'right'}}>toca un día para seleccionarlo · tócalo otra vez para ver su detalle</p>

      {/* Añadir | Hoy */}
      <div className="diary-tabs" style={{marginBottom:14}}>
        <div className={`diary-tab${dtab==='add'?' active':''}`} onClick={()=>setDtab('add')} style={dtab==='add'?{color:TEAL,borderColor:TEAL}:{}}>Añadir</div>
        <div className={`diary-tab${dtab==='hoy'?' active':''}`} onClick={()=>setDtab('hoy')} style={dtab==='hoy'?{color:TEAL,borderColor:TEAL}:{}}>{sel===TODAY_STR()?'Hoy':fmtShort(sel)}{totals.items.length?` · ${totals.items.length}`:''}</div>
      </div>

      {dtab==='add' && (<>
      {/* Selector de momento del día */}
      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12}}>
        {MEALS.map(m=>(
          <button key={m} onClick={()=>setMeal(m)}
            style={{fontFamily:"'DM Mono',monospace",fontSize:10,letterSpacing:.5,padding:'6px 12px',cursor:'pointer',
              background:meal===m?'rgba(29,158,117,0.15)':'var(--sf)',
              border:meal===m?`1px solid ${TEAL}`:'1px solid var(--bd2)',
              color:meal===m?TEAL:'var(--mu3)'}}>{MEAL_LBL[m]}</button>
        ))}
      </div>

      {/* Selector de cantidad para el proximo plato que pulses */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <span style={{fontSize:11,color:'var(--mu3)'}}>Cantidad</span>
        <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={dQty}>-</button>
        <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,minWidth:22,textAlign:'center',color:qty>1?TEAL:'var(--tx)'}}>{qty}</span>
        <button onClick={()=>setQty(q=>q+1)} style={dQty}>+</button>
        {qty>1 && <span style={{fontSize:10,color:TEAL}}>se anadiran {qty} de una</span>}
      </div>

      {/* Lista de platos ordenada por frecuencia de uso */}
      <div style={{display:'flex',justifyContent:'flex-end',gap:6,marginBottom:6}}>
        <button onClick={()=>setPantryOpen(true)} style={dMini}>▤ DESPENSA</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:8,marginBottom:10}}>
        {ranked.map(t=>(
          <div key={t.id} style={{position:'relative',minWidth:0}}>
            <button onClick={()=>addTpl(t)} style={{...dTpl,width:'100%',borderColor:TIER_BORDER[t.tier]||'var(--bd2)'}}>
              <div style={{display:'flex',alignItems:'center',marginBottom:3,minWidth:0}}>
                <span style={{fontSize:13,fontWeight:500,flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.name}{t.estimated?' ~':''}</span>
              </div>
              <span style={{fontSize:11,opacity:.55,display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.kcal} kcal · {t.protein} g</span>
            </button>
          </div>
        ))}
      </div>

      <button onClick={()=>setTextOpen(true)} style={{...dMini,width:'100%',marginBottom:14,textAlign:'center',padding:'12px'}}>✎ OTRA COMIDA · LA DESCRIBES Y LA IA LA ESTIMA</button>
      </>)}

      {dtab==='hoy' && (<>
      {/* Día libre toggle */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14,padding:'8px 12px',background:selIsFree?'rgba(255,255,255,0.04)':'transparent',border:selIsFree?'1px solid var(--bd2)':'1px solid transparent'}}>
        <span style={{fontSize:11,color:selIsFree?'var(--mu)':'var(--mu3)'}}>{selIsFree?'Día libre — no se mide (mantiene racha)':'¿Comes fuera y no mides?'}</span>
        <button onClick={()=>D.setFreeDay(sel,!selIsFree)} style={{...dMini,borderColor:selIsFree?TEAL:'var(--bd2)',color:selIsFree?TEAL:'var(--mu3)'}}>{selIsFree?'✓ libre':'marcar libre'}</button>
      </div>
      {/* lista del día */}
      {totals.items.length===0 && !selIsFree && <p style={{fontSize:11,opacity:.4,margin:'2px 0 14px'}}>Nada registrado este día todavía. Pásate a "Añadir".</p>}
      {totals.items.length>0 && (
        <div style={{marginBottom:14}}>
          {totals.items.map(it=>(
            <div key={it.id} style={dRow}>
              <span style={{flex:1,fontSize:13}}>{it.name}{(it.qty||1)>1?` ×${it.qty}`:''}{it.estimated?' ~':''}</span>
              <div style={{display:'flex',alignItems:'center',gap:4,marginRight:8}}>
                <button onClick={()=>{ const q=(it.qty||1)-1; if(q<=0){ D.deleteEntry(it.id); } else { D.updateEntryQty(it,q); } }} style={dQty}>−</button>
                <span style={{fontSize:12,minWidth:14,textAlign:'center'}}>{it.qty||1}</span>
                <button onClick={()=>D.updateEntryQty(it,(it.qty||1)+1)} style={dQty}>+</button>
              </div>
              <span style={{fontSize:12,opacity:.6,marginRight:10,minWidth:64,textAlign:'right'}}>{it.kcal} · {Math.round(it.protein)}g</span>
              <button onClick={()=>D.deleteEntry(it.id)} style={dDel}>×</button>
            </div>
          ))}
        </div>
      )}
      </>)}

      {/* Progreso visual: log de reviews en texto */}
      <div className="sl">Progreso visual</div>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:12,marginBottom:20}}>
        {daysSince>=14 && <div style={{fontSize:11,color:TEAL,marginBottom:10}}>⏰ Toca review quincenal {lastPhoto?`(última hace ${daysSince} días)`:'(primera)'} · añádela desde ⚡ → REVIEW VISUAL</div>}
        {D.photos.length===0 && <p style={{fontSize:11,opacity:.4,margin:0}}>Aún sin reviews. Pásale tu foto al chat, pega aquí la valoración desde ⚡ → REVIEW VISUAL.</p>}
        {D.photos.map(p=>(
          <div key={p.id} style={{borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'10px 0'}}>
            <div style={{display:'flex',gap:10,alignItems:'baseline',marginBottom:4}}>
              <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:TEAL,letterSpacing:1}}>{fmtDate(p.date)}</span>
              {p.waist_cm && <span style={{fontSize:10,color:'var(--mu3)'}}>cintura {p.waist_cm} cm</span>}
              {p.weight_kg && <span style={{fontSize:10,color:'var(--mu3)'}}>{p.weight_kg} kg</span>}
            </div>
            {p.assessment && <div style={{fontSize:11,lineHeight:1.6,color:'var(--tx)',opacity:.85,whiteSpace:'pre-wrap'}}>{p.assessment}</div>}
          </div>
        ))}
      </div>

      {textOpen && (
        <DModal onClose={()=>{setTextOpen(false);setAiPreview(null);}}>
          <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 10px'}}>AÑADIR COMIDA</h3>
          <textarea value={foodText} onChange={e=>setFoodText(e.target.value)} placeholder="Ej: 200g de salmón con una taza de arroz y ensalada"
            style={{width:'100%',minHeight:80,fontSize:16,padding:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
          {aiErr && <div style={{fontSize:11,color:'#e24b4a',marginTop:8}}>⚠ {aiErr}</div>}
          {!aiPreview && <button onClick={parseFood} disabled={aiBusy} style={{...dPrimary,marginTop:10,opacity:aiBusy?.5:1}}>{aiBusy?'Analizando…':'Analizar con IA'}</button>}
          {aiPreview && (
            <div style={{marginTop:12}}>
              {aiPreview.items.map((i,k)=>(<div key={k} style={dRow}><span style={{flex:1,fontSize:13}}>{i.name}</span><span style={{fontSize:12,opacity:.6}}>{i.kcal} · {Math.round(i.protein)}g</span></div>))}
              <div style={{fontSize:12,opacity:.7,margin:'8px 0',textAlign:'right'}}>Total: {fmtN(aiPreview.total_kcal)} kcal · {Math.round(aiPreview.total_protein)} g</div>
              {aiPreview.note && <div style={{fontSize:11,color:TEAL,marginBottom:8}}>{aiPreview.note}</div>}
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <button onClick={confirmAi} style={dPrimary}>Añadir al día</button>
                <button onClick={async()=>{ for(const i of aiPreview.items){ await D.createTemplate({name:i.name,kcal:i.kcal,protein:i.protein,tier:'verde',meal:i.meal||meal}); } await confirmAi(); }}
                  style={{...dMini,padding:'11px 14px',borderColor:TEAL,color:TEAL,textAlign:'center'}}>Añadir al día + guardar en despensa</button>
                <button onClick={()=>setAiPreview(null)} style={{...dMini,textAlign:'center'}}>Reintentar</button>
              </div>
            </div>
          )}
        </DModal>
      )}
      {newOpen && <DNewItemModal meal={meal} onClose={()=>setNewOpen(false)}
        onCreate={async(item,addToday)=>{ await D.createTemplate(item); if(addToday){ await D.addEntry({date:sel,meal,name:item.name,kcal:item.kcal,protein:item.protein,source:'plantilla',estimated:item.estimated,qty}); } setNewOpen(false); }}/>}
      {pantryOpen && <DPantryModal D={D} onClose={()=>setPantryOpen(false)}/>}
      {dayPopup && <DDayDetailModal D={D} date={dayPopup} kcalTarget={dayTargetFor(dayPopup)} protTarget={protTarget} isFree={freeSet.has(dayPopup)} garmin={garminByDate[dayPopup]} onClose={()=>setDayPopup(null)}/>}
    </div>
  );
}

function DBar({label,color,cur,max,right}) {
  const pct=Math.min(100,(cur/max)*100);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color}}>{label}</span><span style={{opacity:.6}}>{right}</span></div>
      <div style={{height:6,background:'rgba(255,255,255,0.08)',overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:color}}/></div>
    </div>
  );
}
const DLg=({c,t})=><span style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:7,height:7,borderRadius:'50%',background:c}}/>{t}</span>;
function DModal({children,onClose}){return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:16}}><div onClick={e=>e.stopPropagation()} style={{background:'var(--bg,#0e0e0d)',border:'1px solid var(--bd2,rgba(255,255,255,0.14))',padding:20,maxWidth:380,width:'100%',maxHeight:'85vh',overflowY:'auto'}}>{children}</div></div>;}
function DReviewModal({ onClose, onSave }) {
  const [waist, setWaist] = useState('');
  const [weight, setWeight] = useState('');
  const [assessment, setAssessment] = useState('');
  const pasteReview = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) setAssessment(t); } catch (e) {}
  };
  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>REVIEW VISUAL</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 12px'}}>Pásale tu foto de progreso al chat (con el prompt de review), y pega aquí la valoración. La foto no se sube a ningún sitio.</p>
      <div style={{display:'flex',gap:8}}>
        <DField label="Cintura (cm)" value={waist} onChange={setWaist} placeholder="84" type="number"/>
        <DField label="Peso (kg)" value={weight} onChange={setWeight} placeholder="83.7" type="number"/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <label style={{fontSize:11,opacity:.6}}>Valoración (texto del chat)</label>
        <button onClick={pasteReview} style={{fontSize:10,background:'rgba(255,255,255,0.06)',border:'1px solid #1d9e75',color:'#1d9e75',padding:'5px 9px',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>📋 PEGAR</button>
      </div>
      <textarea value={assessment} onChange={e=>setAssessment(e.target.value)}
        style={{width:'100%',minHeight:110,fontSize:14,padding:8,margin:'6px 0 12px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
      <button disabled={!assessment.trim()&&!waist&&!weight}
        onClick={()=>onSave({photo_url:null,waist_cm:waist?Number(waist):null,weight_kg:weight?Number(weight):null,assessment:assessment.trim()||null})}
        style={{width:'100%',background:'#1d9e75',border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#06241b',cursor:'pointer',fontFamily:"'DM Mono',monospace",opacity:(assessment.trim()||waist||weight)?1:.4}}>Guardar review</button>
    </DModal>
  );
}
// parsea el bloque estandar de datos Garmin (uno o varios dias)
function parseGarminPaste(text) {
  if (!text) return [];
  const toNum = s => {
    if (s == null) return null;
    let t = String(s).trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
    t = t.replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const normDate = s => {
    if (!s) return null;
    const t = s.trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    m = t.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    return null;
  };
  const blocks = text.split(/(?=fecha\s*:)/i).filter(b => b.trim());
  const days = [];
  for (const b of blocks) {
    const get = re => { const m = b.match(re); return m ? m[1] : null; };
    const date = normDate(get(/fecha\s*:\s*([\d\-\/]+)/i));
    if (!date) continue;
    const sleepM = b.match(/sue[nñ]o\s*:\s*(\d+)\s*h\s*(\d+)?/i);
    const sleep_h = sleepM ? Number((Number(sleepM[1]) + (Number(sleepM[2]||0)/60)).toFixed(2)) : null;
    const scoreM = b.match(/sue[nñ]o[^\n]*\((\d+)\)/i) || b.match(/puntuaci[oó]n\s*:\s*(\d+)/i);
    const bbM = b.match(/body\s*battery\s*:\s*([+\-]?\d+)/i);
    days.push({
      date,
      steps: toNum(get(/pasos\s*:\s*([\d.,]+)/i)),
      kcal_total: toNum(get(/calor[ií]as?\s*:\s*([\d.,]+)/i)),
      resting_hr: toNum(get(/fc\s*(?:en\s*)?reposo\s*:\s*([\d.,]+)/i)),
      sleep_h,
      sleep_score: scoreM ? Number(scoreM[1]) : null,
      body_battery: bbM ? Number(bbM[1]) : null,
      stress: toNum(get(/estr[eé]s\s*:\s*([\d.,]+)/i)),
      intensity_min: toNum(get(/intensidad\s*:\s*([\d.,]+)/i)),
    });
  }
  return days;
}

// parsea el texto que devuelve el prompt nutricional del chat
function parseNutriPaste(text) {
  if (!text) return null;
  const get = (re) => { const m = text.match(re); return m ? m[1].trim() : null; };
  const name = get(/nombre\s*:\s*(.+)/i);
  const kcalRaw = get(/calor[ií]as?\s*:\s*([\d.,]+)/i);
  const protRaw = get(/prote[ií]na\s*:\s*([\d.,]+)/i);
  // "1.450" (miles es) -> 1450 ; "42,5" -> 42.5
  const toNum = s => {
    if (!s) return '';
    let t = s.trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');       // puntos de miles
    if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');           // comas de miles
    t = t.replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : '';
  };
  const tierRaw = get(/tipo\s*:\s*(\w+)/i);
  if (!name && !kcalRaw) return null;
  let tier = 'verde';
  if (tierRaw) {
    const t = tierRaw.toLowerCase();
    if (t.startsWith('golos')) tier = 'goloso';
    else if (t.startsWith('pecad')) tier = 'pecado';
    else tier = 'verde';
  }
  return {
    name: name || '',
    kcal: toNum(kcalRaw),
    protein: toNum(protRaw),
    tier,
  };
}

function DNewItemModal({ meal, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [protein, setProtein] = useState('');
  const [tier, setTier] = useState('verde');
  const [estimated, setEstimated] = useState(false);
  const [paste, setPaste] = useState('');
  const valid = name.trim() && kcal !== '';

  const applyParsed = (txt) => {
    const p = parseNutriPaste(txt);
    if (p && (p.name || p.kcal !== '')) {
      if (p.name) setName(p.name);
      if (p.kcal !== '') setKcal(String(p.kcal));
      if (p.protein !== '') setProtein(String(p.protein));
      if (p.tier) setTier(p.tier);
      return true;
    }
    return false;
  };
  const onPasteChange = (v) => { setPaste(v); applyParsed(v); };
  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { setPaste(t); applyParsed(t); }
    } catch (e) { /* sin permiso: se puede pegar a mano */ }
  };

  const build = () => ({name:name.trim(),kcal:Number(kcal),protein:Number(protein||0),tier,meal,estimated});

  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>NUEVO ELEMENTO</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 12px'}}>Pega lo que te devuelve el chat, o rellena a mano.</p>

      {/* Pegar copy-paste del prompt: se rellena solo */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <label style={{fontSize:11,opacity:.6}}>Pegar del chat · se rellena solo</label>
        <button onClick={pasteFromClipboard} style={{...dMini,padding:'6px 10px',borderColor:TEAL,color:TEAL}}>📋 PEGAR</button>
      </div>
      <textarea value={paste} onChange={e=>onPasteChange(e.target.value)} placeholder={"Nombre: ...\nCalorías: ... kcal\nProteína: ... g\nTipo: ..."}
        style={{width:'100%',minHeight:56,fontSize:14,padding:8,margin:'6px 0 14px',background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>

      <DField label="Nombre" value={name} onChange={setName} placeholder="Ej: Ensalada mediodía con pollo frito"/>
      <div style={{display:'flex',gap:8}}>
        <DField label="Calorías (kcal)" value={kcal} onChange={setKcal} placeholder="520" type="number"/>
        <DField label="Proteína (g)" value={protein} onChange={setProtein} placeholder="42" type="number"/>
      </div>
      <label style={{fontSize:11,opacity:.6}}>Tipo</label>
      <div style={{display:'flex',gap:6,margin:'6px 0 14px'}}>
        {[['verde','Sano'],['goloso','Goloso'],['pecado','Pecado']].map(([v,l])=>(
          <button key={v} onClick={()=>setTier(v)} style={{flex:1,fontSize:11,padding:'7px 0',cursor:'pointer',
            background:tier===v?'rgba(255,255,255,0.08)':'transparent',
            border:tier===v?`1px solid ${TIER_COLOR[v]}`:'1px solid var(--bd2)',
            color:tier===v?TIER_COLOR[v]:'var(--mu3)'}}>{l}</button>
        ))}
      </div>
      <label onClick={()=>setEstimated(v=>!v)} style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:estimated?TEAL:'var(--mu3)',cursor:'pointer',margin:'0 0 14px'}}>
        <span style={{width:18,height:18,border:`1px solid ${estimated?TEAL:'var(--bd2)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,color:TEAL}}>{estimated?'✓':''}</span>
        Estimación al alza (comida no medida al gramo)
      </label>

      {/* Dos botones: solo despensa / guardar y añadir a hoy */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <button disabled={!valid} onClick={()=>onCreate(build(), true)}
          style={{...dPrimary,opacity:valid?1:.4,cursor:valid?'pointer':'default'}}>Guardar y añadir a {MEAL_LBL[meal]}</button>
        <button disabled={!valid} onClick={()=>onCreate(build(), false)}
          style={{...dMini,padding:'10px 14px',opacity:valid?1:.4,cursor:valid?'pointer':'default',borderColor:'var(--bd2)'}}>Solo guardar en despensa</button>
      </div>
    </DModal>
  );
}
function DDayDetailModal({ D, date, kcalTarget, protTarget, isFree, garmin, onClose }) {
  const t = dayTotals(D.entries, date);
  const byMeal = {};
  t.items.forEach(it => { const m = it.meal || 'otros'; (byMeal[m] = byMeal[m] || []).push(it); });
  const order = ['desayuno','brunch','almuerzo','merienda','cena','otros'];
  const kPct = Math.round((t.kcal / kcalTarget) * 100);
  const pPct = Math.round((t.protein / protTarget) * 100);
  const dlabel = (() => { try { return new Date(date+'T00:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'}); } catch { return date; } })();
  const kDiff = t.kcal - kcalTarget;
  const pDiff = Math.round(t.protein - protTarget);

  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 2px',textTransform:'capitalize'}}>{dlabel}</h3>
      {isFree ? (
        <p style={{fontSize:13,color:'var(--mu)',margin:'10px 0'}}>Día marcado como libre — no medido.</p>
      ) : t.items.length === 0 ? (
        <p style={{fontSize:13,color:'var(--mu)',margin:'10px 0'}}>Sin registros este día.</p>
      ) : (
        <>
          {/* resumen kcal y proteína con % */}
          <div style={{display:'flex',gap:10,margin:'10px 0 16px'}}>
            <div style={{flex:1,background:'var(--sf)',border:'1px solid var(--bd)',padding:'8px 10px'}}>
              <div style={{fontSize:9,letterSpacing:1,textTransform:'uppercase',color:'var(--mu3)'}}>Calorías</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'#378add'}}>{Math.round(t.kcal)} <span style={{fontSize:12,color:'var(--mu)'}}>/ {kcalTarget}</span></div>
              <div style={{fontSize:10,color:kDiff>0?'#e24b4a':TEAL}}>{kPct}% · {kDiff>0?'+':''}{kDiff} kcal</div>
            </div>
            <div style={{flex:1,background:'var(--sf)',border:'1px solid var(--bd)',padding:'8px 10px'}}>
              <div style={{fontSize:9,letterSpacing:1,textTransform:'uppercase',color:'var(--mu3)'}}>Proteína</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:TEAL}}>{Math.round(t.protein)} <span style={{fontSize:12,color:'var(--mu)'}}>/ {protTarget}g</span></div>
              <div style={{fontSize:10,color:pDiff<0?'#ef9f27':TEAL}}>{pPct}% · {pDiff>0?'+':''}{pDiff} g</div>
            </div>
          </div>

          {garmin && garmin.kcal_total>0 && <p style={{fontSize:9,color:'var(--mu3)',margin:'-8px 0 12px'}}>◎ objetivo de ese día ajustado a su gasto real (gasto − 600)</p>}
          {/* balance real del dia (si hay datos garmin) */}
          {garmin && garmin.kcal_total > 0 && (() => {
            const bal = Math.round(t.kcal - garmin.kcal_total);
            return (
              <div style={{background:'rgba(29,158,117,0.05)',border:'1px solid rgba(29,158,117,0.25)',padding:'8px 10px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                <span style={{fontSize:9,letterSpacing:1,textTransform:'uppercase',color:'var(--mu3)'}}>Balance real · gasto Garmin {fmtN(garmin.kcal_total)}</span>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:bal<0?TEAL:'#e24b4a'}}>{bal>0?'+':''}{fmtN(bal)} kcal</span>
              </div>
            );
          })()}

          {/* desglose por momento */}
          <div style={{maxHeight:'45vh',overflowY:'auto'}}>
            {order.filter(m=>byMeal[m]).map(m=>{
              const items=byMeal[m];
              const mk=items.reduce((s,i)=>s+(i.kcal||0),0);
              const mp=items.reduce((s,i)=>s+(Number(i.protein)||0),0);
              return (
                <div key={m} style={{marginBottom:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4,borderBottom:`1px solid ${TEAL}33`,paddingBottom:3}}>
                    <span style={{fontSize:11,letterSpacing:1,textTransform:'uppercase',color:TEAL}}>{MEAL_LBL[m]}</span>
                    <span style={{fontSize:10,color:'var(--mu)'}}>{mk} kcal · {Math.round(mp)} g</span>
                  </div>
                  {items.map(it=>(
                    <div key={it.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'2px 0'}}>
                      <span>{it.name}{(it.qty||1)>1?` ×${it.qty}`:''}{it.estimated?' ~':''}</span>
                      <span style={{color:'var(--mu3)'}}>{it.kcal} · {Math.round(it.protein)}g</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
      <button onClick={onClose} style={{...dMini,width:'100%',marginTop:8,padding:'10px'}}>Cerrar</button>
    </DModal>
  );
}
function DGarminModal({ onClose, onSave }) {
  const [paste, setPaste] = useState('');
  const [preview, setPreview] = useState(null);
  const analyze = () => {
    const days = parseGarminPaste(paste);
    setPreview(days.length ? days : []);
  };
  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>DATOS GARMIN</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 12px'}}>Pega el bloque que te devuelve el chat a partir de tus capturas. Acepta uno o varios días de golpe. Si un día ya existía, se actualiza.</p>
      <textarea value={paste} onChange={e=>setPaste(e.target.value)}
        placeholder={"Fecha: 2026-07-01\nPasos: 12.345\nCalorías: 3.420\nFC reposo: 53\nSueño: 6h58 (79)\nBody Battery: +62"}
        style={{width:'100%',minHeight:110,fontSize:14,padding:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box',fontFamily:"'DM Mono',monospace"}}/>
      {!preview && <button onClick={analyze} style={{...dPrimary,marginTop:10}}>Analizar</button>}
      {preview && preview.length===0 && <p style={{fontSize:11,color:'#e24b4a',marginTop:8}}>⚠ No encontré ninguna línea "Fecha:". Revisa el formato.</p>}
      {preview && preview.length>0 && (
        <div style={{marginTop:12}}>
          {preview.map(d=>(
            <div key={d.date} style={{borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'6px 0',fontSize:11}}>
              <span style={{color:TEAL,fontFamily:"'DM Mono',monospace"}}>{d.date}</span>
              <span style={{opacity:.7,marginLeft:8}}>
                {d.kcal_total?`${d.kcal_total} kcal`:''}{d.steps?` · ${d.steps.toLocaleString('es-ES')} pasos`:''}{d.sleep_h?` · ${Math.floor(d.sleep_h)}h${String(Math.round((d.sleep_h%1)*60)).padStart(2,'0')} sueño`:''}{d.resting_hr?` · FC ${d.resting_hr}`:''}{d.body_battery!=null?` · BB ${d.body_battery>0?'+':''}${d.body_battery}`:''}
              </span>
            </div>
          ))}
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button onClick={()=>onSave(preview)} style={dPrimary}>Guardar {preview.length} {preview.length===1?'día':'días'}</button>
            <button onClick={()=>setPreview(null)} style={dMini}>Editar</button>
          </div>
        </div>
      )}
    </DModal>
  );
}
function DPantryModal({ D, onClose }) {
  const [editId, setEditId] = useState(null);
  const [f, setF] = useState({});
  const [q, setQ] = useState('');

  const startEdit = (t) => { setEditId(t.id); setF({name:t.name,kcal:String(t.kcal),protein:String(t.protein),tier:t.tier}); };
  const save = async () => {
    await D.updateTemplate(editId, {name:f.name,kcal:Number(f.kcal),protein:Number(f.protein||0),tier:f.tier});
    setEditId(null);
  };
  const items = [...(D.templates||[])]
    .filter(t => !q || (t.name||'').toLowerCase().includes(q.toLowerCase()))
    .sort((a,b)=>(a.name||'').localeCompare(b.name||''));

  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>DESPENSA</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 12px'}}>Todos tus alimentos. Edita o elimina cualquiera.</p>
      <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar…"
        style={{width:'100%',fontSize:16,padding:8,marginBottom:12,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
      <div style={{maxHeight:'50vh',overflowY:'auto'}}>
        {items.length===0 && <p style={{fontSize:12,opacity:.4}}>Sin alimentos.</p>}
        {items.map(t=>(
          <div key={t.id} style={{padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
            {editId===t.id ? (
              <div>
                <input value={f.name} onChange={e=>setF({...f,name:e.target.value})} style={dPInput}/>
                <div style={{display:'flex',gap:6,marginTop:6}}>
                  <input value={f.kcal} onChange={e=>setF({...f,kcal:e.target.value})} type="number" placeholder="kcal" style={{...dPInput,flex:1}}/>
                  <input value={f.protein} onChange={e=>setF({...f,protein:e.target.value})} type="number" placeholder="prot" style={{...dPInput,flex:1}}/>
                </div>
                <div style={{display:'flex',gap:6,margin:'6px 0'}}>
                  {[['verde','Sano'],['goloso','Goloso'],['pecado','Pecado']].map(([v,l])=>(
                    <button key={v} onClick={()=>setF({...f,tier:v})} style={{flex:1,fontSize:10,padding:'5px 0',cursor:'pointer',background:f.tier===v?'rgba(255,255,255,0.08)':'transparent',border:f.tier===v?`1px solid ${TIER_COLOR[v]}`:'1px solid var(--bd2)',color:f.tier===v?TIER_COLOR[v]:'var(--mu3)'}}>{l}</button>
                  ))}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={save} style={{...dPrimary,padding:'7px 10px',fontSize:12}}>Guardar</button>
                  <button onClick={()=>setEditId(null)} style={{...dMini}}>Cancelar</button>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:TIER_COLOR[t.tier]||'#888',flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.name}{t.estimated?' ~':''}</div>
                  <div style={{fontSize:11,opacity:.55}}>{t.kcal} kcal · {t.protein} g</div>
                </div>
                <button onClick={()=>startEdit(t)} style={{...dMini,padding:'4px 8px'}}>editar</button>
                <button onClick={()=>{ if(confirm('¿Borrar "'+t.name+'"?')) D.deleteTemplate(t.id); }} style={{...dMini,padding:'4px 8px',borderColor:'rgba(226,75,74,0.4)',color:'#e24b4a'}}>×</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onClose} style={{...dMini,width:'100%',marginTop:12,padding:'10px'}}>Cerrar</button>
    </DModal>
  );
}
const dPInput={width:'100%',fontSize:15,padding:7,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'};
const DAY_PALETTE = ['#e8ff47','#47b8ff','#ff6b47','#b494e8','#1d9e75','#ef9f27'];

function validateProtocol(text) {
  // tolera fences ```json, texto alrededor, y comillas tipograficas de iOS
  let t = String(text || '').trim()
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')   // " " „ -> "
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")          // ' ' -> '
    .replace(/\u00A0/g, ' ')                                // espacios duros iOS
    .replace(/```json/gi, '```');
  const fence = t.match(/```([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const braceStart = t.indexOf('{');
  const braceEnd = t.lastIndexOf('}');
  if (braceStart === -1 || braceEnd === -1) return { error: 'No encuentro un JSON en el texto.' };
  let p;
  try { p = JSON.parse(t.slice(braceStart, braceEnd + 1)); }
  catch (e) { return { error: 'JSON inválido: ' + e.message.slice(0, 80) }; }
  if (typeof p.week !== 'number') return { error: 'Falta "week" (número de semana).' };
  if (!Array.isArray(p.days) || !p.days.length) return { error: 'Falta "days" (lista de días).' };
  const VALID_TYPES = ['warmup','superset','main','circuit','core'];
  for (let di = 0; di < p.days.length; di++) {
    const d = p.days[di];
    if (!d.name) return { error: `Día ${di+1}: falta "name".` };
    if (d.id === undefined) d.id = String(di + 1);
    if (!d.emoji) d.emoji = '🔥';
    if (!d.color) d.color = DAY_PALETTE[di % DAY_PALETTE.length];
    if (!Array.isArray(d.blocks) || !d.blocks.length) return { error: `Día "${d.name}": falta "blocks".` };
    for (const b of d.blocks) {
      if (!b.name) return { error: `Día "${d.name}": un bloque sin "name".` };
      if (!VALID_TYPES.includes(b.type)) b.type = 'main';
      if (!Array.isArray(b.exercises)) return { error: `Bloque "${b.name}": falta "exercises".` };
      for (const ex of b.exercises) {
        if (!ex.name) return { error: `Bloque "${b.name}": ejercicio sin "name".` };
        if (!Array.isArray(ex.sets) || !ex.sets.length) return { error: `Ejercicio "${ex.name}": falta "sets".` };
        for (const s of ex.sets) {
          if (s.reps === undefined) return { error: `Ejercicio "${ex.name}": un set sin "reps".` };
          if (s.weight === undefined) s.weight = null;
        }
      }
    }
  }
  return { protocol: p };
}

function DImportProtocolModal({ onClose }) {
  const [paste, setPaste] = useState('');
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);

  const analyze = (txt) => { const r = validateProtocol(txt !== undefined ? txt : paste); setResult(r); };
  const pasteClip = async () => {
    try { const t = await navigator.clipboard.readText(); if (t) { setPaste(t); analyze(t); } } catch (e) {}
  };
  const save = async () => {
    if (!result || !result.protocol) return;
    setSaving(true); setErr(null);
    const { error } = await supabase.from('protocols').insert({ week: result.protocol.week, protocol_data: result.protocol });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setDone(true);
  };

  const p = result && result.protocol;
  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>CARGAR PROTOCOLO</h3>
      {done ? (
        <div>
          <p style={{fontSize:13,color:'var(--ac)',margin:'14px 0'}}>✓ Protocolo SEMANA {p.week} activo.</p>
          <p style={{fontSize:11,opacity:.6,margin:'0 0 14px'}}>Ábrelo en ⚡ → PROTOCOLO DE ENTRENAMIENTO. El anterior queda guardado como historial.</p>
          <button onClick={onClose} style={{width:'100%',background:'var(--ac)',border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#111',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>LISTO</button>
        </div>
      ) : (
        <div>
          <p style={{fontSize:11,opacity:.55,margin:'0 0 10px'}}>Pega aquí el protocolo (JSON) que te devuelve el chat. Se valida antes de activarlo.</p>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:6}}>
            <button onClick={pasteClip} style={{fontSize:10,background:'rgba(255,255,255,0.06)',border:'1px solid var(--ac)',color:'var(--ac)',padding:'6px 10px',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>📋 PEGAR</button>
          </div>
          <textarea value={paste} onChange={e=>{setPaste(e.target.value); setResult(null);}}
            placeholder='{"week": 24, "days": [ ... ]}'
            style={{width:'100%',minHeight:110,fontSize:11,padding:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',color:'var(--tx)',boxSizing:'border-box',fontFamily:"'DM Mono',monospace"}}/>
          {!result && <button onClick={()=>analyze()} disabled={!paste.trim()} style={{width:'100%',marginTop:10,background:'var(--ac)',border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#111',cursor:'pointer',fontFamily:"'DM Mono',monospace",opacity:paste.trim()?1:.4}}>ANALIZAR</button>}
          {result && result.error && <p style={{fontSize:11,color:'#e24b4a',marginTop:10}}>⚠ {result.error}</p>}
          {p && (
            <div style={{marginTop:12}}>
              <div style={{fontSize:11,color:'var(--ac)',letterSpacing:1,marginBottom:8,fontFamily:"'DM Mono',monospace"}}>SEMANA {p.week} · {p.days.length} DÍAS</div>
              {p.days.map((d,i)=>{
                const nEx = d.blocks.reduce((s,b)=>s+b.exercises.length,0);
                const nSets = d.blocks.reduce((s,b)=>s+b.exercises.reduce((x,e)=>x+e.sets.length,0),0);
                return (
                  <div key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'6px 0',fontSize:11,display:'flex',gap:8,alignItems:'baseline'}}>
                    <span style={{color:d.color,fontFamily:"'DM Mono',monospace"}}>D{d.id}</span>
                    <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{d.emoji} {d.name}</span>
                    <span style={{color:'var(--mu3)',flexShrink:0}}>{d.blocks.length} bloques · {nEx} ej · {nSets} series</span>
                  </div>
                );
              })}
              {err && <p style={{fontSize:11,color:'#e24b4a',marginTop:8}}>⚠ Error guardando: {err}</p>}
              <div style={{display:'flex',gap:8,marginTop:12}}>
                <button onClick={save} disabled={saving} style={{flex:1,background:'var(--ac)',border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#111',cursor:'pointer',fontFamily:"'DM Mono',monospace",opacity:saving?.5:1}}>{saving?'GUARDANDO…':'GUARDAR Y ACTIVAR'}</button>
                <button onClick={()=>setResult(null)} style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',padding:'9px 14px',fontSize:11,color:'inherit',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>editar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </DModal>
  );
}

function DFullExportModal({ sessions, dietData, bios, onClose }) {
  const D = dietData;
  const [copied, setCopied] = useState(false);
  const [protoInfo, setProtoInfo] = useState('cargando…');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.from('protocols').select('week,created_at,protocol_data').order('created_at', { ascending: false }).limit(1);
        if (!alive) return;
        if (error || !data || !data.length) { setProtoInfo('tabla vacía (usa el DEFAULT hardcodeado)'); return; }
        const p = data[0];
        const names = ((p.protocol_data && p.protocol_data.days) || []).map(d => d.name).join(',');
        setProtoInfo(`activo S${p.week} (${(p.created_at||'').slice(0,10)}) · días: ${names}`);
      } catch (e) { if (alive) setProtoInfo('no accesible'); }
    })();
    return () => { alive = false; };
  }, []);

  const text = useMemo(() => {
    const today = TODAY_STR();
    const L = [];
    const wk = new Date(); wk.setDate(wk.getDate() - 7); const ws = wk.toLocaleDateString('en-CA');
    const w8 = new Date(); w8.setDate(w8.getDate() - 56); const w8s = w8.toLocaleDateString('en-CA');

    L.push(`VOLCADO TRAINING LOG · ${today}`);

    // CONFIG
    const kt = (D.target && D.target.kcal_target) || 2800;
    const pt = (D.target && D.target.protein_target) || 160;
    const gpast = (D.garmin || []).filter(g => g.date < today && (g.kcal_total || 0) > 1200).slice(0, 7);
    const avg = gpast.length ? Math.round(gpast.reduce((s, g) => s + g.kcal_total, 0) / gpast.length) : null;
    const dyn = avg ? Math.min(3200, Math.max(2300, Math.round((avg - 600) / 10) * 10)) : null;
    L.push('', '== CONFIG ==');
    L.push(`objetivo fijo: ${kt}kcal/${pt}p` + (dyn ? ` · dinámico: ${dyn} (media gasto ${avg}, ${gpast.length}d)` : ' · dinámico: sin datos garmin'));
    L.push(`racha dieta: ${calcStreak(D.entries || [], D.freeDays || [])} · días libres: ${(D.freeDays||[]).map(f=>f.date).join(',') || 'ninguno'}`);

    // GARMIN
    const gar = [...(D.garmin || [])].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    L.push('', `== GARMIN (${gar.length}) ==`, 'fecha|pasos|kcal|fc|sueñoH|punt|bb');
    gar.forEach(g => L.push([g.date, g.steps??'', g.kcal_total??'', g.resting_hr??'', g.sleep_h??'', g.sleep_score??'', g.body_battery??''].join('|')));

    // DIETA por dia
    const byDate = {};
    (D.entries || []).forEach(e => { const t = byDate[e.date] || (byDate[e.date] = { k:0, p:0, items:[] }); t.k += e.kcal||0; t.p += Number(e.protein)||0; t.items.push(e); });
    const days = Object.keys(byDate).sort();
    const freeSet = new Set((D.freeDays||[]).map(f=>f.date));
    L.push('', `== DIETA POR DÍA (${days.length}) ==`, 'fecha|kcal|prot|items|flags');
    days.forEach(d => L.push([d, Math.round(byDate[d].k), Math.round(byDate[d].p), byDate[d].items.length, freeSet.has(d)?'LIBRE':''].join('|')));
    L.push('', '— detalle últimos 7 días —');
    days.filter(d => d >= ws).forEach(d => {
      const items = byDate[d].items.map(it => `${(it.meal||'?')[0].toUpperCase()}:${it.name}×${it.qty||1}(${it.kcal}/${Math.round(it.protein)})${it.estimated?'~':''}`).join(' ');
      L.push(`${d}: ${items}`);
    });

    // DESPENSA
    const counts = {};
    (D.entries || []).forEach(e => { if (e.name) counts[e.name] = (counts[e.name]||0)+1; });
    L.push('', `== DESPENSA (${(D.templates||[]).length}) ==`, 'nombre|kcal|prot|tier|usos');
    [...(D.templates||[])].sort((a,b)=>(counts[b.name]||0)-(counts[a.name]||0)).forEach(t =>
      L.push([t.name, t.kcal, t.protein, t.tier||'', counts[t.name]||0].join('|') + (t.estimated?' ~':'')));

    // ENTRENOS (8 semanas)
    const ses = (sessions||[]).filter(s => s && s.date >= w8s).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    L.push('', `== ENTRENOS 8SEM (${ses.length}) ==`);
    ses.forEach(s => {
      const exs = (s.exercises||[]).filter(e=>e.n).map(e=>`${e.n} ${e.kg||0}x${e.r||'?'}`).join('; ');
      L.push(`${s.date}|${s.type}|${(s.muscles||[]).join(',')}${exs?'|'+exs:''}`);
    });

    // REVIEWS
    L.push('', `== REVIEWS (${(D.photos||[]).length}) ==`);
    (D.photos||[]).forEach(p => L.push(`${p.date}|${p.waist_cm||'?'}cm|${p.weight_kg||'?'}kg|${(p.assessment||'').replace(/\n/g,' ').slice(0,90)}`));

    // BIO
    const bs = [...(bios||[])].filter(b=>b&&b.date).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    L.push('', `== BIO (${bs.length}) ==`);
    bs.forEach(b => {
      const kv = Object.entries(b).filter(([k,v]) => v!=null && v!=='' && !['id','created_at'].includes(k)).map(([k,v])=>`${k}:${v}`).join(' ');
      L.push(kv);
    });

    // PROTOCOLOS
    L.push('', '== PROTOCOLOS ==', protoInfo);

    return L.join('\n');
  }, [D, sessions, bios, protoInfo]);

  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false), 2000); };

  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>EXPORTAR TODO</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 10px'}}>Volcado completo y condensado de la app. Pégaselo al chat para auditar datos y funcionamiento. {text.length.toLocaleString('es-ES')} caracteres.</p>
      <textarea readOnly value={text}
        style={{width:'100%',minHeight:200,fontSize:10,padding:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',color:'var(--tx)',boxSizing:'border-box',fontFamily:"'DM Mono',monospace",lineHeight:1.5}}/>
      <button onClick={copy} style={{width:'100%',marginTop:10,background:'var(--ac)',border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#111',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>{copied ? '✓ COPIADO' : '⎘ COPIAR TODO'}</button>
    </DModal>
  );
}

function DExportModal({ sessions, onClose }) {
  const [weeks, setWeeks] = useState(4);
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - weeks * 7);
    const cs = cutoff.toLocaleDateString('en-CA');
    const gym = (sessions || [])
      .filter(s => s && s.date >= cs && s.type === 'gym')
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    if (!gym.length) return `Sin sesiones de gym en las últimas ${weeks} semanas.`;
    const lines = [`ENTRENOS GYM · últimas ${weeks} semanas · ${gym.length} sesiones`, ''];
    gym.forEach(s => {
      lines.push(`## ${s.date}${s.muscles && s.muscles.length ? ' · ' + s.muscles.filter(m=>m!=='Cardio').join(', ') : ''}`);
      const exs = (s.exercises || []).filter(e => e.n).map(e => `${e.n} ${e.kg || 0}x${e.r || '?'}`);
      if (exs.length) lines.push(exs.join(' · '));
      if (s.notes) lines.push(`Notas: ${String(s.notes).slice(0, 300)}`);
      lines.push('');
    });
    return lines.join('\n');
  }, [sessions, weeks]);
  const copy = () => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 4px'}}>EXPORTAR ENTRENOS</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 12px'}}>Resumen de tus sesiones de gym para pegárselo al chat y generar un nuevo protocolo.</p>
      <div style={{display:'flex',gap:6,marginBottom:12}}>
        {[2,4,8].map(w => (
          <button key={w} onClick={()=>setWeeks(w)} style={{flex:1,fontSize:11,padding:'8px 0',cursor:'pointer',fontFamily:"'DM Mono',monospace",background:weeks===w?'rgba(232,255,71,0.1)':'transparent',border:weeks===w?'1px solid var(--ac)':'1px solid var(--bd2)',color:weeks===w?'var(--ac)':'var(--mu3)'}}>{w} sem</button>
        ))}
      </div>
      <textarea readOnly value={text}
        style={{width:'100%',minHeight:180,fontSize:11,padding:10,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.12)',color:'var(--tx)',boxSizing:'border-box',fontFamily:"'DM Mono',monospace",lineHeight:1.5}}/>
      <button onClick={copy} style={{width:'100%',marginTop:10,background:'var(--ac)',border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#111',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>{copied ? '✓ COPIADO' : '⎘ COPIAR TODO'}</button>
    </DModal>
  );
}
const DField=({label,value,onChange,placeholder,type='text'})=>(
  <div style={{flex:1,marginBottom:10}}>
    <label style={{fontSize:11,opacity:.6}}>{label}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:'100%',fontSize:16,padding:8,marginTop:4,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
  </div>
);
const dTpl={background:'var(--sf)',border:'1px solid var(--bd2)',padding:'10px 12px',textAlign:'left',color:'inherit',cursor:'pointer',height:64,overflow:'hidden',boxSizing:'border-box',maxWidth:'100%',minWidth:0};
const dRow={display:'flex',alignItems:'center',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'};
const dDel={background:'none',border:'none',color:'#e24b4a',fontSize:20,cursor:'pointer',padding:'6px 10px'};
const dQty={background:'rgba(255,255,255,0.06)',border:'1px solid var(--bd2)',color:'inherit',width:38,height:38,fontSize:18,cursor:'pointer',lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center'};
const dMini={background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',padding:'9px 14px',fontSize:11,letterSpacing:1,color:'inherit',cursor:'pointer',fontFamily:"'DM Mono',monospace"};
const dPrimary={flex:1,background:TEAL,border:'none',padding:'12px 14px',fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',color:'#06241b',cursor:'pointer',fontFamily:"'DM Mono',monospace"};

// ── App root ──────────────────────────────────────────────────
export default function App() {
  const [panel, setPanel]           = useState(() => loadUI('panel','dashboard'));
  const [focusDate, setFocusDate]   = useState(null);
  const [showMigrate, setShowMigrate] = useState(false);
  const [dashMode, setDashMode] = useState(() => loadUI('dashMode','entrenos'));
  const data = useTrainingData();
  const dietData = useNutritionData();
  useEffect(() => { saveUI('panel', panel); }, [panel]);
  useEffect(() => { saveUI('dashMode', dashMode); }, [dashMode]);

  const handleDayClick = date => { setFocusDate(date); setPanel('diario'); };
  const goToPanel = p => { setPanel(p); if (p!=='diario') setFocusDate(null); };

  // Show migrate banner only if no sessions loaded yet
  const needsMigration = data.loaded && data.sessions.length === 0;

  if (!data.loaded) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'var(--mu)', fontFamily:"'DM Mono',monospace", fontSize:12, letterSpacing:2 }}>
      CARGANDO<span className="dot">.</span><span className="dot">.</span><span className="dot">.</span>
    </div>
  );

  return (
    <div className="app">
      <nav className="sb">
        <div className="sb-logo">
          <div className="sb-title">TRAINING<br/>LOG</div>
          <div className="sb-sub">E. Santana · 2026</div>
        </div>
        {/* Desktop sidebar */}
        <div className="sb-desktop">
          {NAV.map((n,i) => (
            <div key={i} className={`ni${panel===PANELS[i]?' active':''}`} onClick={() => goToPanel(PANELS[i])}>
              <span style={{fontSize:14,width:16,textAlign:'center'}}>{n.icon}</span>
              <span>{n.lbl}</span>
            </div>
          ))}
        </div>
        {/* Mobile bottom nav */}
        <div className="sb-mobile">
          {/* Left: Dashboard, PRs */}
          <div className={`ni-mob${panel==='dashboard'?' active':''}`} onClick={() => goToPanel('dashboard')}>
            <span className="ni-mob-icon">◈</span>
            <span className="ni-mob-lbl">Dashboard</span>
          </div>
          <div className={`ni-mob${panel==='prs'?' active':''}`} onClick={() => goToPanel('prs')}>
            <span className="ni-mob-icon">★</span>
            <span className="ni-mob-lbl">Stats</span>
          </div>
          {/* Center: Entreno (main button, no label) */}
          <div className="ni-mob-center" onClick={() => goToPanel('entreno')}>
            <div className={`ni-mob-circle${panel==='entreno'?' active':''}`}>
              <span style={{fontSize:20}}>⚡</span>
            </div>
          </div>
          {/* Right: Bio, Diario */}
          <div className={`ni-mob${panel==='bio'?' active':''}`} onClick={() => goToPanel('bio')}>
            <span className="ni-mob-icon">◉</span>
            <span className="ni-mob-lbl">Bio</span>
          </div>
          <div className={`ni-mob${panel==='diario'?' active':''}`} onClick={() => goToPanel('diario')}>
            <span className="ni-mob-icon">✎</span>
            <span className="ni-mob-lbl">Diario</span>
          </div>
        </div>
      </nav>
      <main className="main">
        {needsMigration && <MigrateBanner onDone={data.load}/>}
        {data.error && <div style={{fontSize:10,color:'var(--ac2)',marginBottom:16,padding:'8px 12px',border:'1px solid rgba(255,71,71,.2)'}}>⚠ Error conectando con Supabase: {data.error}</div>}

        {panel==='dashboard' && <>
          <div style={{height:2,background:dashMode==='dieta'?'#1d9e75':'var(--ac)',margin:'-8px 0 14px',transition:'background .3s'}}/>
          <div className="diary-tabs" style={{marginBottom:20,display:'flex',alignItems:'center'}}>
            <div className={`diary-tab${dashMode==='entrenos'?' active':''}`} onClick={()=>setDashMode('entrenos')}>Entrenos</div>
            <div className={`diary-tab${dashMode==='dieta'?' active':''}`} onClick={()=>setDashMode('dieta')} style={dashMode==='dieta'?{color:'#1d9e75',borderColor:'#1d9e75'}:{}}>Dieta</div>
            {dashMode==='dieta' && (()=>{ const st = calcStreak(dietData?.entries||[], dietData?.freeDays||[]); return (
              <span style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5,color:'#ef9f27',fontSize:10,letterSpacing:1.5,fontFamily:"'DM Mono',monospace"}}>◆ {st} {st===1?'DÍA':'DÍAS'}</span>
            ); })()}
          </div>
          {dashMode==='entrenos' && <PulsoCard sessions={data.sessions} dietData={dietData}/>}
          <Dashboard sessions={data.sessions} onDayClick={handleDayClick} mode={dashMode} dietData={dietData}/>
        </>}
        {panel==='prs'       && <PRs sessions={data.sessions} dietData={dietData}/>}
        {panel==='bio'       && <Biometria bios={data.bios} addBio={data.addBio}/>}
        {panel==='diario'    && <Diario diary={data.diary} raw={data.raw} sessions={data.sessions} focusDate={focusDate} onClearFocus={()=>setFocusDate(null)} onDelete={data.deleteSession} onDeleteDiary={data.deleteDiary} onDeleteRaw={data.deleteRaw}/>}
        {panel==='entreno'   && <EntrenoHub dietData={dietData} sessions={data.sessions} bios={data.bios} onSessionComplete={data.load} onSave={async (s,d,r,b) => { if(b){await data.addBio(b);}else{if(s)await data.addSession(s);if(d)await data.addDiary(d);if(r)await data.addRaw(r);} await data.load(); }}/>}
      </main>
    </div>
  );
}
