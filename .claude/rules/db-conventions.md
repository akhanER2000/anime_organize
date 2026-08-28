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
  `updated_at` lo escribe **la capa de repositorio**, no un trigger: `grep -rn TRIGGER
  drizzle/` no devuelve nada y no hay ninguno en el esquema. Las columnas se declaran
  `.notNull().defaultNow()` y cada `update` del vault pone `updatedAt: new Date()` a mano.
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

## Dos relojes, y no coinciden

`users.sessions_valid_from` es la única columna del esquema a la que se le
**quitó** el `DEFAULT`, y es a propósito. Que otras columnas `NOT NULL` tampoco
lo tengan —`users.email`, `anime.title`, `sessions.expires`,
`password_reset_tokens.expires_at` y unas cuantas más— es lo normal: ninguna
llegó a tenerlo nunca. Aquí el default **existía** —lo puso
`0002_sesiones_y_rate_limit.sql`—, escribía la marca con el reloj equivocado, y
`0003_corte_de_sesion_sin_default.sql` lo eliminó. Es el único `DROP DEFAULT` de
toda la carpeta `drizzle/`.

Esa marca se compara contra la marca de emisión del JWT, que escribe la
**aplicación**. Un `DEFAULT now()` la escribiría con el reloj de **Postgres**, y
los dos relojes no son el mismo. Medido contra la rama `development` de Neon
desde esta máquina:

```
desfase db-app = 737 ms   (ida y vuelta 496 ms)
desfase db-app = 718 ms   (ida y vuelta 454 ms)
desfase db-app = 569 ms   (ida y vuelta 153 ms)
desfase db-app = 566 ms   (ida y vuelta 150 ms)
```

Con ~600 ms de desfase, un usuario que inicia sesión inmediatamente después de
registrarse obtiene una marca de emisión **anterior** a su propio corte y la
sesión se considera revocada nada más nacer. El registro con entrada automática
habría estado roto desde el primer día, y en producción habría parecido
aleatorio.

Al no haber default, **omitir el valor es un error de compilación** (Drizzle lo
exige en el `insert`), no un valor silenciosamente escrito con el reloj
equivocado. Se escribe siempre así:

```ts
sessionsValidFrom: marcaDeRevocacion(new Date()),
```

Regla general que se deriva: **si dos marcas se van a comparar entre sí, tienen
que salir del mismo reloj.** Mezclar `now()` de Postgres con `Date.now()` de
Node es correcto para auditoría (`created_at`) y es un fallo para cualquier
comparación de seguridad.

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
| `idx_anime_search_trgm` GIN sobre `unaccent(title)` + alternativos | buscador global — **previsto, NO creado** (ver nota) |
| `idx_anime_user_status` (`user_id`,`status`) | faceta de estado |
| `idx_anime_user_updated` (`user_id`,`updated_at` DESC) | orden «actualizado» |
| `idx_anime_user_anilist` (`user_id`,`anilist_id`) WHERE `anilist_id` IS NOT NULL | dedup por AniList |
| `idx_anime_genre_genre` (`genre_id`) | faceta de género |
| `idx_continue_link_anime_used` (`anime_id`,`last_used_at` DESC) | enlace más reciente |
| `idx_anime_cover_checksum` (`checksum`) | reutilizar bytes ya descargados |

De los nueve, ocho existen en `drizzle/`. **El buscador global no tiene índice propio, y es
una decisión, no un olvido.** `vault.buscar` resuelve por dos vías: `title_normalized LIKE`,
y `unaccent(…) ILIKE` sobre `title`, `title_english`, `title_native`, los sinónimos y las
notas, que va sin índice. `idx_anime_search_trgm` no se crea por dos motivos comprobables: el
vault tiene 83 filas y la regla de arriba dice «ni antes, que cuesta escrituras, ni después
de que duela» —a 83 filas el recorrido secuencial es instantáneo—; y `unaccent()` es
`STABLE`, no `IMMUTABLE`, así que **Postgres rechaza indexarla** tal como está escrita aquí.
Haría falta una función envoltorio marcada `IMMUTABLE`, que es una migración con su propia
decisión detrás, y marcar `IMMUTABLE` algo que no lo es corrompe el índice en silencio. Está
escrito también en `src/lib/db/vault.ts`, junto a la consulta, para que dentro de un año no
se tome por olvido.

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

