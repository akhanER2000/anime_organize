# ANIME VAULT

Catálogo personal de anime, multiusuario. Cada usuario tiene su *vault*: sus series, sus
portadas, su progreso y sus enlaces para continuar viendo donde lo dejó.

Obsidiana y oro: una losa de laja negra partida y reparada con kintsugi.

> **Estado: FASE 1 en curso.** Esquema, migraciones y autenticación. Las fases 2–6
> (CRUD y portadas, búsqueda, IA, importación, landing) están pendientes.
> Ver `CHANGELOG.md`.

---

## Stack

| Área | Elección |
|---|---|
| Framework | Next.js 15 (App Router, React Server Components) |
| Lenguaje | TypeScript estricto |
| Estilos | Tailwind CSS v4 con los tokens del diseño en `@theme` |
| Base de datos | **Neon** (Postgres serverless) — *nunca Supabase* |
| ORM | Drizzle ORM + drizzle-kit, driver `@neondatabase/serverless` |
| Auth | Auth.js v5 (`next-auth@beta`), sesión JWT |
| Validación | Zod (servidor y cliente) + react-hook-form |
| Imágenes | sharp (re-encode a WebP) |
| Excel/CSV | SheetJS |
| IA | `@anthropic-ai/sdk` + AniList GraphQL público |
| Tests | Vitest (unidad) + Playwright (e2e) |
| Gestor | **npm** |

### Por qué npm y no pnpm

El proyecto se diseñó para pnpm, pero en la máquina de desarrollo `corepack enable pnpm`
falla con `EPERM` (no puede escribir en el directorio de Node sin privilegios). En vez de
mezclar dos gestores —que es peor que elegir el que no gusta— **todo el proyecto usa npm**.
Recuerda que **npm necesita `--` para pasar argumentos a un script**:

```bash
npm run seed -- --dry-run     # correcto
npm run seed --dry-run        # el flag se lo come npm
```

---

## Requisitos

