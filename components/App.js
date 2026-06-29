'use client';
import { useState, useEffect } from 'react';
import { useTrainingData } from '../lib/useTrainingData';
import { fmtDate, fmtShort, getIntensity, BIO_FIELDS, typeColor, isCardioType } from '../lib/helpers';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Entrenador from './Entrenador';
import NuevaSesion from './NuevaSesion';
import { useNutritionData, dayTotals, dayStatus, calcStreak } from '../lib/useNutritionData';

const PANELS = ['dashboard','prs','bio','diario','entreno'];
const NAV = [
  { icon:'◈', lbl:'Dashboard' },
  { icon:'★', lbl:'PRs' },
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

  const swipeRef = useState({x:0})[0];
  const onTouchStart = e => { swipeRef.x = e.touches[0].clientX; };
  const onTouchEnd   = e => { const dx = swipeRef.x - e.changedTouches[0].clientX; if (Math.abs(dx)>40) goMonth(dx>0?1:-1); };

  // ====== MODO DIETA ======
  if (mode === 'dieta') {
    return <DietaDashboard calYear={calYear} calMonth={calMonth} calDays={calDays}
      calTitle={calTitle} goMonth={goMonth} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      D={dietData} />;
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

      <div className="cal" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{marginBottom:20}}>
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
function PRs({ sessions }) {
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
function EntrenoHub({ onSessionComplete, onSave }) {
  const [view, setView] = useState('menu');

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
      <div className="sl" style={{marginTop:0}}>Entreno</div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:28}}>
        <button onClick={() => setView('gymfire')} style={{width:'100%',padding:'20px 20px',background:'rgba(232,255,71,0.06)',border:'1px solid rgba(232,255,71,0.3)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16}}>
          <span style={{fontSize:28}}>⚡</span>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,color:'var(--ac)'}}>PROTOCOLO DE ENTRENAMIENTO</div>
            <div style={{fontSize:9,color:'var(--mu)',letterSpacing:2,marginTop:3}}>GYMFIRE · SESIÓN GUIADA CON TIMER Y LOG</div>
          </div>
        </button>
        <button onClick={() => setView('nueva')} style={{width:'100%',padding:'20px 20px',background:'var(--sf)',border:'1px solid var(--bd2)',color:'var(--tx)',fontFamily:"'DM Mono',monospace",cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:16}}>
          <span style={{fontSize:28}}>＋</span>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:2,color:'var(--mu3)'}}>AÑADIR SESIÓN</div>
            <div style={{fontSize:9,color:'var(--mu)',letterSpacing:2,marginTop:3}}>TEXTO · IMAGEN · GARMIN · BÁSCULA</div>
          </div>
        </button>

      </div>
    </div>
  );
}

// ── DietaDashboard (modo dieta, acento teal) ──────────────────
const TEAL = '#1d9e75';
const TIER_COLOR = { verde:'#1d9e75', goloso:'#ef9f27', pecado:'#e24b4a' };
const ST_COLOR = { verde:'#1d9e75', ambar:'#ef9f27', rojo:'#e24b4a', none:'rgba(255,255,255,0.12)' };
const fmtN = n => Math.round(n).toLocaleString('es-ES');
const TODAY_STR = () => new Date().toISOString().slice(0,10);

