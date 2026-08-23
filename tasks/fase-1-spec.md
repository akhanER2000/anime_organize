# Spec · FASE 1 — Esquema, migraciones y autenticación

> Estado: **pendiente de revisión**. Escrito antes de tocar código de aplicación,
> según `spec-driven-development`. La fuente de verdad del encargo es
> `ANIME_VAULT_prompts.md`; las normas son `.claude/rules/`; el dominio es
> `.claude/skills/anime-vault-domain/`.

---

## Supuestos que estoy haciendo

**Corrígeme ahora o tiro con estos.**

1. **Next.js 15**, no 16. Tu stack dice 15 explícitamente; la rama 15 está en `15.5.23`
   y la 16 ya existe (`16.3.2`). Fijo `15.5.23` exacto, sin caret, para que un
   `npm install` futuro no salte de major solo.
2. **La base de Neon todavía no existe.** Escribo el esquema y **genero** las migraciones
   sin conexión (`drizzle-kit generate` no necesita base). Aplicarlas queda pendiente de
   que me pases `DATABASE_URL`. La FASE 1 se cierra con las migraciones generadas y
   revisadas, no necesariamente aplicadas.
3. **Argon2id vía `@node-rs/argon2`**, parámetros `m=19456, t=2, p=1` (perfil OWASP).
   Es un módulo nativo con binarios precompilados para `linux-x64-gnu`, así que funciona en
   Vercel siempre que la ruta declare `runtime = "nodejs"`. Si diera problemas en el
   despliegue, la alternativa documentada es `bcryptjs` con 12 rondas.
4. **Sesión JWT**, no sesión en base de datos. Lo dice tu encargo. Consecuencia: la tabla
   `sessions` de Auth.js se crea igualmente (el adaptador de Drizzle la espera) pero queda
   sin uso mientras la estrategia sea JWT.
5. **Los usuarios de Credentials no pasan por el adaptador.** Auth.js v5 no crea usuarios
   con el proveedor Credentials: el registro es **nuestro** (`POST /api/registro`), y el
   proveedor solo verifica. Esto no es un rodeo, es cómo funciona v5.
6. **El registro exige verificación de email antes de poder entrar.** El encargo pide
   verificación; asumo que bloquea el login hasta confirmar, no que sea decorativa.
7. **Tailwind v4 se configura en CSS**, sin `tailwind.config.js`. Es el modo nativo de v4:
   `@import "tailwindcss"` + `@theme`.
8. **El dominio va en español**, la infraestructura en inglés, según `code-style.md`.

## Objetivo

Dejar en pie los cimientos sobre los que se apoyan las cinco fases siguientes:

- **Esquema** completo en Drizzle: las 15 tablas del encargo, con sus restricciones,
  índices y extensiones de Postgres.
- **Migraciones** generadas, revisadas a mano y reversibles.
- **Autenticación** funcional: registro, verificación de email, login, logout,
  recuperación de contraseña, ajustes de cuenta y borrado de cuenta.
- **Capa de dominio pura** con la normalización de títulos y sus tests, porque es la
  pieza de la que depende toda la FASE 2.

Éxito = un usuario puede registrarse, verificar su email, entrar, cambiar sus datos y
borrar su cuenta, y ninguna consulta del sistema puede devolver datos de otro usuario.

## Fuera de alcance en esta fase

Se dice explícitamente para que nadie lo dé por hecho:

- CRUD de anime, portadas, búsqueda, filtros, IA, importación, hub de streaming, landing.
- Cualquier pantalla que no sea de autenticación o ajustes.
- La estética completa: en FASE 1 solo se cablean los tokens y se implementan las
  pantallas del artboard **07 · Auth** y lo mínimo de **10 · Ajustes** (perfil y peligro).

## Tech stack fijado

| Pieza | Versión |
|---|---|
| next | `15.5.23` (exacta) |
| react · react-dom | `^19.2.0` |
| drizzle-orm · drizzle-kit | `^0.45.2` · `^0.31.10` |
| @neondatabase/serverless | `^1.1.0` |
| next-auth | `5.0.0-beta.32` (Auth.js v5) |
| @auth/drizzle-adapter | `^1.11.3` |
| @node-rs/argon2 | `^2.1.0` |
| zod | `^4.4.3` |
| tailwindcss | `^4.3.3` |
| vitest | `^4.1.11` |

Deliberadamente **no** se instalan todavía: `sharp` (FASE 2), `@anthropic-ai/sdk` (FASE 4),
`xlsx` (FASE 5), `@playwright/test` (FASE 6). Se instala lo que se usa.

## Comandos

```bash
npm run dev              # desarrollo
npm run build            # build de producción
npm run typecheck        # tsc --noEmit
npm run lint             # eslint
npm run lint:tokens      # falla si hay un hex fuera de globals.css
npm run test             # vitest run
npm run db:generate      # genera la migración desde el esquema TS
npm run db:migrate       # aplica migraciones (DATABASE_URL_UNPOOLED)
npm run verificar        # typecheck + lint + lint:tokens + test + build
```

## Estructura que crea esta fase