- **Node.js ≥ 20.9** (probado en 24.14)
- **npm** (viene con Node)
- Una cuenta en [Neon](https://neon.tech) — el plan gratuito sobra
- Una cuenta en [Vercel](https://vercel.com) para desplegar
- *Opcional:* clave de [Anthropic](https://console.anthropic.com) para el enriquecimiento con IA
- *Opcional:* cuenta de [Resend](https://resend.com) para enviar correos

---

## 1 · Crear la base de datos en Neon

1. Entra en [console.neon.tech](https://console.neon.tech) y crea un proyecto.
   Región: la más cercana a la de tu despliegue de Vercel (menos latencia por consulta).
2. Neon crea la rama `production` por defecto. **Crea también una rama `development`**
   (*Branches → New branch*, a partir de `production`). Es donde vas a trabajar: las ramas
   de Neon son copias instantáneas, y romper `development` no cuesta nada.
3. En *Connection Details* copia **las dos cadenas** de la rama `development`:
   - la **pooled** (lleva `-pooler` en el host) → `DATABASE_URL`
   - la **unpooled** (sin `-pooler`) → `DATABASE_URL_UNPOOLED`

   La *pooled* es para la aplicación; la *unpooled* para migraciones y scripts, porque el
   DDL largo no va por el pooler.

### Las extensiones son POR RAMA, no por proyecto

Este proyecto necesita tres extensiones de Postgres:

| Extensión | Para qué |
|---|---|
| `citext` | `users.email` insensible a mayúsculas |
| `pg_trgm` | similitud difusa de títulos (deduplicación) y buscador |
| `unaccent` | búsqueda sin acentos |

**Una rama nueva de Neon nace sin ellas.** Si creas `development`, `production` o cualquier
rama de preview y aplicas las migraciones sin más, la migración `0001` **falla en la primera
columna `citext` de `users`**.

Las crea `drizzle/0000_extensiones.sql`, que se aplica automáticamente como parte de
`npm run db:migrate`. Para comprobar que están:

```sql
SELECT extname FROM pg_extension WHERE extname IN ('citext','pg_trgm','unaccent');
```

Deben salir las tres. Si el rol `neondb_owner` no pudiera crear alguna, **para y dilo**:
rodearlo con `lower()` a mano desactiva la deduplicación insensible a mayúsculas sin avisar.

> `pgcrypto` **no** se usa. Su único uso habría sido `gen_random_uuid()`, que es nativo en
> Postgres desde la versión 13. Las contraseñas se hashean con Argon2id en Node.

---

## 2 · Variables de entorno

Copia la plantilla y rellénala:

```bash
cp .env.example .env.local
```

`.env.local` está en `.gitignore` y **nunca se commitea**. El `.gitignore` usa denegación
total sobre `.env*` con una única excepción para `.env.example`.

| Variable | ¿Obligatoria? | De dónde sale |
|---|---|---|
| `DATABASE_URL` | **sí** | Neon → Connection Details → cadena *pooled* |
| `DATABASE_URL_UNPOOLED` | **sí** | Neon → la misma sin `-pooler` |
| `AUTH_SECRET` | **sí** | `npx auth secret` (uno distinto por entorno) |
| `AUTH_URL` | en producción | la URL real del despliegue |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | no (`false`) | ponla a `true` al abrir el registro |
| `RESEND_API_KEY` | no | [resend.com/api-keys](https://resend.com/api-keys) |
| `EMAIL_FROM` | si usas Resend | una dirección de tu dominio verificado |
| `ANTHROPIC_API_KEY` | no | [console.anthropic.com](https://console.anthropic.com) |
| `ANTHROPIC_MODEL` | no (`claude-sonnet-5`) | — |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | no | Google Cloud Console |
| `GOOGLE_DRIVE_*` | no | espejo opcional de portadas |
| `SEED_OWNER_EMAIL` | para el seed | tu email |

**La cadena de producción no vive en tu disco.** Ni en `.env.local` ni «un momento para
probar algo». Va solo en las variables de Vercel del entorno *Production*. Ver
`.claude/rules/security.md` §7.

### Sobre el correo

La verificación de email y el «olvidé mi contraseña» usan una interfaz desacoplada:

- **Sin `RESEND_API_KEY`** → *driver de consola*: el enlace se imprime en el log del
  servidor con un aviso. La aplicación **funciona igual**; no hace falta clave para
  desarrollar.
- **Con `RESEND_API_KEY`** → se envía de verdad.

`AUTH_REQUIRE_EMAIL_VERIFICATION` está en `false` por defecto: mientras el vault sea de una
sola persona, verificar tu propio email no aporta nada y bloquearía el arranque. Los caminos
de código y sus tests existen igualmente, así que activarlo es cambiar una variable, no
reescribir la autenticación.

> **Plan gratuito de Resend:** 3.000 correos/mes, 100/día, **1 dominio verificado**.
> De sobra para este proyecto. Ojo: hasta verificar un dominio propio solo puedes enviar a
> tu propia dirección, así que abre el registro a terceros *después* de verificarlo.

---

## 3 · Instalar y arrancar

```bash
npm install
npm run db:migrate     # crea extensiones + esquema en la rama de development
npm run dev            # http://localhost:3000
```

---

## 4 · Cargar tus 83 animes

```bash
npm run seed -- --dry-run    # ensayo: lee y reporta, no escribe
npm run seed                 # de verdad
```

Lee `animes-seed.json`, inserta los animes del usuario propietario
(`SEED_OWNER_EMAIL`) y descarga cada portada desde Drive, pasándola por el mismo pipeline
que `/api/covers`: sha256 → sharp → WebP 82 → 480×720 y 100×150 → `anime_cover`.

Es **idempotente**: se puede correr N veces. Al terminar reporta creados, duplicados
omitidos y fallidos, con el motivo de cada fallo.

---

## 5 · Enriquecer con AniList y Claude

```bash
npm run enrich -- --dry-run --todos   # alcance y estimación de tokens
npm run enrich -- --todos             # solo los que faltan (idempotente)
```

**Paso 1 (AniList)** es público y gratuito: no necesita clave.
**Paso 2 (Claude)** necesita `ANTHROPIC_API_KEY`; si falta, **se salta con un aviso** y el
paso 1 sigue funcionando. Eso es comportamiento correcto, no un fallo.

---

## 6 · Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. En Vercel: *Add New → Project* e impórtalo. Framework: Next.js (se detecta solo).
3. **Variables de entorno**, por entorno separado:
   - *Production* → las cadenas de la rama `production` de Neon, su propio `AUTH_SECRET`.
   - *Preview* → las de una rama de preview, con **otro** `AUTH_SECRET`.
4. **Antes del primer despliegue a producción**, aplica las migraciones contra la rama
   `production` y comprueba que las tres extensiones existen ahí (§1). Es el fallo típico
   del primer deploy.
5. Despliega.

O usa `/project:deploy`, que hace el checklist previo (typecheck, lint, tokens, tests,
build, escaneo de secretos, extensiones y migraciones) antes de subir nada.

> `design/` está excluido del despliegue en `.vercelignore`: son ~85 MB de PNG originales
> que la aplicación no sirve nunca.

---

## Comandos

```bash
npm run dev · build · start

npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run lint:tokens      # falla si hay un hex fuera de globals.css
npm run format           # prettier

npm run test             # vitest
npm run test:cov         # con cobertura
npm run test:e2e         # playwright

npm run db:generate      # genera la migración desde el esquema TS
npm run db:migrate       # aplica migraciones
npm run db:push          # SOLO desarrollo local. Jamás contra producción.
npm run db:studio        # drizzle-studio

npm run verificar        # typecheck + lint + lint:tokens + test + build
```

---

## Estructura

```
design/          el diseño aprobado — fuente de verdad visual (no se toca)
drizzle/         migraciones SQL, generadas y revisadas a mano
scripts/         seed, enrich, migrate, lint-tokens
src/
  app/           rutas (App Router) y route handlers
  components/    ui/ · anime/ · layout/
  lib/
    db/          cliente Neon, esquema, repositorios, propiedad por user_id
    domain/      reglas PURAS: normalizar, duplicados, progreso, enums
    validation/  esquemas Zod compartidos cliente/servidor
    covers/      pipeline de portadas
    enrich/      AniList + Claude
.claude/         reglas, comandos, subagentes y skills del proyecto
```

`src/lib/domain/` no importa nada de `db/`, `app/` ni React: es lógica pura y testeable
sin arrancar nada.

---

## Documentación del proyecto

| Dónde | Qué |
|---|---|
| `CLAUDE.md` | stack, comandos, arquitectura, catálogo de skills |
| `.claude/rules/` | normas: estilo, tests, API, tokens, BD, seguridad |
| `.claude/skills/anime-vault-domain/` | **las reglas de dominio**: normalización de títulos, deduplicación, progreso, portadas, etiquetas IA |
| `design/DESIGN-SPEC.md` | medidas, estados de componente y breakpoints |
| `tasks/` | especificaciones por fase |
