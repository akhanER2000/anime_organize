# Regla · Convenciones de base de datos

**Postgres en Neon** (serverless), **Drizzle ORM** + **drizzle-kit**, driver
`@neondatabase/serverless`. **Nunca Supabase**, ni su cliente, ni sus políticas RLS, ni su
`auth`. Si una skill o un ejemplo asume Supabase, se adapta o se descarta.

## Nombres

| Cosa | Convención | Ejemplo |
|---|---|---|
| Tabla | `snake_case`, **singular** | `anime`, `anime_cover`, `continue_link` |
| Columna | `snake_case` | `title_normalized`, `is_favorite`, `created_at` |
| Clave primaria | `id`, `uuid`, `defaultRandom()` | `id uuid primary key` |
| Clave foránea | `<tabla>_id` | `user_id`, `anime_id`, `site_id` |
| Índice | `idx_<tabla>_<columnas>` | `idx_anime_user_status` |
| Índice único | `uq_<tabla>_<columnas>` | `uq_anime_user_title_norm` |
| GIN / trigram | `idx_<tabla>_<col>_trgm` | `idx_anime_title_norm_trgm` |
| Enum de dominio | `text` + `CHECK`, **no** `pgEnum` | ver abajo |
| Símbolo TS | `camelCase` del nombre de tabla | `animeCover`, `continueLink` |

Drizzle: el objeto TS va en `camelCase`, la columna en `snake_case`. Siempre explícito:

```ts
export const anime = pgTable("anime", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  titleNormalized: text("title_normalized").notNull(),
  // …
});
```

## Tipos

- **Identificadores: `uuid` siempre.** Nunca `serial`/`bigserial` para entidades del usuario:
  un id secuencial filtra volumen y permite enumerar. Excepción: `genre.id` y
  `streaming_site.id` pueden ser `serial` por ser catálogo compartido, pero por coherencia
  también van en `uuid`.
- **Fechas: `timestamptz`**, nunca `timestamp` sin zona. `defaultNow()` en `created_at`.
  `updated_at` lo mantiene un trigger o la capa de repositorio, de forma consistente.
- **Email: `citext`** con `UNIQUE`. Requiere `CREATE EXTENSION citext`.
- **Dinero / puntuación: `numeric`**, nunca `float`. `score numeric(3,1)` (0.0–10.0).
- **Binarios: `bytea`.** Las portadas viven en la BD (ver `api-conventions.md` y la skill de
  dominio). No hay bucket obligatorio; Drive es un **espejo opcional**.
- **Listas cortas: `text[]`** (`synonyms`). Listas con atributos: tabla propia.
- **Estructuras libres: `jsonb`** (`import_job.report`, `ai_job.result`), nunca `json`.

### «Enums» de dominio

Se modelan como `text` + `CHECK`, **no** como `pgEnum`. Motivo: añadir un valor a un
`pgEnum` en Postgres es una migración incómoda y no reversible en la práctica; un `CHECK`
se reemplaza en una migración normal.

```sql
status text NOT NULL CHECK (status IN
  ('VISTO','VIENDO','EN_ESPERA','ABANDONADO','PENDIENTE'))
```

El tipo TypeScript se deriva de una constante única en `src/lib/domain/enums.ts`, que es la
que consumen Zod, Drizzle y la UI. Una sola lista, tres consumidores.

Dominios cerrados del proyecto:

| Columna | Valores |
|---|---|
| `anime.status` | `VISTO` `VIENDO` `EN_ESPERA` `ABANDONADO` `PENDIENTE` |
| `anime.format` | `TV` `MOVIE` `OVA` `ONA` `SPECIAL` |
| `genre.kind` | `OFICIAL` `IA` `USUARIO` |
| `progress.kind` | `COMPLETO` `TEMPORADA` `EPISODIO` `PORCENTAJE` `CUSTOM` |
| `streaming_site.kind` | `GRATIS` `PAGO` `MIXTO` |
| `ai_job.status` | `PENDIENTE` `OK` `ERROR` `OMITIDO` |

## Tablas que están vacías A PROPÓSITO

> **Ninguna de estas está rota. No escribas una migración para «arreglarlas».**