function DietaDashboard({ calYear, calMonth, calDays, calTitle, goMonth, onTouchStart, onTouchEnd, D }) {
  const [sel, setSel] = useState(TODAY_STR());
  const [textOpen, setTextOpen] = useState(false);
  const [foodText, setFoodText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  if (!D || D.loading) return <div className="empty">Cargando dieta…</div>;

  const kcalTarget = D.target.kcal_target || 2800;
  const protTarget = D.target.protein_target || 160;
  const totals = dayTotals(D.entries, sel);
  const streak = calcStreak(D.entries);
  const kcalPct = Math.min(100,(totals.kcal/kcalTarget)*100);
  const protPct = Math.min(100,(totals.protein/protTarget)*100);
  const kcalLeft = Math.max(0,kcalTarget-totals.kcal);
  const R1=50,R2=36,C1=2*Math.PI*R1,C2=2*Math.PI*R2;
  const calMonthStr = String(calMonth).padStart(2,'0');

  const addTpl = t => D.addEntry({date:sel,meal:t.meal,name:t.name,kcal:t.kcal,protein:t.protein,source:'plantilla'});

  const parseFood = async () => {
    if(!foodText.trim())return; setAiBusy(true);
    try{
      const r=await fetch('/api/nutrition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:foodText})});
      const data=await r.json();
      if(data.items&&data.items.length)setAiPreview(data);
    }catch(e){} finally{setAiBusy(false);}
  };
  const confirmAi = async () => {
    if(!aiPreview?.items)return;
    await D.addEntriesBatch(aiPreview.items.map(i=>({...i,date:sel,source:'texto'})));
    setAiPreview(null);setFoodText('');setTextOpen(false);
  };

  const lastPhoto = D.photos[0];
  const daysSince = lastPhoto ? Math.floor((Date.now()-new Date(lastPhoto.date).getTime())/86400000) : 99;

  return (
    <div>
      {/* anillo + racha */}
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
        <span style={{display:'flex',alignItems:'center',gap:6,background:'rgba(239,159,39,0.12)',color:'#ef9f27',padding:'5px 12px',borderRadius:20,fontSize:13,fontFamily:"'DM Mono',monospace"}}>🔥 {streak} {streak===1?'día':'días'}</span>
      </div>
      <div style={{background:'rgba(29,158,117,0.06)',border:'1px solid rgba(29,158,117,0.25)',borderRadius:14,padding:16,marginBottom:14,display:'flex',alignItems:'center',gap:16}}>
        <div style={{position:'relative',width:108,height:108,flexShrink:0}}>
          <svg viewBox="0 0 120 120" width="108" height="108">
            <circle cx="60" cy="60" r={R1} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11"/>
            <circle cx="60" cy="60" r={R1} fill="none" stroke="#378add" strokeWidth="11" strokeLinecap="round" strokeDasharray={C1} strokeDashoffset={C1*(1-kcalPct/100)} transform="rotate(-90 60 60)"/>
            <circle cx="60" cy="60" r={R2} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11"/>
            <circle cx="60" cy="60" r={R2} fill="none" stroke={TEAL} strokeWidth="11" strokeLinecap="round" strokeDasharray={C2} strokeDashoffset={C2*(1-protPct/100)} transform="rotate(-90 60 60)"/>
          </svg>
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
            <span style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{fmtN(totals.kcal)}</span>
            <span style={{fontSize:10,opacity:.5}}>de {fmtN(kcalTarget)}</span>
          </div>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',gap:11}}>
          <DBar label="Calorías" color="#378add" cur={totals.kcal} max={kcalTarget} right={`${fmtN(kcalLeft)} rest.`}/>
          <DBar label="Proteína" color={TEAL} cur={totals.protein} max={protTarget} right={`${Math.round(totals.protein)}/${protTarget} g`}/>
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
        <DLg c={TEAL} t="objetivo"/><DLg c="#ef9f27" t="cerca"/><DLg c="#e24b4a" t="lejos"/>
      </div>
      <div className="cal" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{marginBottom:20}}>
        {['L','M','X','J','V','S','D'].map(d=><div key={d} className="ch">{d}</div>)}
        {calDays.map((cell,i)=>{
          if(!cell)return <div key={i} style={{aspectRatio:'1',background:'var(--sf)',border:'1px solid var(--bd)'}}/>;
          const {d}=cell;
          const ds=`${calYear}-${calMonthStr}-${String(d).padStart(2,'0')}`;
          const t=dayTotals(D.entries,ds);
          const st=dayStatus(t.kcal,kcalTarget);
          const isSel=ds===sel;
          return (
            <button key={d} onClick={()=>setSel(ds)}
              style={{aspectRatio:'1',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:3,background:isSel?'rgba(29,158,117,0.15)':'var(--sf)',border:isSel?`1px solid ${TEAL}`:'1px solid var(--bd)',cursor:'pointer',padding:0,width:'100%'}}>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:11,opacity:st==='none'?.3:.85,color:isSel?TEAL:'var(--tx)'}}>{String(d).padStart(2,'0')}</span>
              <span style={{width:6,height:6,borderRadius:'50%',background:ST_COLOR[st]}}/>
            </button>
          );
        })}
      </div>

      {/* Platos de un toque */}
      <div className="sl">Añadir · {sel===TODAY_STR()?'hoy':sel}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
        {D.templates.map(t=>(
          <button key={t.id} onClick={()=>addTpl(t)} style={dTpl}>
            <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:3}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:TIER_COLOR[t.tier]||'#888',flexShrink:0}}/>
              <span style={{fontSize:13,fontWeight:500}}>{t.name}</span>
            </div>
            <span style={{fontSize:11,opacity:.55}}>{t.kcal} kcal · {t.protein} g</span>
          </button>
        ))}
        <button onClick={()=>setTextOpen(true)} style={{...dTpl,borderColor:TEAL,color:TEAL}}>
          <div style={{display:'flex',alignItems:'center',gap:7}}><span style={{fontSize:16}}>✎</span><span style={{fontSize:13,fontWeight:500}}>Otra (texto)</span></div>
        </button>
      </div>

      {/* lista del día */}
      {totals.items.length>0 && (
        <div style={{marginBottom:14}}>
          {totals.items.map(it=>(
            <div key={it.id} style={dRow}>
              <span style={{flex:1,fontSize:13}}>{it.name}</span>
              <span style={{fontSize:12,opacity:.6,marginRight:10}}>{it.kcal} · {Math.round(it.protein)}g</span>
              <button onClick={()=>D.deleteEntry(it.id)} style={dDel}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Album de progreso */}
      <div className="sl">Progreso · foto y cintura</div>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',padding:12,marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'flex-end',marginBottom:8}}>
          <button onClick={()=>setPhotoOpen(true)} style={dMini}>+ añadir</button>
        </div>
        {daysSince>=14 && <div style={{fontSize:11,color:TEAL,marginBottom:10}}>⏰ Toca foto quincenal {lastPhoto?`(última hace ${daysSince} días)`:'(primera)'}</div>}
        {D.photos.length===0 && <p style={{fontSize:11,opacity:.4,margin:0}}>Aún sin fotos. Añade la primera para empezar tu tira de progreso.</p>}
        <div style={{display:'flex',gap:8,overflowX:'auto'}}>
          {D.photos.map(p=>(
            <div key={p.id} style={{minWidth:90,flexShrink:0}}>
              {p.photo_url
                ? <img src={p.photo_url} alt={p.date} style={{width:90,height:120,objectFit:'cover',border:'1px solid rgba(255,255,255,0.1)'}}/>
                : <div style={{width:90,height:120,background:'rgba(255,255,255,0.05)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,opacity:.4}}>sin foto</div>}
              <div style={{fontSize:9,opacity:.6,marginTop:4}}>{p.date}{p.waist_cm?` · ${p.waist_cm}cm`:''}</div>
            </div>
          ))}
        </div>
      </div>

      {textOpen && (
        <DModal onClose={()=>{setTextOpen(false);setAiPreview(null);}}>
          <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 10px'}}>AÑADIR COMIDA</h3>
          <textarea value={foodText} onChange={e=>setFoodText(e.target.value)} placeholder="Ej: 200g de salmón con una taza de arroz y ensalada"
            style={{width:'100%',minHeight:80,fontSize:16,padding:10,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
          {!aiPreview && <button onClick={parseFood} disabled={aiBusy} style={{...dPrimary,marginTop:10,opacity:aiBusy?.5:1}}>{aiBusy?'Analizando…':'Analizar con IA'}</button>}
          {aiPreview && (
            <div style={{marginTop:12}}>
              {aiPreview.items.map((i,k)=>(<div key={k} style={dRow}><span style={{flex:1,fontSize:13}}>{i.name}</span><span style={{fontSize:12,opacity:.6}}>{i.kcal} · {Math.round(i.protein)}g</span></div>))}
              <div style={{fontSize:12,opacity:.7,margin:'8px 0',textAlign:'right'}}>Total: {fmtN(aiPreview.total_kcal)} kcal · {Math.round(aiPreview.total_protein)} g</div>
              {aiPreview.note && <div style={{fontSize:11,color:TEAL,marginBottom:8}}>{aiPreview.note}</div>}
              <div style={{display:'flex',gap:8}}><button onClick={confirmAi} style={dPrimary}>Añadir al día</button><button onClick={()=>setAiPreview(null)} style={dMini}>Reintentar</button></div>
            </div>
          )}
        </DModal>
      )}
      {photoOpen && <DPhotoModal onClose={()=>setPhotoOpen(false)} onSave={async(p)=>{await D.addPhoto({...p,date:sel});setPhotoOpen(false);}}/>}
    </div>
  );
}

function DBar({label,color,cur,max,right}) {
  const pct=Math.min(100,(cur/max)*100);
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}><span style={{color}}>{label}</span><span style={{opacity:.6}}>{right}</span></div>
      <div style={{height:6,background:'rgba(255,255,255,0.08)',borderRadius:3,overflow:'hidden'}}><div style={{width:`${pct}%`,height:'100%',background:color,borderRadius:3}}/></div>
    </div>
  );
}
const DLg=({c,t})=><span style={{display:'flex',alignItems:'center',gap:3}}><span style={{width:7,height:7,borderRadius:'50%',background:c}}/>{t}</span>;
function DModal({children,onClose}){return <div onClick={onClose} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:16}}><div onClick={e=>e.stopPropagation()} style={{background:'#1a1a19',border:'1px solid rgba(255,255,255,0.12)',padding:18,maxWidth:360,width:'100%'}}>{children}</div></div>;}
function DPhotoModal({onClose,onSave}){
  const [waist,setWaist]=useState('');const [weight,setWeight]=useState('');const [assessment,setAssessment]=useState('');const [url,setUrl]=useState('');
  return (
    <DModal onClose={onClose}>
      <h3 style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,margin:'0 0 10px'}}>FOTO DE PROGRESO</h3>
      <p style={{fontSize:11,opacity:.55,margin:'0 0 12px'}}>Sube la foto a Supabase Storage (bucket 'progreso') y pega su URL. La valoración la generas en el chat y la pegas abajo.</p>
      <DField label="URL foto" value={url} onChange={setUrl} placeholder="https://…/progreso/..."/>
      <div style={{display:'flex',gap:8}}>
        <DField label="Cintura (cm)" value={waist} onChange={setWaist} placeholder="84" type="number"/>
        <DField label="Peso (kg)" value={weight} onChange={setWeight} placeholder="83.7" type="number"/>
      </div>
      <label style={{fontSize:11,opacity:.6}}>Valoración (texto del chat)</label>
      <textarea value={assessment} onChange={e=>setAssessment(e.target.value)} style={{width:'100%',minHeight:60,fontSize:16,padding:8,marginTop:4,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
      <button onClick={()=>onSave({photo_url:url||null,waist_cm:waist?Number(waist):null,weight_kg:weight?Number(weight):null,assessment:assessment||null})} style={{...dPrimary,marginTop:10}}>Guardar</button>
    </DModal>
  );
}
const DField=({label,value,onChange,placeholder,type='text'})=>(
  <div style={{flex:1,marginBottom:10}}>
    <label style={{fontSize:11,opacity:.6}}>{label}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:'100%',fontSize:16,padding:8,marginTop:4,background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.15)',color:'inherit',boxSizing:'border-box'}}/>
  </div>
);
const dTpl={background:'var(--sf)',border:'1px solid var(--bd2)',padding:11,textAlign:'left',color:'inherit',cursor:'pointer'};
const dRow={display:'flex',alignItems:'center',padding:'7px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'};
const dDel={background:'none',border:'none',color:'#e24b4a',fontSize:18,cursor:'pointer',padding:'0 4px'};
const dMini={background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',padding:'5px 10px',fontSize:11,color:'inherit',cursor:'pointer'};
const dPrimary={flex:1,background:TEAL,border:'none',padding:'10px 14px',fontSize:14,fontWeight:500,color:'#06241b',cursor:'pointer'};

// ── App root ──────────────────────────────────────────────────
export default function App() {
  const [panel, setPanel]           = useState('dashboard');
  const [focusDate, setFocusDate]   = useState(null);
  const [showMigrate, setShowMigrate] = useState(false);
  const [dashMode, setDashMode] = useState('entrenos');
  const data = useTrainingData();
  const dietData = useNutritionData();

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
            <span className="ni-mob-lbl">PRs</span>
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
          <div className="diary-tabs" style={{marginBottom:20}}>
            <div className={`diary-tab${dashMode==='entrenos'?' active':''}`} onClick={()=>setDashMode('entrenos')}>Entrenos</div>
            <div className={`diary-tab${dashMode==='dieta'?' active dieta-tab':''}`} onClick={()=>setDashMode('dieta')} style={dashMode==='dieta'?{color:'#1d9e75',borderColor:'#1d9e75'}:{}}>Dieta</div>
          </div>
          <Dashboard sessions={data.sessions} onDayClick={handleDayClick} mode={dashMode} dietData={dietData}/>
        </>}
        {panel==='prs'       && <PRs sessions={data.sessions}/>}
        {panel==='bio'       && <Biometria bios={data.bios} addBio={data.addBio}/>}
        {panel==='diario'    && <Diario diary={data.diary} raw={data.raw} sessions={data.sessions} focusDate={focusDate} onClearFocus={()=>setFocusDate(null)} onDelete={data.deleteSession} onDeleteDiary={data.deleteDiary} onDeleteRaw={data.deleteRaw}/>}
        {panel==='entreno'   && <EntrenoHub onSessionComplete={data.load} onSave={async (s,d,r,b) => { if(b){await data.addBio(b);}else{if(s)await data.addSession(s);if(d)await data.addDiary(d);if(r)await data.addRaw(r);} await data.load(); }}/>}
      </main>
    </div>
  );
}