```
drizzle/                        migraciones SQL generadas y revisadas
scripts/
  migrate.ts                    aplica migraciones con el driver de Neon
  lint-tokens.mjs               busca hex fuera de globals.css
src/
  app/
    (publico)/
      login/page.tsx            artboard 07
      registro/page.tsx
      recuperar/page.tsx
      verificar/page.tsx
    app/
      ajustes/page.tsx          artboard 10 (perfil + peligro)
    api/
      auth/[...nextauth]/route.ts
      registro/route.ts
      recuperar/route.ts
      cuenta/route.ts           DELETE con export previo
    layout.tsx · globals.css · error.tsx · not-found.tsx
  lib/
    db/
      index.ts                  cliente Neon (HTTP para app, Pool para scripts)
      schema/                   14 tablas, una familia por archivo
      ownership.ts              requireOwnedAnime y compañía
      projections.ts            proyecciones sin password_hash
    domain/
      enums.ts                  los 6 dominios cerrados, fuente única
      normalizar.ts             normalización de títulos (+ test)
      normalizar.test.ts
    validation/
      auth.ts                   esquemas Zod compartidos
    api/
      errors.ts · respuesta.ts · middlewares.ts
    auth.ts                     configuración de Auth.js v5
    rate-limit.ts
  middleware.ts                 protege /app/*
```

## Modelo de datos — las 15 tablas

Del encargo, sin desviaciones. Detalle de tipos y convenciones en
`.claude/rules/db-conventions.md`.

| Tabla | Notas críticas |
|---|---|
| `users` | `email citext UNIQUE`, `password_hash`, `deleted_at` |
| `accounts` · `sessions` · `verification_tokens` | estándar de Auth.js |
| `password_reset_tokens` | se guarda **solo el hash**, caduca a 1 h, `used_at` |
| `anime` | **`UNIQUE (user_id, title_normalized)`** + GIN trigram |
| `anime_cover` | `bytea` para `bytes` y `thumb_bytes`, `checksum` sha256 |
| `genre` · `anime_genre` | `kind` ∈ OFICIAL/IA/USUARIO, PK compuesta |
| `progress` | `anime_id` es PK **y** FK: un progreso por anime |
| `continue_link` | índice por `(anime_id, last_used_at DESC)` |
| `streaming_site` · `streaming_mirror` | `is_global`, `user_id` nullable |
| `import_job` · `ai_job` | `report`/`result` en `jsonb` |

Extensiones en la **primera** migración, antes de cualquier tabla:
`citext`, `pg_trgm`, `unaccent`. (`pgcrypto` NO: `gen_random_uuid()` es nativo desde PG 13.)

## Estilo

```ts
// src/lib/db/schema/anime.ts
export const anime = pgTable(
  "anime",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    titleNormalized: text("title_normalized").notNull(),
    status: text("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_anime_user_title_norm").on(t.userId, t.titleNormalized),
    check("ck_anime_status", sql`${t.status} IN ('VISTO','VIENDO','EN_ESPERA','ABANDONADO','PENDIENTE')`),
    index("idx_anime_title_norm_trgm").using("gin", sql`${t.titleNormalized} gin_trgm_ops`),
  ],
);
```

Objeto TS en `camelCase`, columna en `snake_case`, siempre explícito. Sin `any`, sin `!`,
sin `as`. Ver `.claude/rules/code-style.md`.

## Estrategia de test

| Qué | Nivel | Umbral |
|---|---|---|
| `normalizarTitulo` | unidad, **TDD** | 95 % · incluye los 83 títulos reales con **0 colisiones** |
| Mapeo de estados | unidad | 95 % |
| Hash y verificación de contraseña | unidad | ambos caminos |
| Tokens de reset (hash, caducidad, un solo uso) | unidad | los tres |
| Aislamiento por `user_id` | integración | dos usuarios sembrados, el ajeno da **404** |
| Borrado de cuenta en cascada | integración | no queda fila huérfana |

Los de integración necesitan Postgres real (branch de test de Neon). Si no hay
`DATABASE_URL` de test, se marcan como omitidos **con aviso visible**, nunca en verde falso.

## Límites

**Siempre:** filtrar por `user_id`, validar con Zod en servidor, `import "server-only"` en
módulos con secretos, revisar el SQL generado a mano antes de commitear.

**Preguntar antes:** aplicar una migración, añadir una dependencia no listada arriba,
desviarse del diseño aprobado, cambiar la función de normalización una vez haya datos.

**Nunca:** commitear un secreto, usar Supabase, escribir un hex fuera de `globals.css`,
`db:push` contra producción, devolver 403 donde toca 404.

## Criterios de aceptación

1. `npm run verificar` pasa entero, y se ha **leído** la salida.
2. `npm run db:generate` produce SQL que crea las 4 extensiones, las 15 tablas, la
   restricción `uq_anime_user_title_norm` y el índice GIN trigram.
3. Cada `.sql` lleva en cabecera su SQL de reversión.
4. `normalizarTitulo` pasa los 18 casos tabulados y produce **83 normalizados únicos**
   sobre `animes-seed.json`.
5. Un usuario puede: registrarse → verificar email → entrar → cambiar nombre y contraseña
   → borrar la cuenta recibiendo antes su export `.json`.
6. Sin sesión, `/app/*` redirige a `/login`. Con sesión, `/login` redirige a `/app`.
7. Pedir el recurso de otro usuario devuelve **404**, nunca 403 ni datos.
8. Las pantallas de auth cotejadas contra `design/screens/07-auth.png` con
   `ui-fidelity-checker`, y la auditoría de `security-auditor` sin hallazgos CRÍTICO/ALTO.

## Preguntas abiertas — **bloquean parte de la fase**

1. **Proveedor de email.** La verificación y el «olvidé mi contraseña» necesitan enviar
   correo. No está decidido en el encargo. Opciones razonables: Resend (más simple en
   Vercel), SMTP genérico vía Nodemailer, o **modo consola** en desarrollo (se imprime el
   enlace en el log) dejando el proveedor para producción.
2. **Google OAuth.** El encargo dice «Credentials + Google *opcional*». ¿Lo cableo ahora o
   dejo solo el hueco documentado?
3. **`DATABASE_URL` de Neon.** Sin ella no se aplican migraciones ni corren los tests de
   integración. ¿La creas tú y me la pasas, o genero todo y lo aplicas después?