### `sessions` — vacía para siempre mientras la sesión sea JWT

El proveedor **Credentials de Auth.js v5 no funciona con sesiones de base de datos**:
fuerza la estrategia JWT. Como el proyecto ya va con JWT por decisión del encargo, no
cambia nada… salvo que **`sessions` no va a tener nunca una fila**.

Se crea igualmente porque retrofitearla el día que se active Google sería una migración
innecesaria.

**Y el adaptador de Drizzle NO está cableado.** `DrizzleAdapter` exige un esquema con SUS
nombres de columna (`name`, `image`, `refresh_token`, `access_token`…), mientras que el
nuestro usa `display_name`, `avatar_url` y camelCase por las convenciones de este
documento. Cablearlo hoy obligaría a **deformar el esquema para un adaptador que no se
usa**: con Credentials forzando JWT, ni `sessions` ni `accounts` reciben una fila.

Se añadirá el día que se active Google, y **ese** día se decide si se renombran las
columnas o se le pasa un mapeo. Hasta entonces, `@auth/drizzle-adapter` ni siquiera está
instalado.

| Tabla | Cuándo se llenará |
|---|---|
| `sessions` | nunca, mientras la estrategia sea JWT |
| `accounts` | el día que se active Google (hoy, vacía) |
| `verification_tokens` | cuando se active `AUTH_REQUIRE_EMAIL_VERIFICATION` |

### `neon_auth.*` — no es nuestra

Neon provisiona el esquema **`neon_auth`** con 9 tablas (`user`, `account`, `session`,
`organization`, `member`, `invitation`, `jwks`, `project_config`, `verification`) en cada
rama. Es **Neon Auth**, su propio producto, y **no lo usamos**: nuestra autenticación es
Auth.js sobre `public`.

Cuidado con `neon_auth.user` frente a `public.users`: se parecen lo suficiente como para
que alguien consulte la equivocada. `scripts/verificar-esquema.ts` lista los esquemas
ajenos en cada ejecución precisamente para que estén a la vista.

## Integridad

- **`ON DELETE CASCADE`** desde `users` hacia abajo y desde `anime` hacia sus hijas.
  El borrado de cuenta debe ser real y completo (ver `security.md` §3).
- `NOT NULL` por defecto. Una columna nullable tiene que poder justificarse en una frase.
- Restricción única de deduplicación: `UNIQUE (user_id, title_normalized)`, nombrada
  `uq_anime_user_title_norm`. Es la última línea de defensa: la app comprueba antes, pero
  la BD es quien garantiza. Una violación de esta restricción se traduce a
  `ANIME_DUPLICADO`, nunca a un 500.
- `anime_genre` y `progress` tienen PK compuesta / PK = FK. `progress.anime_id` es a la vez
  PK y FK: un anime tiene como mucho una fila de progreso.

## Extensiones requeridas

```sql
CREATE EXTENSION IF NOT EXISTS citext;      -- email case-insensitive
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- similitud difusa de títulos
CREATE EXTENSION IF NOT EXISTS unaccent;    -- búsqueda sin acentos
```

Tres, no cuatro. **`pgcrypto` no se usa:** `gen_random_uuid()` es nativo en Postgres desde
la 13, y no se emplea `crypt()`, `digest()`, `hmac()` ni `pgp_*` — las contraseñas se
hashean con Argon2id **en Node** y los tokens con sha256 **en Node**. Si algún día hiciera
falta una función criptográfica *dentro* de la base, se añade entonces y se justifica.

Van en la **primera migración** (`drizzle/0000_extensiones.sql`), antes de cualquier tabla.
drizzle-kit **no modela extensiones**: genera SQL que usa `citext` y `gin_trgm_ops` sin
crearlos. Si se regenera el esquema desde cero, esa migración hay que conservarla a mano o
el SQL falla en la primera columna `citext` de `users`.

### Las extensiones son por RAMA de Neon, no por proyecto

Una rama nueva (`development`, `preview/*`, `production`) **nace sin ellas**. Aplicar
`0000_extensiones.sql` es el primer paso en cada rama, y está en el checklist de
`/project:deploy`. Si `neondb_owner` no pudiera crear alguna, **se avisa y se para**: no se
rodea con `lower()` a mano ni con un índice funcional improvisado, porque eso desactiva
silenciosamente la deduplicación insensible a mayúsculas.

