// lib/useNutritionData.js
// Hook de datos de nutricion sobre tu Supabase existente.
// Reutiliza el mismo cliente `supabase` que ya tienes en lib/supabase.js

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

const todayStr = () => new Date().toISOString().slice(0, 10);

export function useNutritionData() {
  const [entries, setEntries]   = useState([]);
  const [target, setTarget]     = useState({ kcal_target: 2800, protein_target: 160, maintenance: 3400 });
  const [burn, setBurn]         = useState([]);
  const [templates, setTemplates] = useState([]);
  const [photos, setPhotos]     = useState([]);
  const [freeDays, setFreeDays] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [e, t, b, m, p, fd] = await Promise.all([
        supabase.from('nutrition_entries').select('*').order('date', { ascending: false }),
        supabase.from('nutrition_targets').select('*').order('start_date', { ascending: false }).limit(1),
        supabase.from('nutrition_burn').select('*').order('date', { ascending: false }),
        supabase.from('meal_templates').select('*').order('sort_order', { ascending: true }),
        supabase.from('progress_photos').select('*').order('date', { ascending: false }),
        supabase.from('nutrition_free_days').select('*').order('date', { ascending: false }),
      ]);
      if (e.error) throw e.error;
      setEntries(e.data || []);
      if (t.data && t.data[0]) setTarget(t.data[0]);
      setBurn(b.data || []);
      setTemplates(m.data || []);
      setPhotos(p.data || []);
      setFreeDays((fd && fd.data) || []);
      setError(null);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // --- escrituras ---
  const addEntry = useCallback(async (entry) => {
    const qty = Math.max(1, Math.round(entry.qty || 1));
    const row = {
      date: entry.date || todayStr(),
      meal: entry.meal || 'otro',
      name: entry.name,
      kcal: Math.round((entry.kcal || 0) * qty),
      protein: Number(((entry.protein || 0) * qty).toFixed(1)),
      qty,
      source: entry.source || 'manual',
      estimated: !!entry.estimated,
    };
    const { error } = await supabase.from('nutrition_entries').insert(row);
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const addEntriesBatch = useCallback(async (rows) => {
    const clean = rows.map(r => ({
      date: r.date || todayStr(),
      meal: r.meal || 'otro',
      name: r.name,
      kcal: Math.round(r.kcal || 0),
      protein: Number(r.protein || 0),
      source: r.source || 'texto',
      estimated: !!r.estimated,
    }));
    const { error } = await supabase.from('nutrition_entries').insert(clean);
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const updateEntryQty = useCallback(async (entry, newQty) => {
    const q = Math.max(1, Math.round(newQty));
    const unitK = (entry.kcal || 0) / (entry.qty || 1);
    const unitP = (entry.protein || 0) / (entry.qty || 1);
    const { error } = await supabase.from('nutrition_entries')
      .update({ qty: q, kcal: Math.round(unitK * q), protein: Number((unitP * q).toFixed(1)) })
      .eq('id', entry.id);
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const deleteEntry = useCallback(async (id) => {
    const { error } = await supabase.from('nutrition_entries').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const addBurn = useCallback(async (date, kcal_burned) => {
    const { error } = await supabase.from('nutrition_burn')
      .upsert({ date, kcal_burned: Math.round(kcal_burned), source: 'garmin' }, { onConflict: 'date' });
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const addPhoto = useCallback(async (photo) => {
    const { error } = await supabase.from('progress_photos').insert({
      date: photo.date || todayStr(),
      photo_url: photo.photo_url || null,
      waist_cm: photo.waist_cm || null,
      weight_kg: photo.weight_kg || null,
      assessment: photo.assessment || null,
    });
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const setTargets = useCallback(async (kcal_target, protein_target, maintenance, note) => {
    const { error } = await supabase.from('nutrition_targets').insert({
      start_date: todayStr(), kcal_target, protein_target, maintenance, note: note || null,
    });
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const setFreeDay = useCallback(async (date, on, note) => {
    if (on) {
      const { error } = await supabase.from('nutrition_free_days')
        .upsert({ date, note: note || null }, { onConflict: 'date' });
      if (error) { setError(error.message); return; }
    } else {
      const { error } = await supabase.from('nutrition_free_days').delete().eq('date', date);
      if (error) { setError(error.message); return; }
    }
    await load();
  }, [load]);

  const createTemplate = useCallback(async (tpl) => {
    const slug = (tpl.name || 'item').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
      + '_' + Date.now().toString(36);
    const row = {
      slug,
      name: tpl.name,
      meal: tpl.meal || null,
      kcal: Math.round(tpl.kcal || 0),
      protein: Number(tpl.protein || 0),
      tier: tpl.tier || 'verde',
      icon: 'bowl',
      sort_order: 999,
      user_created: true,
      estimated: !!tpl.estimated,
    };
    const { data, error } = await supabase.from('meal_templates').insert(row).select();
    if (error) { setError(error.message); return null; }
    await load();
    return data && data[0];
  }, [load]);

  const deleteTemplate = useCallback(async (id) => {
    const { error } = await supabase.from('meal_templates').delete().eq('id', id);
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  const updateTemplate = useCallback(async (id, fields) => {
    const upd = {};
    if (fields.name !== undefined) upd.name = fields.name;
    if (fields.kcal !== undefined) upd.kcal = Math.round(fields.kcal || 0);
    if (fields.protein !== undefined) upd.protein = Number(fields.protein || 0);
    if (fields.tier !== undefined) upd.tier = fields.tier;
    if (fields.estimated !== undefined) upd.estimated = !!fields.estimated;
    const { error } = await supabase.from('meal_templates').update(upd).eq('id', id);
    if (error) { setError(error.message); return; }
    await load();
  }, [load]);

  return {
    entries, target, burn, templates, photos, freeDays, loading, error,
    createTemplate, deleteTemplate, updateTemplate, setFreeDay,
    load, addEntry, addEntriesBatch, updateEntryQty, deleteEntry, addBurn, addPhoto, setTargets,
  };
}

// --- helpers de calculo (puros, exportados para tests/UI) ---
export function dayTotals(entries, date) {
  const d = entries.filter(e => e.date === date);
  return {
    kcal: d.reduce((s, e) => s + (e.kcal || 0), 0),
    protein: d.reduce((s, e) => s + (Number(e.protein) || 0), 0),
    items: d,
  };
}

// color del dia segun cumplimiento de kcal (verde/ambar/rojo)
export function dayStatus(totalKcal, kcalTarget) {
  if (totalKcal === 0) return 'none';
  const ratio = totalKcal / kcalTarget;
  if (ratio <= 1.05) return 'verde';      // dentro o por debajo del objetivo
  if (ratio <= 1.20) return 'ambar';      // ligeramente pasado
  return 'rojo';                          // muy pasado
}

// racha por CONSTANCIA: un dia registrado (algo) o marcado "libre" mantiene;
// un dia sin nada rompe. Si hoy aun no tiene nada, no rompe (el dia no acabo).
export function calcStreak(entries, freeDays = []) {
  const reg = new Set((entries || []).map(e => e.date));
  const free = new Set((freeDays || []).map(f => f.date));
  const has = s => reg.has(s) || free.has(s);
  const todayStr = new Date().toISOString().slice(0, 10);
  let streak = 0;
  const d = new Date();
  if (!has(todayStr)) d.setDate(d.getDate() - 1);
  for (;;) {
    const s = d.toISOString().slice(0, 10);
    if (has(s)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

// cuenta cuantas veces se ha registrado cada plato (por nombre) en todo el historico
export function usageCounts(entries) {
  const counts = {};
  (entries || []).forEach(e => {
    const k = (e.name || '').trim().toLowerCase();
    if (k) counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

// devuelve los templates ordenados por frecuencia de uso (mas usados primero)
export function rankedTemplates(templates, entries) {
  const counts = usageCounts(entries);
  return [...(templates || [])].sort((a, b) => {
    const ca = counts[(a.name || '').trim().toLowerCase()] || 0;
    const cb = counts[(b.name || '').trim().toLowerCase()] || 0;
    if (cb !== ca) return cb - ca;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });
}