## EL CONTRATO DE DATOS · no se puede consultar sin contexto de usuario

> **Disciplina convertida en imposibilidad.** No hay que *acordarse* de filtrar por
> `user_id`: no se puede construir una consulta sin un contexto de usuario, y olvidarlo es
> un error de compilación, no un fallo en producción.

### Cómo se usa. No hay otra forma.

```ts
const { ctx } = await exigirSesionParaLeer();   // o exigirSesionParaMutar()
const vault = vaultDe(ctx);

const mios = await vault.listar();
const uno  = await vault.obtener(id);   // null si no existe O no es suyo
```

Para varias operaciones atómicas:

```ts
await enTransaccion(ctx, async (vault) => {
  const creado = await vault.crear({ titulo, estado: "PENDIENTE" });
  // …portada y progreso: todo o nada
});
```

### Las cuatro capas, y qué hace cumplir cada una

| Capa | Lo hace cumplir | Cómo se saltaría |
|---|---|---|
| No se puede **forjar** un `ContextoUsuario` | **el compilador** | no se puede: clase con campo `#` privado, tipada nominalmente |
| No se puede construirlo con `new` | **el compilador** | no se puede: constructor `private` |
| No hay vault **sin** contexto | **el compilador** | no se puede: parámetro obligatorio |
| No se **castea** a `ContextoUsuario` | ESLint | con un `eslint-disable`, que se ve en el diff |
| No se alcanza la **tabla cruda** ni el cliente sin filtro | ESLint | ídem |
| La consulta **lleva el filtro** | tests por mutación | rompiendo un test que se pone rojo |

**Dónde está el hueco, dicho sin adornos:** TypeScript no puede comprobar que un `WHERE`
concreto contenga `user_id` — eso es una propiedad del *valor*, no del tipo. Lo que sí
garantiza es que nadie llegue a escribir ese `WHERE` por su cuenta. Las consultas se
escriben **una vez**, en `src/lib/db/vault.ts`, donde el filtro viene dado por `mias()` y
`mio(id)`, y cada una tiene su test de mutación.

Las dos aserciones que el compilador **no** puede bloquear —`{...} as ContextoUsuario`— las
para ESLint con `no-restricted-syntax`. Un `eslint-disable` para saltárselo aparece en el
diff y no pasa la revisión.

### Verificado en cada ejecución de CI

`npm run lint:contrato` escribe **doce** ficheros que intentan saltarse el contrato,
comprueba que los doce son rechazados, y los borra. Incluye un **control positivo** —el uso
correcto, que SÍ debe compilar— para que un `tsconfig` roto no dé verde por el motivo
equivocado.

Siete son los originales; los **cinco** restantes los encontró el ataque adversarial del
2026-08-23, y son los que entonces pasaban: fabricar un contexto con el helper de pruebas,
conectar al driver a pelo, usar el cliente de pruebas desde la aplicación, esquivar el lint
con un `import()` dinámico y alcanzar el módulo de propiedad con un `userId` suelto. El
número que manda es `INTENTOS.length` de `scripts/verificar-contrato.mjs`, que el script
imprime al terminar; su comentario de cabecera todavía dice «siete» y va por detrás.

Está verificado a su vez por mutación: al quitar la regla del casteo, el script se pone en
rojo señalando exactamente ese hueco.

### Dos drivers, y no es capricho

`neon-http` **no soporta transacciones interactivas**: cada consulta es una petición
independiente. Es lo correcto para una consulta suelta en una función serverless, y es lo
que usa la aplicación por defecto.

Por eso `enTransaccion()` es una **función aparte** y no un método del vault: abre su propio
cliente por WebSocket. Si fuera un método, se podría llamar sobre un vault con cliente HTTP
y fallar en runtime. Otra vez lo mismo — la forma de la API impide el error en vez de
advertir de él.

