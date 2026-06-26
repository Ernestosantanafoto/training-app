-- ============================================================
-- APP-DE-ENTRENAMIENTO + GYMFIRE — Schema unificado
-- Ejecutar en: Supabase → SQL Editor → New Query → Run
-- ============================================================

-- 1. SESIONES DE ENTRENAMIENTO
create table if not exists training_sessions (
  id text primary key,
  date date not null,
  type text not null,
  muscles text[] default '{}',
  notes text default '',
  exercises jsonb default '[]',
  created_at timestamp with time zone default now()
);

-- 2. BIOMETRÍA
create table if not exists training_bios (
  id text primary key,
  date date not null,
  peso numeric,
  grasa numeric,
  musculo numeric,
  esq numeric,
  agua numeric,
  proteina numeric,
  visceral numeric,
  bmr numeric,
  edad numeric,
  created_at timestamp with time zone default now()
);

-- 3. DIARIO (entradas narrativas)
create table if not exists training_diary (
  id text primary key,
  date date not null,
  type text not null,
  text text default '',
  created_at timestamp with time zone default now()
);

-- 4. RAW (texto crudo de sesiones)
create table if not exists training_raw (
  id text primary key,
  date date not null,
  type text not null,
  text text default '',
  created_at timestamp with time zone default now()
);

-- 5. PROTOCOLOS GYMFIRE (ya existe, pero por si acaso)
create table if not exists protocols (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  week integer not null,
  protocol_data jsonb not null
);

-- 6. SESSION LOGS GYMFIRE (ya existe)
create table if not exists session_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  session_date timestamp with time zone,
  week integer not null,
  day_id text not null,
  day_name text not null,
  duration integer not null,
  completed_sets integer not null,
  total_sets integer not null,
  log_text text,
  exercises_data jsonb
);

-- ============================================================
-- RLS (Row Level Security) — acceso público anon
-- ============================================================
alter table training_sessions enable row level security;
alter table training_bios     enable row level security;
alter table training_diary    enable row level security;
alter table training_raw      enable row level security;

drop policy if exists "public_all" on training_sessions;
drop policy if exists "public_all" on training_bios;
drop policy if exists "public_all" on training_diary;
drop policy if exists "public_all" on training_raw;

create policy "public_all" on training_sessions for all using (true) with check (true);
create policy "public_all" on training_bios     for all using (true) with check (true);
create policy "public_all" on training_diary    for all using (true) with check (true);
create policy "public_all" on training_raw      for all using (true) with check (true);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
