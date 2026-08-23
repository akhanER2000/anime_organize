# Regla · Convenciones de API

Dos formas de mutar, y solo dos:

- **Server Actions** — para todo lo que nace de un formulario o de un botón de la UI
  (crear anime, editar, borrar, marcar progreso, cambiar ajustes). Viven en
  `src/app/**/actions.ts` con `"use server"` al principio del archivo.
- **Route Handlers** — para lo que necesita un contrato HTTP de verdad: binarios,
  descargas, subidas, procesos largos, y todo lo que un cliente externo o un script pueda
  llamar (`/api/covers`, `/api/enrich`, `/api/import`, `/api/export`).

Nada de una tercera vía. Nada de mutar desde un `GET`.

## Forma de la respuesta

Toda respuesta JSON es un sobre discriminado. Sin excepciones, para que el cliente
tenga un único punto de parseo.

```ts
type Respuesta<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { codigo: CodigoError; mensaje: string; detalles?: unknown } };
```

- `mensaje` está **en español** y es apto para enseñárselo al usuario tal cual.
- `detalles` solo se rellena con errores de validación de campo:
  `{ campo: "titulo", motivo: "REQUERIDO" }[]`. **Nunca** un stack trace, un SQL,
  un hostname interno ni el error del driver.
- Las Server Actions devuelven el mismo sobre (no lanzan al cliente), para que el formulario
  pueda pintar el error sin `try/catch` en el componente.

Las respuestas binarias (`/api/covers/[id]`, `/api/export`) no llevan sobre: devuelven el
binario con sus cabeceras. Sus errores sí lo llevan.

## Códigos de error

`codigo` es un identificador estable en `SCREAMING_SNAKE_CASE`, definido en
`src/lib/api/errors.ts`. El cliente ramifica por `codigo`, nunca por `mensaje`.

| Código | HTTP | Cuándo |
|---|---|---|
| `NO_AUTENTICADO` | 401 | no hay sesión |
| `NO_ENCONTRADO` | 404 | no existe **o no es tuyo** (ver `security.md` §1) |
| `VALIDACION` | 422 | Zod falló; `detalles` lleva los campos |
| `ANIME_DUPLICADO` | 409 | choca con `uq_anime_user_title_norm` |
| `ANIME_SIMILAR` | 200 | **no es error**: candidatos en `data.similares` |
| `LIMITE_EXCEDIDO` | 429 | rate limit; incluye `Retry-After` |
| `IMAGEN_NO_DESCARGABLE` | 422 | la URL no dio una imagen válida o fue bloqueada |
| `IMAGEN_DEMASIADO_GRANDE` | 413 | > 8 MB |
| `TIPO_NO_SOPORTADO` | 415 | mime fuera de jpeg/png/webp/avif |
| `PROVEEDOR_NO_DISPONIBLE` | 502 | AniList o Anthropic caídos o con error |
| `IA_NO_CONFIGURADA` | 200 | falta `ANTHROPIC_API_KEY`: se avisa, no se rompe |
| `CONFLICTO_ESTADO` | 409 | operación imposible en el estado actual |
| `ERROR_INTERNO` | 500 | lo inesperado; se loguea con id de correlación |

`ANIME_SIMILAR` e `IA_NO_CONFIGURADA` van con **200 y `ok: true`**: son resultados esperados
del flujo, no fallos. El duplicado *exacto* sí es 409.

## Validación

- **Todo** input pasa por Zod antes de tocar lógica: body, `searchParams`, `FormData`,
  parámetros de ruta, y también las respuestas de AniList y de Claude.
- Los esquemas viven en `src/lib/validation/*.ts` y se **comparten** entre cliente
  (react-hook-form + `zodResolver`) y servidor. Un solo esquema por concepto.
- El servidor **nunca** confía en la validación del cliente. Se revalida siempre.
- Helper obligatorio en Route Handlers:

```ts
export const POST = withAuth(withRateLimit("covers", async (req, { session }) => {
  const body = await parseJson(req, EsquemaCrearPortada);   // lanza VALIDACION
  // …
}));
```

`withAuth` inyecta la sesión y corta con `NO_AUTENTICADO`. `withRateLimit` aplica la tabla
de `security.md` §5. `parseJson` valida y normaliza. Ningún handler los salta.

## Nombres de ruta

- En **español**, `kebab-case`, sustantivo en plural para colecciones:
  `/api/animes`, `/api/covers`, `/api/sitios`, `/api/enrich`.
  (`covers` y `enrich` se quedan en inglés porque el enunciado del proyecto los fija así.)
- Sin verbos en la ruta: el verbo es el método HTTP.
  `POST /api/animes`, no `/api/crear-anime`.