### Quién puede tocar la capa cruda

| Sitio | Por qué |
|---|---|
| `src/lib/db/**` | es la capa de datos: para eso existe |
| `src/auth.ts` | autentica por `users.id` **antes** de que exista un contexto — es lo que está creando |
| `src/lib/rate-limit/**` | `rate_limit_bucket` no pertenece a ningún usuario: no tiene `user_id` |

Cualquier otro sitio es un error de lint con un mensaje que explica qué hacer en su lugar.

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
- `Pool` (WebSocket) es **solo** para las migraciones y la verificación de esquema
  (`scripts/migrate.ts`, `scripts/verificar-esquema.ts`): el DDL va en transacción y el
  pooler no es el sitio para eso.
- El **seed**, el **enriquecimiento** y la **importación** van por el mismo driver HTTP que
  la aplicación: `scripts/seed.ts` y `scripts/enrich.ts` llaman a `dbInterna()`, y
  `POST /api/import` entra por `vaultDe(...)`. No hay una vía privilegiada para los scripts,
  y es deliberado. Cuando hace falta atomicidad sobre HTTP se usa `batch()`, que Neon ejecuta
  como **una** transacción: es lo que hacen los dos sitios de `src/lib/db/cuentas.ts`.
- **`conTransaccion()` no se usa desde la aplicación, y el motivo está medido.** Abre un
  `Pool` por WebSocket, y `ws` empaquetado dentro del servidor de Next revienta con
  `TypeError: b.mask is not a function`; además abrirlo y cerrarlo costaba ~1.180 ms contra
  los ~9 ms del camino señuelo, lo que convertía el formulario de recuperación en un oráculo
  de tiempo (`security.md` §2). `enTransaccion()` —su envoltorio con contexto— sigue
  exportado desde `src/lib/db/index.ts` y documentado arriba, pero **hoy no lo llama nadie**:
  en `src/` y `scripts/` solo están su definición en `src/lib/db/vault.ts` y el reexport. Si
  vuelve a hacer falta, que sea desde un script CLI, nunca desde una Server Action ni un
  Route Handler.
- **Una sola instancia** del cliente HTTP, memoizada en `src/lib/db/interno.ts` (`dbInterna()`)
  y marcada `@internal`. `src/lib/db/index.ts` **no** exporta el cliente: exporta `vaultDe`,
  `enTransaccion`, `ContextoUsuario` y los tipos, y eso es todo lo que la aplicación toca —lo
  que no se puede importar no se puede usar sin filtro—. ESLint prohíbe `@/lib/db/interno` en
  todo `src/**` salvo las tres excepciones de § «Quién puede tocar la capa cruda», y también
  su `import()` dinámico; `scripts/**` queda fuera de esa regla, que es por donde lo alcanzan
  `seed` y `enrich`. El cliente por WebSocket no se comparte: `conTransaccion()` crea su
  `Pool` bajo demanda y lo cierra en el `finally`, porque un socket abierto en una función
  serverless es una fuga. Nada de crear clientes sueltos.
- `DATABASE_URL` con `?sslmode=require`. En Neon, la cadena *pooled* para la app **y también
  para el seed y `enrich`**, que van por `dbInterna()` → `textoObligatorio("DATABASE_URL")`.
  La *unpooled* (`DATABASE_URL_UNPOOLED`) la prefieren **solo** `db:migrate`, `db:verificar`,
  `drizzle.config.ts` y `conTransaccion()`.
- **Al operar contra producción se pasan las DOS en la línea de comandos.** Si se pasa una
  sola, la otra sigue valiendo lo de `.env.local` y media operación acaba en la rama
  equivocada mientras el anuncio de destino dice la verdad sobre la que anuncia. Es el fallo
  número 6 de `testing.md`, y lo que `exigirMismaRama()` de `scripts/rama-destino.ts` está
  ahí para parar antes de escribir nada.
