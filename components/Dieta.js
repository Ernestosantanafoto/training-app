// components/Dieta.js
// Pestana DIETA — anillo diario, racha, platos de un toque, calendario,
// album de progreso y sueno. Conecta con useNutritionData (Supabase).
//
// Estetica alineada con la app: fondo oscuro, acento --ac (amarillo),
// tipografias Bebas Neue / DM Mono. Usa las variables CSS que ya tienes.

import { useState, useMemo } from 'react';
import {
  useNutritionData, dayTotals, dayStatus, calcStreak,
} from '../lib/useNutritionData';

const TODAY = new Date().toISOString().slice(0, 10);
const fmt = (n) => Math.round(n).toLocaleString('es-ES');

const TIER_COLOR = { verde: '#1d9e75', goloso: '#ef9f27', pecado: '#e24b4a' };
const STATUS_COLOR = { verde: '#1d9e75', ambar: '#ef9f27', rojo: '#e24b4a', none: 'rgba(255,255,255,0.12)' };

export default function Dieta() {
  const D = useNutritionData();
  const [sel, setSel] = useState(TODAY);
  const [textOpen, setTextOpen] = useState(false);
  const [foodText, setFoodText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPreview, setAiPreview] = useState(null);
  const [photoOpen, setPhotoOpen] = useState(false);

  const totals = useMemo(() => dayTotals(D.entries, sel), [D.entries, sel]);
  const streak = useMemo(() => calcStreak(D.entries), [D.entries]);
  const kcalTarget = D.target.kcal_target || 2800;
  const protTarget = D.target.protein_target || 160;

  const kcalPct = Math.min(100, (totals.kcal / kcalTarget) * 100);
  const protPct = Math.min(100, (totals.protein / protTarget) * 100);
  const kcalLeft = Math.max(0, kcalTarget - totals.kcal);

  // anillo SVG
  const R1 = 50, R2 = 36;
  const C1 = 2 * Math.PI * R1, C2 = 2 * Math.PI * R2;

  // --- acciones ---
  const addTemplate = (t) => {
    D.addEntry({
      date: sel, meal: t.meal, name: t.name,
      kcal: t.kcal, protein: t.protein, source: 'plantilla',
    });
  };

  const parseFood = async () => {
    if (!foodText.trim()) return;
    setAiBusy(true);
    try {
      const r = await fetch('/api/nutrition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: foodText }),
      });
      const data = await r.json();
      if (data.items && data.items.length) setAiPreview(data);
    } catch (e) {
      // silencioso; el usuario puede reintentar
    } finally {
      setAiBusy(false);
    }
  };

  const confirmAiFood = async () => {
    if (!aiPreview?.items) return;
    await D.addEntriesBatch(aiPreview.items.map(i => ({ ...i, date: sel, source: 'texto' })));
    setAiPreview(null); setFoodText(''); setTextOpen(false);
  };

  // --- calendario del mes de `sel` ---
  const calCells = useMemo(() => {
    const base = new Date(sel + 'T00:00:00');
    const y = base.getFullYear(), m = base.getMonth();
    const days = new Date(y, m + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(y, m, i + 1).toISOString().slice(0, 10);
      const t = dayTotals(D.entries, d);
      return { d, day: i + 1, status: dayStatus(t.kcal, kcalTarget) };
    });
  }, [sel, D.entries, kcalTarget]);

  const lastPhoto = D.photos[0];
  const daysSincePhoto = lastPhoto
    ? Math.floor((Date.now() - new Date(lastPhoto.date).getTime()) / 86400000)
    : 99;

  return (
    <div className="dieta-wrap" style={{ paddingBottom: 80 }}>
      {/* cabecera + racha */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, margin: 0, letterSpacing: 1 }}>DIETA</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(239,159,39,0.12)', color: '#ef9f27', padding: '5px 12px', borderRadius: 20, fontSize: 13, fontFamily: 'DM Mono, monospace' }}>
          🔥 {streak} {streak === 1 ? 'día' : 'días'}
        </div>
      </div>

      {D.error && (
        <div style={{ fontSize: 10, color: '#e24b4a', marginBottom: 12, padding: '8px 12px', border: '1px solid rgba(255,71,71,.2)' }}>
          ⚠ Error Supabase: {D.error}
        </div>
      )}

      {/* anillo doble + barras */}
      <div className="dieta-ring-card" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ position: 'relative', width: 108, height: 108, flexShrink: 0 }}>
          <svg viewBox="0 0 120 120" width="108" height="108">
            <circle cx="60" cy="60" r={R1} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
            <circle cx="60" cy="60" r={R1} fill="none" stroke="#378add" strokeWidth="11" strokeLinecap="round"
              strokeDasharray={C1} strokeDashoffset={C1 * (1 - kcalPct / 100)} transform="rotate(-90 60 60)" />
            <circle cx="60" cy="60" r={R2} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
            <circle cx="60" cy="60" r={R2} fill="none" stroke="#1d9e75" strokeWidth="11" strokeLinecap="round"
              strokeDasharray={C2} strokeDashoffset={C2 * (1 - protPct / 100)} transform="rotate(-90 60 60)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 500, lineHeight: 1, fontFamily: 'Bebas Neue, sans-serif' }}>{fmt(totals.kcal)}</span>
            <span style={{ fontSize: 10, opacity: 0.5 }}>de {fmt(kcalTarget)}</span>
          </div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11 }}>
          <Bar label="Calorías" color="#378add" cur={totals.kcal} max={kcalTarget} right={`${fmt(kcalLeft)} rest.`} />
          <Bar label="Proteína" color="#1d9e75" cur={totals.protein} max={protTarget} right={`${Math.round(totals.protein)}/${protTarget} g`} unit="g" />
          {sel !== TODAY && (
            <button onClick={() => setSel(TODAY)} style={miniBtn}>← volver a hoy</button>
          )}
        </div>
      </div>

      {/* platos de un toque */}
      <p style={lbl}>Añadir con un toque · {sel === TODAY ? 'hoy' : sel}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {D.templates.map(t => (
          <button key={t.id} onClick={() => addTemplate(t)} style={tplBtn}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TIER_COLOR[t.tier] || '#888', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</span>
            </div>
            <span style={{ fontSize: 11, opacity: 0.55 }}>{t.kcal} kcal · {t.protein} g</span>
          </button>
        ))}
        <button onClick={() => setTextOpen(true)} style={{ ...tplBtn, borderColor: 'var(--ac)', color: 'var(--ac)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 16 }}>✎</span>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Otra comida (texto)</span>
          </div>
        </button>
      </div>

      {/* lista de hoy */}
      {totals.items.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {totals.items.map(it => (
            <div key={it.id} style={rowItem}>
              <span style={{ flex: 1, fontSize: 13 }}>{it.name}</span>
              <span style={{ fontSize: 12, opacity: 0.6, marginRight: 10 }}>{it.kcal} · {Math.round(it.protein)}g</span>
              <button onClick={() => D.deleteEntry(it.id)} style={delBtn}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* calendario */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.6 }}>Registro del mes</span>
          <div style={{ display: 'flex', gap: 10, fontSize: 10, opacity: 0.6 }}>
            <Lg c="#1d9e75" t="objetivo" /><Lg c="#ef9f27" t="cerca" /><Lg c="#e24b4a" t="lejos" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
          {calCells.map(c => (
            <button key={c.d} onClick={() => setSel(c.d)}
              style={{ aspectRatio: '1', background: c.d === sel ? 'rgba(232,255,71,0.12)' : 'rgba(255,255,255,0.04)', border: c.d === sel ? '1px solid var(--ac)' : 'none', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', padding: 0 }}>
              <span style={{ fontSize: 10, opacity: 0.7 }}>{c.day}</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[c.status] }} />
            </button>
          ))}
        </div>
      </div>

      {/* album de progreso */}
      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 12, opacity: 0.6 }}>Progreso · foto y cintura</span>
          <button onClick={() => setPhotoOpen(true)} style={miniBtn}>+ añadir</button>
        </div>
        {daysSincePhoto >= 14 && (
          <div style={{ fontSize: 11, color: 'var(--ac)', marginBottom: 10 }}>
            ⏰ Toca foto quincenal {lastPhoto ? `(última hace ${daysSincePhoto} días)` : '(primera)'}
          </div>
        )}
        {D.photos.length === 0 && (
          <p style={{ fontSize: 11, opacity: 0.4, margin: 0 }}>Aún sin fotos. Añade la primera para empezar tu tira de progreso.</p>
        )}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
          {D.photos.map(p => (
            <div key={p.id} style={{ minWidth: 90, flexShrink: 0 }}>
              {p.photo_url
                ? <img src={p.photo_url} alt={p.date} style={{ width: 90, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} />
                : <div style={{ width: 90, height: 120, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, opacity: 0.4 }}>sin foto</div>}
              <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>{p.date}{p.waist_cm ? ` · ${p.waist_cm}cm` : ''}</div>
            </div>
          ))}
        </div>
      </div>

      {/* modal texto comida */}
      {textOpen && (
        <Modal onClose={() => { setTextOpen(false); setAiPreview(null); }}>
          <h3 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, margin: '0 0 10px' }}>AÑADIR COMIDA</h3>
          <textarea value={foodText} onChange={e => setFoodText(e.target.value)}
            placeholder="Ej: 200g de salmón a la plancha con una taza de arroz y ensalada"
            style={{ width: '100%', minHeight: 80, fontSize: 16, padding: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'inherit', boxSizing: 'border-box' }} />
          {!aiPreview && (
            <button onClick={parseFood} disabled={aiBusy} style={{ ...primaryBtn, marginTop: 10, opacity: aiBusy ? 0.5 : 1 }}>
              {aiBusy ? 'Analizando…' : 'Analizar con IA'}
            </button>
          )}
          {aiPreview && (
            <div style={{ marginTop: 12 }}>
              {aiPreview.items.map((i, k) => (
                <div key={k} style={rowItem}>
                  <span style={{ flex: 1, fontSize: 13 }}>{i.name}</span>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>{i.kcal} · {Math.round(i.protein)}g</span>
                </div>
              ))}
              <div style={{ fontSize: 12, opacity: 0.7, margin: '8px 0', textAlign: 'right' }}>
                Total: {fmt(aiPreview.total_kcal)} kcal · {Math.round(aiPreview.total_protein)} g
              </div>
              {aiPreview.note && <div style={{ fontSize: 11, color: 'var(--ac)', marginBottom: 8 }}>{aiPreview.note}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={confirmAiFood} style={primaryBtn}>Añadir al día</button>
                <button onClick={() => setAiPreview(null)} style={miniBtn}>Reintentar</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* modal foto progreso */}
      {photoOpen && (
        <PhotoModal onClose={() => setPhotoOpen(false)} onSave={async (p) => { await D.addPhoto({ ...p, date: sel }); setPhotoOpen(false); }} />
      )}
    </div>
  );
}

// ---------- subcomponentes ----------
function Bar({ label, color, cur, max, right, unit }) {
  const pct = Math.min(100, (cur / max) * 100);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color }}>{label}</span>
        <span style={{ opacity: 0.6 }}>{right}</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}
const Lg = ({ c, t }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{t}
  </span>
);

function Modal({ children, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#1a1a19', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: 18, maxWidth: 360, width: '100%' }}>
        {children}
      </div>
    </div>
  );
}

function PhotoModal({ onClose, onSave }) {
  const [waist, setWaist] = useState('');
  const [weight, setWeight] = useState('');
  const [assessment, setAssessment] = useState('');
  const [url, setUrl] = useState('');
  return (
    <Modal onClose={onClose}>
      <h3 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, margin: '0 0 10px' }}>FOTO DE PROGRESO</h3>
      <p style={{ fontSize: 11, opacity: 0.55, margin: '0 0 12px' }}>Sube la foto a Supabase Storage (bucket 'progreso') y pega aquí su URL pública. La valoración la generas en el chat y la pegas abajo.</p>
      <Field label="URL foto" value={url} onChange={setUrl} placeholder="https://…/progreso/..." />
      <div style={{ display: 'flex', gap: 8 }}>
        <Field label="Cintura (cm)" value={waist} onChange={setWaist} placeholder="84" type="number" />
        <Field label="Peso (kg)" value={weight} onChange={setWeight} placeholder="83.7" type="number" />
      </div>
      <label style={{ fontSize: 11, opacity: 0.6 }}>Valoración (texto del chat)</label>
      <textarea value={assessment} onChange={e => setAssessment(e.target.value)}
        style={{ width: '100%', minHeight: 60, fontSize: 16, padding: 8, marginTop: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'inherit', boxSizing: 'border-box' }} />
      <button onClick={() => onSave({ photo_url: url || null, waist_cm: waist ? Number(waist) : null, weight_kg: weight ? Number(weight) : null, assessment: assessment || null })} style={{ ...primaryBtn, marginTop: 10 }}>Guardar</button>
    </Modal>
  );
}
const Field = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <div style={{ flex: 1, marginBottom: 10 }}>
    <label style={{ fontSize: 11, opacity: 0.6 }}>{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', fontSize: 16, padding: 8, marginTop: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'inherit', boxSizing: 'border-box' }} />
  </div>
);

// ---------- estilos ----------
const lbl = { fontSize: 12, opacity: 0.55, margin: '0 0 8px 2px' };
const card = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12 };
const tplBtn = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 11, textAlign: 'left', color: 'inherit', cursor: 'pointer' };
const rowItem = { display: 'flex', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' };
const delBtn = { background: 'none', border: 'none', color: '#e24b4a', fontSize: 18, cursor: 'pointer', padding: '0 4px' };
const miniBtn = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '5px 10px', fontSize: 11, color: 'inherit', cursor: 'pointer' };
const primaryBtn = { flex: 1, background: 'var(--ac)', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 14, fontWeight: 500, color: '#111', cursor: 'pointer' };