- Acciones que no son CRUD van como sub-recurso:
  `POST /api/sitios/comprobar`, `POST /api/enrich/batch`.

### Peticiones salientes: `fetch`, nunca un comando de shell

Toda petición HTTP que haga la aplicación se escribe con **`fetch` dentro del código**.
Nunca se invoca `curl`, `wget` ni `Invoke-WebRequest` desde un script, un hook o una
Server Action. Están denegados en `.claude/settings.json` a propósito: un binario de red
arbitrario es la vía más corta para exfiltrar un secreto, y además no es desplegable —
en Vercel no existe una shell.

El caso concreto que más se presta a equivocarse es **«Comprobar espejos»** (§8 del
encargo). No es un comando: es un Route Handler.

```ts
// POST /api/sitios/comprobar  — comprueba qué espejos siguen vivos
const res = await fetch(mirror.url, {
  method: "HEAD",
  redirect: "manual",
  signal: AbortSignal.timeout(5_000),
  headers: { "user-agent": "AnimeVault/1.0 (comprobador de espejos)" },
});
// Caído => is_active = false. NUNCA se borra un espejo automáticamente.
await tx.update(streamingMirror)
  .set({ isActive: res.ok, lastCheckedAt: new Date() })
  .where(eq(streamingMirror.id, mirror.id));
```

Reglas de esa comprobación: concurrencia limitada (los espejos suelen compartir CDN y
caen a la vez), timeout corto, `redirect: "manual"` (un 302 a un interstitial no es un
espejo vivo), y **rate limit por usuario** — es un endpoint que dispara peticiones a
terceros, así que está en la tabla de `security.md` §5.

| Método | Semántica |
|---|---|
| `GET` | lee. **Nunca** muta. Cacheable. |
| `POST` | crea o ejecuta un proceso |
| `PATCH` | actualiza parcialmente (lo normal en esta app) |
| `PUT` | reemplaza entero (casi no se usa) |
| `DELETE` | borra |

## Caché

- Por defecto, todo lo que depende de la sesión es **dinámico**: `export const dynamic =
  "force-dynamic"` o lectura de `cookies()`. Nunca se cachea una página con datos de un
  usuario concreto.
- Revalidación por etiqueta tras mutar: `revalidateTag("animes:" + userId)`.
  Las etiquetas **siempre** llevan el `userId` dentro. Una etiqueta global cachearía datos de
  un usuario para otro.
- `/api/covers/[animeId]` es la excepción y es intencionada:
  `Cache-Control: public, max-age=31536000, immutable` + `ETag = checksum`.
  Es seguro porque la URL lleva `?v=<checksum>` y el id es un uuid no adivinable, y porque
  antes de servir se comprueba la propiedad. Responde **304** cuando `If-None-Match` coincide.

## Paginación y filtros

- El estado de filtros vive en la **URL** (`searchParams`), no en el cliente: una vista se
  comparte pegando el enlace.
- Se parsean con un esquema Zod (`EsquemaFiltros`) que aplica valores por defecto y descarta
  basura sin romper la página.
- Facetas múltiples se repiten: `?estado=VISTO&estado=VIENDO`.
- Paginación por keyset: `?cursor=<opaco>&limite=50`. `limite` máximo 100.
- La respuesta paginada lleva `{ items, siguienteCursor, total }`.

## Procesos largos

`/api/enrich/batch` no bloquea una petición durante minutos:

1. `POST` crea un `ai_job` por anime y devuelve `{ loteId }` **inmediatamente**.
2. La UI hace *polling* a `GET /api/enrich/batch/[loteId]` (o consume un stream SSE) y pinta
   la barra de progreso con `{ total, hechos, errores, actual }`.
3. El trabajo respeta el rate limit de AniList (90 req/min): cola con **concurrencia 3** y
   backoff exponencial con jitter.

Nada de `await` de 90 peticiones dentro de un Route Handler: en Vercel se corta por timeout.

## Idempotencia

- `POST /api/covers` con la misma imagen (mismo `sha256`) reutiliza los bytes existentes del
  usuario y no vuelve a descargar ni a reprocesar.
- `POST /api/enrich` sobre un anime ya enriquecido **no** vuelve a consultar, salvo
  `{ reanalizar: true }`.
- El seed es idempotente: se puede correr N veces y el resultado es el mismo.

## Registro de errores

- Un `ERROR_INTERNO` se loguea en el servidor con un `requestId` (uuid) que **también** se
  devuelve al cliente en `error.detalles.requestId`. Así el usuario puede reportar «me salió
  este id» sin que le enseñemos las tripas.
- Nunca se loguea: contraseña, `password_hash`, token de reset, `AUTH_SECRET`,
  `ANTHROPIC_API_KEY`, ni el email completo en logs de producción.
