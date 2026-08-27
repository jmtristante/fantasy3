# Fantasy LaLiga

Aplicación web para gestionar tu equipo de Fantasy LaLiga.

## Desarrollo local

### Servidor web (frontend)

```bash
npx vite --host
```

 disponible en `http://localhost:5173`

### Proxy (API)

El proxy reenvía las peticiones a la API de LaLiga Fantasy. Necesario para el desarrollo local.

```bash
cd ../LaLigaApp
node server/index.js
```

Disponible en `http://localhost:3005`

### Variables de entorno

Copiar `.env.example` a `.env` y rellenar:

```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_API_BASE_URL=http://localhost:3005
```

## Stack

- React 19 + TypeScript
- Vite
- HeroUI v3
- Tailwind CSS v4
- Zustand (estado)
- React Query (queries)
- Supabase (auth + datos scraping)

## Despliegue

- **Frontend**: Vercel
- **Proxy**: Render
- **Datos**: Supabase
