'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export function useTrainingData() {
  const [sessions, setSessions] = useState([]);
  const [bios,     setBios]     = useState([]);
  const [diary,    setDiary]    = useState([]);
  const [raw,      setRaw]      = useState([]);
  const [loaded,   setLoaded]   = useState(false);
  const [error,    setError]    = useState(null);

  const load = useCallback(async () => {
    try {
      const [s, b, d, r] = await Promise.all([
        supabase.from('training_sessions').select('*').order('date', { ascending: true }),
        supabase.from('training_bios').select('*').order('date', { ascending: false }),
        supabase.from('training_diary').select('*').order('date', { ascending: false }),
        supabase.from('training_raw').select('*').order('date', { ascending: false }),
      ]);
      if (s.error) throw s.error;
      // Map DB rows to app format
      setSessions((s.data || []).map(row => ({
        id: row.id, date: row.date, type: row.type,
        muscles: row.muscles || [], notes: row.notes || '',
        exercises: row.exercises || [],
      })));
      setBios((b.data || []).map(row => ({
        id: row.id, date: row.date, peso: row.peso, grasa: row.grasa,
        musculo: row.musculo, esq: row.esq, agua: row.agua,
        proteina: row.proteina, visceral: row.visceral, bmr: row.bmr, edad: row.edad,
      })));
      setDiary((d.data || []).map(row => ({
        id: row.id, date: row.date, type: row.type, text: row.text || '',
      })));
      setRaw((r.data || []).map(row => ({
        id: row.id, date: row.date, type: row.type, text: row.text || '',
      })));
      setLoaded(true);
    } catch (err) {
      console.error('Load error:', err);
      setError(err.message);
      setLoaded(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addSession = useCallback(async (s) => {
    const row = {
      id: s.id || 's' + Date.now(),
      date: s.date, type: s.type,
      muscles: s.muscles || [],
      notes: s.notes || '',
      exercises: s.exercises || [],
    };
    const { error } = await supabase.from('training_sessions').upsert(row);
    if (!error) setSessions(prev => [...prev.filter(x => x.id !== row.id), row].sort((a,b) => a.date.localeCompare(b.date)));
    return error;
  }, []);

  const deleteSession = useCallback(async (id) => {
    await supabase.from('training_sessions').delete().eq('id', id);
    setSessions(prev => prev.filter(s => s.id !== id));
  }, []);

  const deleteDiary = useCallback(async (id) => {
    await supabase.from('training_diary').delete().eq('id', id);
    setDiary(prev => prev.filter(d => d.id !== id));
  }, []);

  const deleteRaw = useCallback(async (id) => {
    await supabase.from('training_raw').delete().eq('id', id);
    setRaw(prev => prev.filter(r => r.id !== id));
  }, []);

  const deleteBio = useCallback(async (id) => {
    await supabase.from('training_bios').delete().eq('id', id);
    setBios(prev => prev.filter(b => b.id !== id));
  }, []);

  // Delete everything tied to a date (session + diary + raw for that day)
  const deleteByDate = useCallback(async (date) => {
    await Promise.all([
      supabase.from('training_sessions').delete().eq('date', date),
      supabase.from('training_diary').delete().eq('date', date),
      supabase.from('training_raw').delete().eq('date', date),
    ]);
    setSessions(prev => prev.filter(s => s.date !== date));
    setDiary(prev => prev.filter(d => d.date !== date));
    setRaw(prev => prev.filter(r => r.date !== date));
  }, []);

  const addBio = useCallback(async (b) => {
    const row = { id: b.id || 'b' + Date.now(), date: b.date, peso: b.peso, grasa: b.grasa,
      musculo: b.musculo, esq: b.esq, agua: b.agua, proteina: b.proteina,
      visceral: b.visceral, bmr: b.bmr, edad: b.edad };
    const { error } = await supabase.from('training_bios').upsert(row);
    if (!error) setBios(prev => [row, ...prev.filter(x => x.id !== row.id)]);
    return error;
  }, []);

  const addDiary = useCallback(async (d) => {
    const row = { id: d.id || 'd' + Date.now(), date: d.date, type: d.type, text: d.text || '' };
    const { error } = await supabase.from('training_diary').upsert(row);
    if (!error) setDiary(prev => [row, ...prev.filter(x => x.id !== row.id)]);
    return error;
  }, []);

  const addRaw = useCallback(async (r) => {
    const row = { id: r.id || 'r' + Date.now(), date: r.date, type: r.type, text: r.text || '' };
    const { error } = await supabase.from('training_raw').upsert(row);
    if (!error) setRaw(prev => [row, ...prev.filter(x => x.id !== row.id)]);
    return error;
  }, []);

  return { sessions, bios, diary, raw, loaded, error, load,
           addSession, deleteSession, deleteDiary, deleteRaw, deleteBio, deleteByDate, addBio, addDiary, addRaw };
}
