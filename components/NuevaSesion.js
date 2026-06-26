'use client';
import { useState } from 'react';

export default function NuevaSesion({ onSave }) {
  const [tab, setTab] = useState('sesion');
  const [text, setText] = useState('');
  const [bioText, setBioText] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(null);
  const [pendingBio, setPendingBio] = useState(null);

  const callAI = async (body) => {
    const res = await fetch('/api/ai', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  };

  const parseSession = async () => {
    if (!text.trim()) { setStatus('err:Pega el texto del entrenamiento primero'); return; }
    setStatus('loading'); setPending(null);
    try {
      const result = await callAI({ type: 'session', text });
      setPending({ id: 's' + Date.now(), ...result });
      setStatus('');
    } catch(e) { setStatus('err:' + e.message); }
  };

  const parseBio = async () => {
    if (!bioText.trim()) { setStatus('err:Pega el texto con los datos biométricos'); return; }
    setStatus('loading'); setPendingBio(null);
    try {
      const result = await callAI({ type: 'bio', text: bioText });
      setPendingBio({ id: 'b' + Date.now(), ...result });
      setStatus('');
    } catch(e) { setStatus('err:' + e.message); }
  };

  const confirmSession = async () => {
    if (!pending) return;
    setStatus('loading');
    let diaryEntry = null;
    try {
      const diaryText = await callAI({ type: 'diary', text: JSON.stringify(pending) });
      diaryEntry = { id: 'd' + Date.now(), date: pending.date, type: pending.type, text: diaryText };
    } catch {}
    const rawEntry = { id: 'r' + Date.now(), date: pending.date, type: pending.type, text: text || pending.notes || '' };
    await onSave(pending, diaryEntry, rawEntry);
    setText(''); setPending(null); setStatus('ok:Sesión añadida correctamente');
  };

  const confirmBio = async () => {
    if (!pendingBio) return;
    const b = { id: pendingBio.id, date: pendingBio.date };
    ['peso','grasa','musculo','esq','agua','proteina','visceral','bmr','edad'].forEach(k => {
      const v = parseFloat(pendingBio[k]);
      if (!isNaN(v)) b[k] = v;
    });
    await onSave(null, null, null, b);
    setBioText(''); setPendingBio(null); setStatus('ok:Medición añadida correctamente');
  };

  const StatusEl = () => {
    if (!status) return null;
    if (status === 'loading') return <div className="status-loading"><span className="dot">●</span><span className="dot">●</span><span className="dot">●</span></div>;
    if (status.startsWith('err:')) return <div className="status-err">{status.slice(4)}</div>;
    return <div className="status-ok">{status.startsWith('ok:') ? status.slice(3) : status}</div>;
  };

  const BIO_LABELS = {
    peso:'Peso (kg)', grasa:'Grasa (%)', musculo:'Músculo (kg)', esq:'M. esq. (%)',
    agua:'Agua (%)', proteina:'Proteína (%)', visceral:'Visceral', bmr:'BMR (kcal)', edad:'Edad corporal'
  };

  return (
    <div style={{ maxWidth: 680 }}>
      <div className="sl" style={{ marginTop:0 }}>Añadir</div>
      <div className="log-tabs">
        <div className={`log-tab${tab==='sesion'?' active':''}`} onClick={() => { setTab('sesion'); setStatus(''); }}>Entrenamiento</div>
        <div className={`log-tab${tab==='bio'?' active':''}`} onClick={() => { setTab('bio'); setStatus(''); }}>Biometría</div>
      </div>

      {tab === 'sesion' && (
        <div>
          <div style={{fontSize:10,color:'var(--mu)',marginBottom:8,letterSpacing:1,lineHeight:1.6}}>
            Pega el texto de tu entrenamiento (gimnasio, carrera, senderismo, bici, tenis, ultimate...). La IA extraerá los datos y generará la entrada de diario.
          </div>
          <textarea className="paste-box" value={text} onChange={e => setText(e.target.value)}
            placeholder="Ej: Hoy press banca 80kg x 8, sentadilla 100kg x 5... o: Carrera 10km en 50min, FC media 145ppm..." />
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginTop:8 }}>
            <button className="parse-btn" disabled={status==='loading'} onClick={parseSession}>Analizar con IA →</button>
            <StatusEl />
          </div>

          {pending && (
            <div style={{ background:'var(--sf)', border:'1px solid var(--bd2)', padding:20, marginTop:16 }}>
              <div className="sl" style={{ marginTop:0 }}>Vista previa</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:12 }}>
                <div><div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Fecha</div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'var(--ac)'}}>{pending.date}</div></div>
                <div><div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Tipo</div>
                  <div style={{fontSize:12}}>{pending.type}</div></div>
              </div>
              {pending.muscles?.length > 0 && <div style={{marginBottom:12}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Músculos</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{pending.muscles.map(m => <span key={m} className="tag m">{m}</span>)}</div>
              </div>}
              {pending.exercises?.length > 0 && <div style={{marginBottom:12}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Ejercicios</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{pending.exercises.map((e,i) => <span key={i} className="tag">{e.n}{e.kg>0?' '+e.kg+'kg':''}{e.r?' ×'+e.r:''}</span>)}</div>
              </div>}
              {pending.notes && <div style={{marginBottom:12}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Notas</div>
                <div style={{fontSize:12,color:'var(--mu3)',lineHeight:1.6}}>{pending.notes}</div>
              </div>}
              <div style={{display:'flex',gap:8,marginTop:16}}>
                <button onClick={() => { setPending(null); setStatus(''); }} style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',padding:'9px 20px',border:'1px solid var(--bd2)',background:'transparent',color:'var(--mu3)',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>Cancelar</button>
                <button onClick={confirmSession} disabled={status==='loading'} style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',padding:'9px 20px',background:'var(--ac)',color:'#0a0a0a',border:'1px solid var(--ac)',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontWeight:500,opacity:status==='loading'?0.5:1}}>Guardar sesión</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'bio' && (
        <div>
          <div style={{fontSize:10,color:'var(--mu)',marginBottom:8,letterSpacing:1,lineHeight:1.6}}>
            Pega el texto con los datos de tu báscula o composición corporal. La IA los colocará en cada campo automáticamente.
          </div>
          <textarea className="paste-box" value={bioText} onChange={e => setBioText(e.target.value)}
            placeholder="Ej: Peso 83.5kg, grasa 14.9%, músculo 65.1kg, agua 62.8%, grasa visceral 3, edad metabólica 37, BMR 1877 kcal..." />
          <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', marginTop:8 }}>
            <button className="parse-btn blue" disabled={status==='loading'} onClick={parseBio}>Analizar con IA →</button>
            <StatusEl />
          </div>

          {pendingBio && (
            <div style={{ background:'var(--sf)', border:'1px solid var(--bd2)', padding:20, marginTop:16 }}>
              <div className="sl" style={{ marginTop:0 }}>Vista previa</div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:'uppercase',color:'var(--mu)',marginBottom:4}}>Fecha</div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,color:'var(--ac3)'}}>{pendingBio.date}</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8,marginBottom:16}}>
                {Object.keys(BIO_LABELS).map(k => pendingBio[k] != null && (
                  <div key={k} style={{background:'var(--bg)',border:'1px solid var(--bd2)',padding:'8px 12px'}}>
                    <div style={{fontSize:8,letterSpacing:1,textTransform:'uppercase',color:'var(--mu)'}}>{BIO_LABELS[k]}</div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:'var(--ac3)'}}>{pendingBio[k]}</div>
                  </div>
                ))}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={() => { setPendingBio(null); setStatus(''); }} style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',padding:'9px 20px',border:'1px solid var(--bd2)',background:'transparent',color:'var(--mu3)',cursor:'pointer',fontFamily:"'DM Mono',monospace"}}>Cancelar</button>
                <button onClick={confirmBio} style={{fontSize:10,letterSpacing:2,textTransform:'uppercase',padding:'9px 20px',background:'var(--ac3)',color:'#0a0a0a',border:'1px solid var(--ac3)',cursor:'pointer',fontFamily:"'DM Mono',monospace",fontWeight:500}}>Guardar medición</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
