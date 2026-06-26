# Training App Unificada v2.0

## Pasos para desplegar

### 1. Crear tablas en Supabase
Ve a tu proyecto Supabase → SQL Editor → New Query → pega el contenido de `schema.sql` → Run.

### 2. Configurar variables de entorno en Vercel
En tu proyecto de Vercel → Settings → Environment Variables, añade:

```
NEXT_PUBLIC_SUPABASE_URL=https://ygotdwvuhbztygxrokci.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
GEMINI_API_KEY=tu_api_key_de_gemini
```

### 3. Subir a GitHub
```bash
git init
git add .
git commit -m "Training app v2 - Supabase + GYMFIRE integrado"
git remote set-url origin https://github.com/Ernestosantanafoto/training-app.git
git push -f origin main
```

### 4. Vercel redeploya automáticamente

### 5. Migrar datos históricos (solo una vez)
Al abrir la app verás un banner amarillo "Migrar datos históricos". Pulsa el botón. Esto importa todas las sesiones de feb-abr 2026 a Supabase. Solo se hace una vez.

## Lo que hay de nuevo

- **Supabase** como base de datos real — los datos persisten entre dispositivos y recargas
- **Pestaña ⚡ Entreno** — GYMFIRE integrado con la estética de training-app
- **Al terminar un entreno** en GYMFIRE, se guarda automáticamente en el historial
- **Pestaña ＋ Nueva** — añadir sesiones con IA (texto, imagen, Garmin, báscula)
- **Sin más localStorage** — adiós al bug de junio que desaparecía
