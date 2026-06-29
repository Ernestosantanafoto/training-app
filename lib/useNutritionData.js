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
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [e, t, b, m, p] = await Promise.all([
        supabase.from('nutrition_entries').select('*').order('date', { ascending: false }),
        supabase.from('nutrition_targets').select('*').order('start_date', { ascending: false }).limit(1),
        supabase.from('nutrition_burn').select('*').order('date', { ascending: false }),
        supabase.from('meal_templates').select('*').order('sort_order', { ascending: true }),
        supabase.from('progress_photos').select('*').order('date', { ascending: false }),
      ]);
      if (e.error) throw e.error;
      setEntries(e.data || []);
      if (t.data && t.data[0]) setTarget(t.data[0]);
      setBurn(b.data || []);
      setTemplates(m.data || []);
      setPhotos(p.data || []);
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
    const row = {
      date: entry.date || todayStr(),
      meal: entry.meal || 'otro',
      name: entry.name,
      kcal: Math.round(entry.kcal || 0),
      protein: Number(entry.protein || 0),
      source: entry.source || 'manual',
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
    }));
    const { error } = await supabase.from('nutrition_entries').insert(clean);
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

  return {
    entries, target, burn, templates, photos, loading, error,
    load, addEntry, addEntriesBatch, deleteEntry, addBurn, addPhoto, setTargets,
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

// racha de dias consecutivos con registro hasta hoy
export function calcStreak(entries) {
  const dates = new Set(entries.map(e => e.date));
  let streak = 0;
  const d = new Date();
  for (;;) {
    const s = d.toISOString().slice(0, 10);
    if (dates.has(s)) { streak++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}