## Índices

Se crea índice cuando hay un `WHERE`, un `ORDER BY` o un `JOIN` que lo usa. Ni antes
(cuesta escrituras) ni después de que duela.

| Índice | Para |
|---|---|
| `uq_anime_user_title_norm` UNIQUE (`user_id`,`title_normalized`) | deduplicación exacta |
| `idx_anime_title_norm_trgm` GIN (`title_normalized` gin_trgm_ops) | similitud > 0.55 |
| `idx_anime_search_trgm` GIN sobre `unaccent(title)` + alternativos | buscador global |
| `idx_anime_user_status` (`user_id`,`status`) | faceta de estado |
| `idx_anime_user_updated` (`user_id`,`updated_at` DESC) | orden «actualizado» |
| `idx_anime_user_anilist` (`user_id`,`anilist_id`) WHERE `anilist_id` IS NOT NULL | dedup por AniList |
| `idx_anime_genre_genre` (`genre_id`) | faceta de género |
| `idx_continue_link_anime_used` (`anime_id`,`last_used_at` DESC) | enlace más reciente |
| `idx_anime_cover_checksum` (`checksum`) | reutilizar bytes ya descargados |

`title_normalized` **siempre** se compara en minúsculas y ya normalizado desde la app: el
índice trigram no sirve si la query aplica funciones encima de la columna.

## Migraciones

- Se generan con `npm run db:generate` (drizzle-kit) a partir del esquema TS. **El esquema TS es
  la fuente de verdad**, no el SQL.
- El SQL generado **se revisa a mano** antes de commitear. drizzle-kit no adivina intenciones:
  un rename lo interpreta como drop+create y eso **pierde datos**.
- Se aplican con `npm run db:migrate`. `npm run db:push` es **solo para desarrollo local**;
  jamás contra la base de producción.
- Toda migración se commitea junto al cambio de esquema que la produce. Nunca sueltas.
- **Reversibilidad:** cada migración lleva, en un comentario de cabecera, el SQL de reversión.
  Si no es reversible (un `DROP COLUMN` con datos), se dice explícitamente y se hace en dos
  pasos: primero dejar de usar la columna y desplegar, después borrarla.
- **Orden seguro para cambios con datos:** añadir columna nullable → backfill → poner
  `NOT NULL` → borrar la vieja. Nunca las cuatro cosas en una migración.
- Nada de `DROP TABLE`/`DROP COLUMN` en una migración que además añade features.
  Las destructivas van solas y anunciadas.

## Consultas

- Consultas siempre por el filtro de propiedad primero (ver `security.md` §1).
- Prohibido el **N+1**: si pintas 83 cards con su progreso y su portada, es **un** `JOIN`
  o un `IN (...)`, no 83 consultas. Los repositorios devuelven agregados listos para la vista.
- La paginación es por **keyset** (`WHERE (updated_at, id) < (?, ?)`), no por `OFFSET`, en
  cualquier listado que pueda crecer.
- Los bytes de las portadas **nunca** se seleccionan en un listado. `anime_cover.bytes` y
  `thumb_bytes` solo se leen en `/api/covers/[animeId]`. En los listados se selecciona
  `checksum` (para la URL versionada) y nada más.
- Transacciones (`db.transaction`) para toda operación multi-tabla: crear anime + portada +
  progreso es **una** transacción.

## Conexión

- `@neondatabase/serverless`. En Route Handlers y Server Actions se usa el driver HTTP
  (`neon(...)`) que no mantiene socket: es lo correcto en funciones serverless.
- Para el seed, la importación masiva y los scripts CLI se usa `Pool` (WebSocket), que sí
  soporta transacciones largas.
- **Una sola instancia** exportada desde `src/lib/db/index.ts`. Nada de crear clientes sueltos.
- `DATABASE_URL` con `?sslmode=require`. En Neon, la cadena *pooled* para la app y la
  *unpooled* (`DATABASE_URL_UNPOOLED`) para migraciones y scripts.
