# A Casa do Muiñeiro

Web estática premium para **A Casa do Muiñeiro**, vivienda de uso turístico de alquiler íntegro en O Allo, Baio, Costa da Morte.

## Desarrollo

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Astro genera la web estática en la carpeta:

```bash
dist
```

## Despliegue en Cloudflare Workers

Configuración recomendada:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Static assets directory: `dist`
- Node version: `24` o superior

## Estructura

- `src/pages/index.astro`: portada en español.
- `src/pages/[lang].astro`: rutas preparadas para `gl`, `en` y `fr`.
- `src/data/content.ts`: textos principales por idioma.
- `src/data/photos.ts`: inventario completo de imágenes, categorías, títulos y textos alternativos.
- `src/data/amenities.ts`: comodidades.
- `src/data/links.ts`: contacto, mapa, Instagram y enlaces oficiales del entorno.
- `public/images/raw`: extracción original del zip.
- `public/images/optimized`: 46 fotos optimizadas para la galería.
- `public/images/hero`: imagen principal.

## Cambiar textos

Edita `src/data/content.ts`. Español es el idioma por defecto. Las rutas de idioma están preparadas así:

- `/`
- `/gl/`
- `/en/`
- `/fr/`

## Cambiar fotos

1. Añade los originales en `public/images/raw`.
2. Crea copias optimizadas en `public/images/optimized`.
3. Actualiza `src/data/photos.ts` con `src`, `original`, `category`, `title`, `alt`, `featured` y `priority`.

La galería se alimenta únicamente de `src/data/photos.ts`, así que cualquier foto nueva debe registrarse ahí.

## Categorías de fotos

- Identidad e ilustración
- Exterior y fachada
- Finca y jardín
- Río
- Piscina
- Chill out
- Barbacoa y comer fuera
- Salón
- Lareira
- Cocina y comedor
- Dormitorios
- Baños
- Lavandería / equipamiento
- Detalles

## Reservas

El formulario no almacena datos. Genera un mensaje prellenado para:

- WhatsApp: `+34 606 81 86 56`
- Email: `acasadomuineiro@gmail.com`

Asunto del email: `Consulta de reserva - A Casa do Muiñeiro`.

## Backend de disponibilidad y reservas

El proyecto incluye un backend mínimo para Cloudflare Workers + Static Assets + D1:

- `src/worker.js`: Worker que sirve `/api/*` y delega la web estática a `dist`.
- `src/pages/admin.astro`: panel interno de gestión.
- `migrations/0001_reservations.sql`: esquema D1.
- `wrangler.toml`: configuración base de Cloudflare.

### Crear D1

```bash
npx wrangler d1 create a-casa-do-muineiro
```

Copia el `database_id` que devuelva Cloudflare en `wrangler.toml`, sustituyendo:

```toml
database_id = "REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID"
```

### Aplicar migraciones

Local:

```bash
npx wrangler d1 migrations apply a-casa-do-muineiro --local
```

Producción:

```bash
npx wrangler d1 migrations apply a-casa-do-muineiro --remote
```

### Configurar secreto de administración

El panel `/admin` no permite consultar ni guardar reservas sin `ADMIN_TOKEN`.

```bash
npx wrangler secret put ADMIN_TOKEN
```

Usa ese token en `/admin` para entrar. El token se guarda solo en el navegador del administrador.

Si Cloudflare todavía dice que no puedes añadir variables porque el Worker solo tiene activos estáticos, despliega primero la nueva versión con script:

```bash
npm run build
npx wrangler deploy
```

Después vuelve a ejecutar:

```bash
npx wrangler secret put ADMIN_TOKEN
```

### Endpoints

Disponibilidad pública:

```http
GET /api/availability?from=2026-07-01&to=2026-09-01
```

Crear consulta:

```http
POST /api/inquiries
```

Gestionar reservas:

```http
GET /api/admin/reservations
POST /api/admin/reservations
PATCH /api/admin/reservations
```

Cabecera requerida:

```http
Authorization: Bearer ADMIN_TOKEN
```

### Criterio de disponibilidad

Una reserva ocupa desde `start_date` incluido hasta `end_date` excluido. Es decir, si la salida es el 10 de agosto, la noche del 10 no queda ocupada.
