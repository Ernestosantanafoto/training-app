'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_PROTOCOL } from '../lib/protocol';
import { fmtDate } from '../lib/helpers';

const typeTag = { warmup:'INIT', superset:'SUPER', main:'PRINCIPAL', circuit:'CIRCUIT', core:'CORE' };

function generateLog(day, completed, realWeights, realReps, observations, elapsed, week) {
  const date = new Date().toLocaleDateString('es-ES', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const fmt = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  let log = `Semana ${week} · ${date} — ${day.name}\n- Duración: ${fmt(elapsed)}\n`;
  day.blocks.forEach((block, bi) => {
    if (block.type === 'warmup') return;
    let lines = '';
    block.exercises.forEach((ex, ei) => {
      const sets = ex.sets.map((set, si) => {
        const key = `${bi}-${ei}-${si}`;
        if (!completed[key]) return null;
        const w = realWeights[key] ? `${realWeights[key]}kg` : (set.weight ? `${set.weight}kg` : '');
        const r = realReps[key] ? `${realReps[key]}r` : (typeof set.reps === 'number' ? `${set.reps}r` : set.reps);
        return `✓ ${r}${w ? '×'+w : ''}`;
      }).filter(Boolean).join(' / ');
      if (sets) lines += `  - ${ex.name}: ${sets}\n`;
    });
    if (lines) { log += `- ${block.name.replace(/MÓDULO \d+ — /,'').replace('PROTOCOLO ','')}:\n${lines}`; }
  });
  if (observations.trim()) log += `\n📝 ${observations.trim()}\n`;
  return log;
}

const STORAGE_KEY = 'gymfire_active_session_v1';

function saveSessionState(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function loadSessionState() {
  try { const v = localStorage.getItem(STORAGE_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function clearSessionState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function Entrenador({ onSessionComplete }) {
  const [protocol, setProtocol]         = useState(DEFAULT_PROTOCOL);
  const [screen, setScreen]             = useState('home');
  const [activeDay, setActiveDay]       = useState(null);
  const [pendingDay, setPendingDay]     = useState(null);
  const [completed, setCompleted]       = useState({});
  const [realWeights, setRealWeights]   = useState({});
  const [realReps, setRealReps]         = useState({});
  const [observations, setObservations] = useState('');
  const [elapsed, setElapsed]           = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [restTimer, setRestTimer]       = useState(null);
  const [restCount, setRestCount]       = useState(0);
  const [restLabel, setRestLabel]       = useState('DESCANSO');
  const [sessionLog, setSessionLog]     = useState('');
  const [copied, setCopied]             = useState(false);
  const [activeBlock, setActiveBlock]   = useState(0);
  const [dbStatus, setDbStatus]         = useState('idle');
  const [recentLogs, setRecentLogs]     = useState([]);
  const [completedDays, setCompletedDays] = useState([]);
  const [pulse, setPulse]               = useState(false);
  const [pendingSession, setPendingSession] = useState(null);
  const [pendingDiary, setPendingDiary]     = useState(null);
  const [aiStatus, setAiStatus]             = useState('idle');
  const [restored, setRestored]             = useState(false);
  const [openNotes, setOpenNotes]           = useState({});
  const timerRef = useRef(null);
  const restRef  = useRef(null);

  // ── Restore active session on mount (survives tab switches and page reloads) ──
  useEffect(() => {
    const saved = loadSessionState();
    if (saved && saved.activeDay && (saved.screen === 'session' || saved.screen === 'confirm')) {
      setActiveDay(saved.activeDay);
      setPendingDay(saved.pendingDay);
      setCompleted(saved.completed || {});
      setRealWeights(saved.realWeights || {});
      setRealReps(saved.realReps || {});
      setObservations(saved.observations || '');
      setActiveBlock(saved.activeBlock || 0);
      setProtocol(saved.protocol || DEFAULT_PROTOCOL);
      // Recompute elapsed time based on real wall-clock time passed
      if (saved.sessionStartedAt) {
        const secondsPassed = Math.floor((Date.now() - saved.sessionStartedAt) / 1000);
        setElapsed(secondsPassed);
        setSessionStartedAt(saved.sessionStartedAt);
      }
      setScreen(saved.screen);
    }
    setRestored(true);
  }, []);

  // ── Persist active session state on every relevant change ──
  useEffect(() => {
    if (!restored) return; // don't overwrite saved state before restore finishes
    if (screen === 'session' || screen === 'confirm') {
      saveSessionState({
        screen, activeDay, pendingDay, completed, realWeights, realReps,
        observations, activeBlock, protocol, sessionStartedAt,
      });
    } else if (screen === 'home') {
      clearSessionState();
    }
  }, [screen, activeDay, pendingDay, completed, realWeights, realReps, observations, activeBlock, restored]);

  useEffect(() => { loadProtocol(); loadRecentLogs(); }, []);
  useEffect(() => { const id = setInterval(() => setPulse(p => !p), 800); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (screen === 'session') timerRef.current = setInterval(() => {
      setElapsed(e => e+1);
    }, 1000);
    else clearInterval(timerRef.current);
    return () => clearInterval(timerRef.current);
  }, [screen]);

  const loadProtocol = async () => {
    const { data } = await supabase.from('protocols').select('*').order('created_at', { ascending: false }).limit(1).single();
    if (data) setProtocol(data.protocol_data);
  };
  const loadRecentLogs = async () => {
    const { data } = await supabase.from('session_logs').select('id,day_name,week,duration,completed_sets,created_at').order('created_at', { ascending: false }).limit(6);
    if (data) setRecentLogs(data);
  };

  const fmt = s => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}`;
  const totalSets = day => day.blocks.reduce((a,b) => a + b.exercises.reduce((c,e) => c + e.sets.length, 0), 0);
  const doneSets  = () => Object.values(completed).filter(Boolean).length;

  const startRest = (secs, label = 'DESCANSO') => {
    if (restRef.current) clearInterval(restRef.current);
    setRestLabel(label); setRestCount(secs); setRestTimer(secs);
    restRef.current = setInterval(() => setRestCount(c => {
      if (c <= 1) { clearInterval(restRef.current); setRestTimer(null); return 0; }
      return c - 1;
    }), 1000);
  };
  const stopRest = () => { clearInterval(restRef.current); setRestTimer(null); };

  const handleStart = () => {
    setActiveDay(pendingDay); setCompleted({}); setRealWeights({}); setRealReps({});
    setObservations(''); setElapsed(0); setSessionStartedAt(Date.now()); setActiveBlock(0); setScreen('session');
  };
  const handleExit = () => {
    clearInterval(timerRef.current); clearInterval(restRef.current); setRestTimer(null);
    clearSessionState();
    setScreen('home'); setActiveDay(null); setPendingDay(null);
  };

  const handleFinish = async () => {
    clearInterval(timerRef.current); clearInterval(restRef.current); setRestTimer(null);
    clearSessionState();
    const log = generateLog(activeDay, completed, realWeights, realReps, observations, elapsed, protocol.week);
    setSessionLog(log);
    const done = doneSets();
    const total = totalSets(activeDay);

    // Build exercises data
    const exercises = [];
    activeDay.blocks.forEach((block, bi) => {
      if (block.type === 'warmup') return;
      block.exercises.forEach((ex, ei) => {
        const sets = ex.sets.map((set, si) => {
          const key = `${bi}-${ei}-${si}`;
          if (!completed[key]) return null;
          return { setNum: si+1, targetReps: set.reps, targetWeight: set.weight,
            realWeight: realWeights[key] ? parseFloat(realWeights[key]) : null,
            realReps: realReps[key] ? parseInt(realReps[key]) : null };
        }).filter(Boolean);
        if (sets.length > 0) exercises.push({ block: block.name, name: ex.name, sets });
      });
    });

    // Always save raw log to session_logs (GYMFIRE table) — this is the permanent workout record
    setDbStatus('saving');
    const { error: le } = await supabase.from('session_logs').insert({
      week: protocol.week, day_id: activeDay.id, day_name: activeDay.name,
      duration: elapsed, completed_sets: done, total_sets: total,
      log_text: log, exercises_data: exercises, session_date: new Date().toISOString(),
    });
    if (!completedDays.includes(activeDay.id)) setCompletedDays(prev => [...prev, activeDay.id]);
    setDbStatus(le ? 'error' : 'saved');
    setTimeout(() => setDbStatus('idle'), 2000);
    // NOTE: onSessionComplete is NOT called here — it would unmount this component
    // (EntrenoHub switches view back to menu) before we can show the review screen
    // and save to training_sessions/training_diary. It's called later, after the
    // user confirms or skips, in confirmAddToRegistry / skipAddToRegistry.

    // Build muscles guess
    const muscles = [...new Set(activeDay.blocks.flatMap(b => b.exercises.map(e => {
      const n = e.name.toLowerCase();
      if (n.includes('pierna') || n.includes('cuádr') || n.includes('femoral') || n.includes('sentadilla')) return 'Piernas';
      if (n.includes('pecho') || n.includes('banca') || n.includes('press')) return 'Pecho';
      if (n.includes('espalda') || n.includes('polea') || n.includes('remo') || n.includes('tracción') || n.includes('dominad')) return 'Espalda';
      if (n.includes('bíceps') || n.includes('curl')) return 'Bíceps';
      if (n.includes('tríceps') || n.includes('fondos')) return 'Tríceps';
      if (n.includes('hombro') || n.includes('elevación')) return 'Hombros';
      return null;
    }).filter(Boolean)))];

    const exercisesForSession = exercises.map(e => ({
      n: e.name,
      kg: e.sets[e.sets.length-1]?.realWeight ?? e.sets[0]?.targetWeight ?? 0,
      s: e.sets.length,
      r: e.sets[e.sets.length-1]?.realReps ?? e.sets[0]?.targetReps ?? 0,
    }));

    const today = new Date().toLocaleDateString('en-CA'); // fecha LOCAL, no UTC
    setPendingSession({
      id: 'gf_' + Date.now(), date: today, type: 'gym',
      muscles, exercises: exercisesForSession,
      notes: `GYMFIRE S${protocol.week}·${activeDay.name} · ${fmt(elapsed)} · ${done}/${total} series`,
    });

    // Call Groq for a summary/diary entry, same flow as external sessions
    setAiStatus('loading');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ type: 'diary', text: log }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPendingDiary(data.result);
      setAiStatus('done');
    } catch (e) {
      setAiStatus('error');
    }

    setScreen('review');
  };

  const confirmAddToRegistry = async () => {
    if (!pendingSession) return;
    setDbStatus('saving');
    // Si ya hay sesion de gym HOY (p.ej. dos dias del protocolo seguidos),
    // se FUSIONA con ella: union de musculos, suma de ejercicios, notas encadenadas.
    const { data: existing } = await supabase.from('training_sessions')
      .select('*').eq('date', pendingSession.date).eq('type', 'gym').limit(1);
    if (existing && existing.length) {
      const prev = existing[0];
      await supabase.from('training_sessions').update({
        muscles: [...new Set([...(prev.muscles || []), ...(pendingSession.muscles || [])])],
        exercises: [...(prev.exercises || []), ...(pendingSession.exercises || [])],
        notes: [prev.notes, pendingSession.notes].filter(Boolean).join(' + '),
      }).eq('id', prev.id);
    } else {
      await supabase.from('training_sessions').insert(pendingSession);
    }
    if (pendingDiary) {
      await supabase.from('training_diary').insert({
        id: 'gfd_' + Date.now(), date: pendingSession.date, type: 'gym', text: pendingDiary,
      });
    }
    await supabase.from('training_raw').insert({
      id: 'gfr_' + Date.now(), date: pendingSession.date, type: 'gym', text: sessionLog,
    });
    setDbStatus('saved');
    setScreen('log');
    // Notify parent to refresh data AFTER we've already moved to the log screen.
    // We don't navigate away ourselves — onSessionComplete here only refreshes
    // data in the background; EntrenoHub no longer switches view from this callback.
    if (onSessionComplete) onSessionComplete();
  };

  const skipAddToRegistry = () => {
    setScreen('log');
  };

  const day = activeDay || pendingDay;
  const pct = activeDay ? Math.round((doneSets() / totalSets(activeDay)) * 100) : 0;

  // ── HOME ──────────────────────────────────────────────────────
  if (screen === 'home') return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 13, letterSpacing: 4, color: 'var(--mu)', marginBottom: 4 }}>
          SEMANA <span style={{ color: 'var(--ac)', fontSize: 20 }}>{protocol.week}</span>
          <span style={{ fontSize: 9, color: 'var(--mu)', marginLeft: 12 }}>{completedDays.length}/4 COMPLETADOS</span>
        </div>
        <div style={{ height: 2, background: 'var(--bd)', marginTop: 8 }}>
          <div style={{ height: '100%', width: `${(completedDays.length/4)*100}%`, background: 'var(--ac)', transition: 'width .5s' }}/>
        </div>
      </div>

      {protocol.days.map(d => {
        const isDone = completedDays.includes(d.id);
        return (
          <button key={d.id} onClick={() => { setPendingDay(d); setScreen('confirm'); }} style={{ width:'100%', background:'transparent', border:`1px solid ${isDone ? d.color+'44' : d.color+'33'}`, borderLeft:`3px solid ${d.color}`, padding:0, color:'#fff', textAlign:'left', cursor:'pointer', marginBottom:8, opacity: isDone ? .55 : 1, fontFamily:"'DM Mono',monospace" }}>
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:40, height:40, border:`1px solid ${d.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{isDone ? '✓' : d.emoji}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:8, letterSpacing:4, color:d.color, marginBottom:3 }}>PROTOCOLO {d.id}</div>
                <div style={{ fontSize:13, fontWeight:700, letterSpacing:.5 }}>{d.name}</div>
                <div style={{ fontSize:8, color:'var(--mu)', marginTop:2, letterSpacing:2 }}>{isDone ? 'COMPLETADO' : `${d.blocks.filter(b=>b.type!=='warmup').length} MÓDULOS · ${totalSets(d)} SERIES`}</div>
              </div>
              <div style={{ color: d.color, fontSize:14 }}>{isDone ? '●' : '▶'}</div>
            </div>
          </button>
        );
      })}

      {recentLogs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="sl">Últimas sesiones registradas</div>
          {recentLogs.map(log => (
            <div key={log.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--bd)', fontSize:10 }}>
              <span style={{ color:'var(--mu3)' }}>S{log.week} · {log.day_name}</span>
              <span style={{ color:'var(--mu)', letterSpacing:1 }}>{fmt(log.duration)} · {log.completed_sets} series</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop:20, border:'1px solid rgba(255,71,71,0.2)', borderLeft:'3px solid var(--ac2)', padding:'10px 14px', fontSize:9, color:'var(--ac2)', opacity:.6, letterSpacing:1.5, lineHeight:2 }}>
        ⚠ HOMBRO IZQ — HISTORIAL LUXACIÓN × 2<br/>
        ↑ SUBIR CARGA DONDE RPE &lt; 8 CADA SEMANA
      </div>
    </div>
  );

  // ── CONFIRM ───────────────────────────────────────────────────
  if (screen === 'confirm' && pendingDay) return (
    <div style={{ paddingBottom: 100, fontFamily:"'DM Mono',monospace" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize:8, letterSpacing:6, color: pendingDay.color, marginBottom:6 }}>SEMANA {protocol.week} · PROTOCOLO {pendingDay.id}</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:1 }}>{pendingDay.emoji} {pendingDay.name}</div>
        <div style={{ fontSize:9, color:'var(--mu)', marginTop:6, letterSpacing:3 }}>{totalSets(pendingDay)} SERIES · ~60 MIN</div>
      </div>
      {pendingDay.blocks.map((block, bi) => (
        <div key={bi} style={{ marginBottom:16 }}>
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8, paddingBottom:5, borderBottom:`1px solid ${pendingDay.color}22` }}>
            <span style={{ fontSize:7, letterSpacing:2, padding:'2px 6px', background:`${pendingDay.color}15`, border:`1px solid ${pendingDay.color}33`, color:pendingDay.color }}>{typeTag[block.type]||'MOD'}</span>
            <span style={{ fontSize:9, fontWeight:700, letterSpacing:2, color:'var(--mu)' }}>{block.name}</span>
          </div>
          {block.exercises.map((ex, ei) => (
            <div key={ei} style={{ marginBottom:6, background:'var(--sf)', border:`1px solid var(--bd)`, borderLeft:`2px solid ${pendingDay.color}33`, padding:'8px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, color: ex.name.includes('⚠️') ? '#FFD600' : 'var(--mu3)', marginBottom:5 }}>{ex.name}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {ex.sets.map((set, si) => (
                  <span key={si} style={{ fontSize:9, padding:'3px 8px', border:`1px solid ${pendingDay.color}33`, color:pendingDay.color, letterSpacing:1 }}>
                    S{si+1} · {typeof set.reps === 'number' ? `${set.reps}r` : set.reps}{set.weight ? ` · ${set.weight}kg` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
      <div style={{ position:'sticky', bottom:0, background:'var(--bg)', padding:'14px 0', borderTop:`1px solid ${pendingDay.color}22`, display:'flex', flexDirection:'column', gap:8 }}>
        <button onClick={handleStart} style={{ width:'100%', padding:'13px 0', background:pendingDay.color, border:'none', color:'#000', fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:11, letterSpacing:3, cursor:'pointer' }}>▶ INICIAR PROTOCOLO</button>
        <button onClick={handleExit} style={{ width:'100%', padding:'10px 0', background:'transparent', border:'1px solid var(--bd2)', color:'var(--mu)', fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, cursor:'pointer' }}>← VOLVER</button>
      </div>
    </div>
  );

  // ── SESSION ───────────────────────────────────────────────────
  if (screen === 'session' && activeDay) return (
    <div style={{ paddingBottom:120, fontFamily:"'DM Mono',monospace" }}>
      {restTimer !== null && (
        <div className="gf-rest-overlay" style={{ borderBottomColor: activeDay.color }}>
          <div style={{ fontSize:9, letterSpacing:4, color:activeDay.color, marginBottom:4 }}>{restLabel}</div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:48, color: restCount <= 30 ? 'var(--ac2)' : activeDay.color, letterSpacing:4, lineHeight:1 }}>{fmt(restCount)}</div>
          <button onClick={stopRest} style={{ marginTop:6, fontSize:9, letterSpacing:3, color:'var(--mu)', background:'transparent', border:'1px solid var(--bd2)', padding:'4px 18px', cursor:'pointer', fontFamily:'inherit' }}>SALTAR</button>
        </div>
      )}

      <div style={{ position:'sticky', top:0, zIndex:10, background:'var(--bg)', borderBottom:`1px solid ${activeDay.color}44`, padding:'12px 0 10px', backdropFilter:'blur(8px)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
          <div>
            <div style={{ fontSize:8, letterSpacing:4, color:activeDay.color, marginBottom:3 }}>S{protocol.week} · PROTOCOLO {activeDay.id}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:1 }}>{activeDay.name}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:activeDay.color, letterSpacing:4, lineHeight:1 }}>{fmt(elapsed)}</div>
            <div style={{ fontSize:9, color:'var(--mu)', letterSpacing:2 }}>{doneSets()}/{totalSets(activeDay)}</div>
          </div>
        </div>
        <div style={{ height:2, background:'var(--bd)', marginBottom:8 }}>
          <div className="gf-progress-bar" style={{ width:`${pct}%`, background:activeDay.color }}/>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <div style={{ fontSize:7, letterSpacing:2, color:'var(--mu)', marginRight:2 }}>DESC.</div>
          {[60,90,120].map(s => (
            <button key={s} onClick={() => startRest(s)} style={{ flex:1, padding:'6px 0', background:'transparent', border:`1px solid ${activeDay.color}33`, color:activeDay.color, fontSize:10, fontFamily:'inherit', letterSpacing:2, cursor:'pointer', fontWeight:700 }}>{s}s</button>
          ))}
          <div style={{ fontSize:8, color:`${activeDay.color}88`, letterSpacing:2, marginLeft:4 }}>{pct}%</div>
        </div>
      </div>

      <div style={{ paddingTop:16 }}>
        {activeDay.blocks.map((block, bi) => {
          const isActive = bi <= activeBlock;
          const isCurrent = bi === activeBlock;
          const isLast = bi === activeDay.blocks.length - 1;
          return (
            <div key={bi} id={`block-${bi}`} style={{ marginBottom:18, opacity: isActive ? 1 : .3, transition:'opacity .3s' }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${isCurrent ? activeDay.color+'44' : activeDay.color+'1a'}` }}>
                <span className="gf-type-tag" style={{ background:`${activeDay.color}15`, border:`1px solid ${activeDay.color}44`, color:activeDay.color }}>{typeTag[block.type]||'MOD'}</span>
                <span style={{ fontSize:9, fontWeight:700, letterSpacing:2, color: isCurrent ? 'var(--mu3)' : 'var(--mu)' }}>{block.name}</span>
              </div>
              {block.note && <div style={{ fontSize:8, color:'var(--mu)', marginBottom:7, letterSpacing:1.5 }}>{block.note}</div>}
              {block.exercises.map((ex, ei) => (
                <div key={ei} style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderLeft:`2px solid ${activeDay.color}33`, marginBottom:8 }}>
                  <div style={{ padding:'8px 12px 6px', borderBottom:'1px solid var(--bd)', display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ flex:1, minWidth:0, fontSize:11, fontWeight:700, color: ex.name.includes('⚠️') ? '#FFD600' : 'var(--mu3)' }}>{ex.name}</span>
                    {ex.note && (
                      <button onClick={() => setOpenNotes(p => ({...p, [`${bi}-${ei}`]: !p[`${bi}-${ei}`]}))}
                        style={{ background:'transparent', border:`1px solid ${openNotes[`${bi}-${ei}`] ? activeDay.color : 'var(--bd2)'}`, color: openNotes[`${bi}-${ei}`] ? activeDay.color : 'var(--mu)', fontSize:8, letterSpacing:1, padding:'4px 9px', cursor:'pointer', fontFamily:"'DM Mono',monospace", flexShrink:0 }}>
                        ⓘ CÓMO
                      </button>
                    )}
                  </div>
                  {ex.note && openNotes[`${bi}-${ei}`] && (
                    <div style={{ padding:'9px 12px', borderBottom:'1px solid var(--bd)', fontSize:10, lineHeight:1.75, color:'var(--mu3)', background:`${activeDay.color}06`, whiteSpace:'pre-wrap' }}>{ex.note}</div>
                  )}
                  {ex.sets.map((set, si) => {
                    const key = `${bi}-${ei}-${si}`;
                    const isDone = completed[key];
                    const hasCorr = realReps[key] || realWeights[key];
                    return (
                      <div key={si} className="gf-set-row" style={{ background: isDone ? `${activeDay.color}07` : 'transparent', borderBottom: si < ex.sets.length-1 ? '1px solid var(--bd)' : 'none' }}>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: (!isDone || hasCorr) ? 8 : 0 }}>
                            <span style={{ fontSize:8, color:'var(--mu)', minWidth:16 }}>S{si+1}</span>
                            <span style={{ fontSize:15, fontWeight:700, color: isDone && !hasCorr ? `${activeDay.color}66` : isDone ? 'var(--mu)' : 'var(--tx)', textDecoration: isDone && !hasCorr ? 'none' : isDone ? 'line-through' : 'none' }}>
                              {typeof set.reps === 'number' ? `${set.reps} reps` : set.reps}
                              {set.weight ? <span style={{ color: isDone && !hasCorr ? `${activeDay.color}88` : isDone ? 'var(--mu)' : activeDay.color, fontSize:13 }}> · {set.weight} kg</span> : ''}
                            </span>
                            {set.note && <span style={{ fontSize:8, color:'#FFD60077' }}>{set.note}</span>}
                          </div>
                          {(!isDone || hasCorr) && (
                            <div style={{ display:'flex', gap:8, paddingLeft:24 }}>
                              <div>
                                <div style={{ fontSize:7, color:'var(--mu)', letterSpacing:1, marginBottom:2 }}>REPS REALES</div>
                                <input type="number" inputMode="numeric" placeholder={typeof set.reps === 'number' ? `${set.reps}` : '—'}
                                  value={realReps[key]||''} onChange={e => setRealReps(p => ({...p,[key]:e.target.value}))}
                                  className="gf-input" style={{ borderColor: realReps[key] ? '#FFD60099' : '#ffffff11', color: realReps[key] ? '#FFD600' : 'var(--mu)' }}/>
                              </div>
                              {set.weight !== null && (
                                <div>
                                  <div style={{ fontSize:7, color:'var(--mu)', letterSpacing:1, marginBottom:2 }}>KG REALES</div>
                                  <input type="number" inputMode="decimal" placeholder={set.weight ? `${set.weight}` : '—'}
                                    value={realWeights[key]||''} onChange={e => setRealWeights(p => ({...p,[key]:e.target.value}))}
                                    className="gf-input" style={{ width:70, borderColor: realWeights[key] ? '#FFD60099' : '#ffffff11', color: realWeights[key] ? '#FFD600' : 'var(--mu)' }}/>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button onClick={() => setCompleted(p => ({...p,[key]:!p[key]}))}
                          className="gf-set-check"
                          style={{ background: isDone ? activeDay.color : 'transparent', borderColor: isDone ? activeDay.color : 'var(--bd2)', color: isDone ? '#000' : 'var(--mu)', boxShadow: isDone ? `0 0 12px ${activeDay.color}55` : 'none' }}>
                          {isDone ? '✓' : ''}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
              {isCurrent && !isLast && (
                <button onClick={() => { setActiveBlock(bi+1); startRest(120,'CAMBIO DE BLOQUE'); setTimeout(() => { document.getElementById(`block-${bi+1}`)?.scrollIntoView({behavior:'smooth'}); },100); }}
                  style={{ width:'100%', marginTop:8, padding:'11px 0', background:'transparent', border:`1px solid ${activeDay.color}44`, color:activeDay.color, fontSize:10, fontFamily:'inherit', letterSpacing:3, cursor:'pointer', fontWeight:700 }}>
                  SIGUIENTE BLOQUE ▶ (+2min descanso)
                </button>
              )}
            </div>
          );
        })}

        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:8, letterSpacing:3, color:'var(--mu)', marginBottom:7 }}>OBSERVACIONES</div>
          <textarea placeholder="Notas sobre la sesión..." value={observations} onChange={e => setObservations(e.target.value)} rows={3}
            style={{ width:'100%', padding:'10px 12px', background:'var(--sf)', border:'1px solid var(--bd2)', color:'var(--tx)', fontSize:12, fontFamily:"'DM Mono',monospace", outline:'none', resize:'none', lineHeight:1.6 }}/>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <button onClick={handleFinish} style={{ width:'100%', padding:'14px 0', background: pct===100 ? activeDay.color : 'var(--sf)', border:`1px solid ${pct===100 ? activeDay.color : 'var(--bd2)'}`, color: pct===100 ? '#000' : 'var(--tx)', fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:11, letterSpacing:3, cursor:'pointer', boxShadow: pct===100 ? `0 0 30px ${activeDay.color}44` : 'none' }}>
            {pct === 100 ? '✓ COMPLETADO — GUARDAR' : '■ TERMINAR Y GUARDAR'}
          </button>
          {dbStatus === 'saving' && <div style={{ fontSize:9, color:'#FFD600', letterSpacing:1 }}>● GUARDANDO...</div>}
          {dbStatus === 'saved'  && <div style={{ fontSize:9, color:'var(--ac)', letterSpacing:1 }}>✓ SESIÓN GUARDADA EN BASE DE DATOS</div>}
          {dbStatus === 'error'  && <div style={{ fontSize:9, color:'var(--ac2)', letterSpacing:1 }}>⚠ ERROR AL GUARDAR</div>}
          <button onClick={handleExit} style={{ width:'100%', padding:'10px 0', background:'transparent', border:'1px solid rgba(255,71,71,.2)', color:'rgba(255,71,71,.4)', fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, cursor:'pointer' }}>✕ SALIR SIN GUARDAR</button>
        </div>
      </div>
    </div>
  );

  // ── REVIEW (preview IA antes de añadir al registro) ─────────────
  if (screen === 'review' && pendingSession) return (
    <div style={{ paddingBottom:60, fontFamily:"'DM Mono',monospace" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:8, letterSpacing:6, color:'var(--ac)', marginBottom:6 }}>SESIÓN COMPLETADA</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1 }}>Revisar antes de añadir</div>
        <div style={{ fontSize:9, color:'var(--mu)', marginTop:4, letterSpacing:1 }}>El log ya está guardado. Decide si quieres añadirlo al registro/calendario.</div>
      </div>

      <div style={{ background:'var(--sf)', border:'1px solid var(--bd2)', padding:20, marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:12 }}>
          <div><div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Fecha</div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'var(--ac)'}}>{pendingSession.date}</div></div>
          <div><div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Tipo</div>
            <div style={{fontSize:12}}>gym</div></div>
        </div>
        {pendingSession.muscles?.length > 0 && <div style={{marginBottom:12}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Músculos</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{pendingSession.muscles.map(m => <span key={m} className="tag m">{m}</span>)}</div>
        </div>}
        {pendingSession.exercises?.length > 0 && <div style={{marginBottom:4}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Ejercicios</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{pendingSession.exercises.map((e,i) => <span key={i} className="tag">{e.n}{e.kg>0?' '+e.kg+'kg':''}{e.r?' ×'+e.r:''}</span>)}</div>
        </div>}
      </div>

      <div style={{ marginBottom:8, fontSize:9, letterSpacing:2, textTransform:'uppercase', color:'var(--mu)' }}>Resumen generado por IA</div>
      <div style={{ background:'var(--sf)', border:'1px solid rgba(232,255,71,0.2)', borderLeft:'3px solid var(--ac)', padding:16, marginBottom:20, minHeight:60 }}>
        {aiStatus === 'loading' && <div style={{fontSize:10,color:'var(--mu3)'}}><span className="dot">●</span><span className="dot">●</span><span className="dot">●</span> generando resumen...</div>}
        {aiStatus === 'error' && <div style={{fontSize:10,color:'var(--ac2)'}}>⚠ No se pudo generar el resumen. Puedes añadir igualmente, solo faltará el texto del diario.</div>}
        {aiStatus === 'done' && pendingDiary && <div className="diary-body" dangerouslySetInnerHTML={{__html: pendingDiary}}/>}
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <button onClick={confirmAddToRegistry} disabled={aiStatus==='loading'}
          style={{ width:'100%', padding:'14px 0', background:'var(--ac)', border:'none', color:'#000', fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:11, letterSpacing:3, cursor: aiStatus==='loading'?'wait':'pointer', opacity: aiStatus==='loading'?0.5:1 }}>
          ✓ AÑADIR AL REGISTRO
        </button>
        {dbStatus === 'saved' && <div style={{ fontSize:9, color:'var(--ac)', letterSpacing:1, textAlign:'center' }}>✓ AÑADIDO AL CALENDARIO Y DIARIO</div>}
        <button onClick={skipAddToRegistry}
          style={{ width:'100%', padding:'10px 0', background:'transparent', border:'1px solid var(--bd2)', color:'var(--mu)', fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, cursor:'pointer' }}>
          No añadir — solo guardar el log
        </button>
      </div>
    </div>
  );

  // ── LOG ───────────────────────────────────────────────────────
  if (screen === 'log') return (
    <div style={{ paddingBottom:60, fontFamily:"'DM Mono',monospace" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:8, letterSpacing:6, color: activeDay?.color || 'var(--ac)', marginBottom:6 }}>SESIÓN REGISTRADA</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1 }}>LOG · S{protocol.week} · DÍA {activeDay?.id}</div>
        <div style={{ fontSize:9, color:'var(--mu)', marginTop:4, letterSpacing:2 }}>{fmt(elapsed)} · {doneSets()} SERIES</div>
        {dbStatus === 'saved' && <div style={{ fontSize:9, color:'var(--ac)', marginTop:6, letterSpacing:1 }}>✓ GUARDADO EN BASE DE DATOS Y REGISTRO DE ENTRENOS</div>}
      </div>
      <div style={{ background:'var(--sf)', border:`1px solid ${activeDay?.color || 'var(--ac)'}22`, borderLeft:`3px solid ${activeDay?.color || 'var(--ac)'}`, padding:14, marginBottom:16 }}>
        <pre style={{ fontSize:10, lineHeight:1.9, color:'var(--mu3)', whiteSpace:'pre-wrap', wordBreak:'break-word', margin:0, fontFamily:"'DM Mono',monospace" }}>{sessionLog}</pre>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <button onClick={() => { navigator.clipboard.writeText(sessionLog).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
          style={{ width:'100%', padding:'13px 0', background: copied ? 'var(--ac)' : 'transparent', border:`1px solid ${copied ? 'var(--ac)' : 'var(--bd2)'}`, color: copied ? '#000' : 'var(--mu3)', fontFamily:"'DM Mono',monospace", fontWeight:700, fontSize:10, letterSpacing:3, cursor:'pointer' }}>
          {copied ? '✓ COPIADO' : '⎘ COPIAR LOG'}
        </button>
        <button onClick={() => { setScreen('home'); setActiveDay(null); setPendingSession(null); setPendingDiary(null); setAiStatus('idle'); }}
          style={{ width:'100%', padding:'10px 0', background:'transparent', border:'1px solid var(--bd2)', color:'var(--mu)', fontFamily:"'DM Mono',monospace", fontSize:10, letterSpacing:2, cursor:'pointer' }}>
          ← VOLVER AL INICIO
        </button>
      </div>
    </div>
  );

  return null;
}
