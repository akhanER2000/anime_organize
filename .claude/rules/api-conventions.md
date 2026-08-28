# Regla · Convenciones de API

Dos formas de mutar, y solo dos:

- **Server Actions** — para todo lo que nace de un formulario o de un botón de la UI
  (crear anime, editar, borrar, marcar progreso, cambiar ajustes). Viven en
  `src/app/**/acciones.ts` con `"use server"` en la primera línea del archivo. En
  **español**, no `actions.ts`: son dominio, no framework (`code-style.md` § Idioma).
  Cuando un módulo acumula varias familias se parte por tema con sufijo —
  `acciones-sitios.ts`, `acciones-importar.ts`, `acciones-peligro.ts`,
  `acciones-enriquecer.ts`. Hoy son diez ficheros.
- **Route Handlers** — para lo que necesita un contrato HTTP de verdad: binarios,
  descargas, subidas, procesos largos, y todo lo que un cliente externo o un script pueda
  llamar. **Hoy son dos**, y conviene saberlo antes de buscar el tercero:
  `GET /api/covers/[animeId]`, que sirve el binario de la portada, y `POST /api/import`,
  que recibe la hoja y devuelve el plan sin escribir nada. (El tercer `route.ts` del
  proyecto es el de Auth.js, que no es nuestro.)
  `/api/enrich` está previsto para el enriquecimiento por lotes pero **todavía no
  existe**: hoy se enriquece con la Server Action `enriquecerAnime`
  (`src/app/app/anime/[id]/acciones-enriquecer.ts`) y con el CLI `npm run enrich`
  (`scripts/enrich.ts`).
  **No hay `/api/export` y no lo va a haber**: `security.md` §2 ter prohíbe exponer el
  export por un `GET` —con la cookie puesta, cualquier página podría hacer que el
  navegador lo visitara—, así que la exportación es la Server Action `exportarVault`
  (`src/app/app/ajustes/acciones-peligro.ts`) y la descarga la provoca el cliente.

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

La única respuesta binaria es la de `GET /api/covers/[animeId]`, y no lleva sobre: devuelve
el binario con sus cabeceras. Sus errores sí lo llevan. El export **no** es un binario
servido por HTTP: `exportarVault` devuelve el sobre con el objeto dentro y el cliente compone
el fichero.

## Códigos de error

> **Esta sección describe lo que HAY.** Apuntaba a un `src/lib/api/errors.ts` que **nunca
> existió**: los códigos siempre han vivido en `src/lib/api/respuesta.ts`. Y listaba dos
> códigos —`ANIME_SIMILAR` e `IA_NO_CONFIGURADA`— que tampoco existen en el código, porque
> por construcción del sobre **nada que responda `ok: true` puede llevar `codigo`**. Un
> puntero a un fichero fantasma manda a quien lee a buscar lo que no está, y hace que deje
> de fiarse del resto del documento. Se corrigió el 2026-08-28, al pillarlo.

`codigo` es un identificador estable en `SCREAMING_SNAKE_CASE`, definido en la constante
`CODIGOS` de `src/lib/api/respuesta.ts`, de la que se deriva el tipo `CodigoError`. El
cliente ramifica por `codigo`, nunca por `mensaje`. La tabla de abajo son **los once que
hay**: si un código no está en `CODIGOS`, no compila.

| Código | HTTP | Cuándo |
|---|---|---|
| `NO_AUTENTICADO` | 401 | no hay sesión |
| `NO_ENCONTRADO` | 404 | no existe **o no es tuyo** (ver `security.md` §1) |
| `VALIDACION` | 422 | Zod falló; `detalles` lleva los campos |
| `ANIME_DUPLICADO` | 409 | choca con `uq_anime_user_title_norm` |
| `LIMITE_EXCEDIDO` | 429 | rate limit; incluye `Retry-After` |
| `IMAGEN_NO_DESCARGABLE` | 422 | la URL no dio una imagen válida o fue bloqueada |
| `IMAGEN_DEMASIADO_GRANDE` | 413 | > 8 MB |
| `TIPO_NO_SOPORTADO` | 415 | mime fuera de jpeg/png/webp/avif |
| `PROVEEDOR_NO_DISPONIBLE` | 502 | AniList o Anthropic caídos o con error |
| `CONFLICTO_ESTADO` | 409 | operación imposible en el estado actual |
| `ERROR_INTERNO` | 500 | lo inesperado; se loguea con id de correlación |

El parecido por trigram y la falta de `ANTHROPIC_API_KEY` van con **200 y `ok: true`**: son
resultados esperados del flujo, no fallos. Por eso **no tienen fila arriba ni entrada en
`CODIGOS`**: la rama `ok: true` del sobre no lleva `error`, así que nada que responda 200
puede tener un `codigo`. El aviso viaja dentro de `data`:

| Caso | Qué devuelve de verdad | Dónde |
|---|---|---|
| anime parecido | `data = { clase: "PREGUNTA", candidatos }` — hasta 3, cada uno con `id` y `titulo` | `crearAnime`, `src/app/app/acciones.ts` |
| sin clave de Anthropic | `data.resultado.ia === "NO_CONFIGURADA"` y un `data.mensaje` ya redactado en español | `enriquecerAnime`, `src/app/app/anime/[id]/acciones-enriquecer.ts` |

Ojo con el nombre del campo: es `candidatos`, **no** `similares`. `similares` es la consulta
del vault que los busca (`src/lib/db/vault.ts`); lo que sale al cliente se llama
`candidatos`. Y sin clave de Anthropic el paso 1 —AniList— se guarda con normalidad: solo
se salta el análisis de Claude. Se avisa, no se rompe.

El duplicado *exacto* sí es 409 con `ANIME_DUPLICADO`.

## Validación

- **Todo** input pasa por Zod antes de tocar lógica: body, `searchParams`, `FormData`,
  parámetros de ruta, y también las respuestas de AniList y de Claude.
- Los esquemas viven en `src/lib/validation/*.ts` y se **comparten** entre cliente
  (react-hook-form + `zodResolver`) y servidor. Un solo esquema por concepto.
- El servidor **nunca** confía en la validación del cliente. Se revalida siempre.
- **No hay envoltorios de handler, y esto describía tres que no existen.** Decía que
  `withAuth`, `withRateLimit` y `parseJson` eran obligatorios y que «ningún handler los
  salta»; los tres tienen cero apariciones en el repositorio. Lo que hay: cada Route
  Handler que muta escribe sus guardas **a mano y en este orden** — CSRF → sesión →
  límite → cuerpo:

```ts
// POST /api/import — src/app/api/import/route.ts
export async function POST(peticion: Request): Promise<Response> {
  // 1. CSRF. Antes de nada: Next comprueba el origen de las Server Actions, de un
  //    Route Handler no comprueba nada (security.md §2 ter).
  const veredicto = comprobarOrigen({
    metodo: "POST",
    cabeceras: peticion.headers,
    origenesPermitidos: origenesPermitidos({ … }),
  });
  if (!veredicto.permitido) return json(fallo("NO_AUTENTICADO", "…"), 403);

  // 2. Sesión. Lanza `ErrorSesionInvalida`, que aquí se traduce a 401.
  const sesion = await exigirSesionParaMutar();

  // 3. Límite, ANTES de leer el cuerpo: parsear una hoja de 5 MiB cuesta CPU.
  const limite = await registrarIntento(
    "import:user",
    clavePorUsuario("import:user", sesion.userId),
  );
  if (!limite.permitido) return json(fallo("LIMITE_EXCEDIDO", "…"), 429, { "retry-after": … });

  // 4. Y solo entonces, el cuerpo.
}
```

`exigirSesionParaMutar()` y `exigirSesionParaLeer()` viven en `src/auth.ts` y devuelven la
sesión o lanzan `ErrorSesionInvalida`. `comprobarOrigen` y `origenesPermitidos` están en
`src/lib/api/csrf.ts` y **fallan cerrado** si no hay ni `Origin` ni `Referer`.
`registrarIntento` (`src/lib/rate-limit`) recibe **el nombre de la política tal y como está
escrito en `LIMITES`** —con su sufijo: `"import:user"`, `"covers:user"`, `"enrich:user"`…,
en `src/lib/rate-limit/politica.ts`—, nunca el prefijo a secas; la clave del cubo la compone
`clavePorUsuario`, y pasarle el `userId` pelado lanza (ver el comentario de
`registrarIntento`: los límites `*:user` acabarían compartiendo contador).

Que las guardas vayan sueltas significa que **hay que ponerlas todas, en cada ruta que
mute**: no hay nada que lo recuerde por ti. Son dos rutas; un envoltorio que esconde el
orden se rompe más fácil de lo que se lee. Si algún día pasan de dos, se escribe entonces y
esta sección se reescribe con él.

Hoy `POST /api/import` es el único Route Handler que muta. `/api/covers/[animeId]` exporta
**solo `GET`**: subir una portada no es un Route Handler, es parte de la Server Action
`crearAnime` (`src/app/app/acciones.ts`), y ahí la validación va con los esquemas de
`src/lib/validation/*` —`EsquemaCrearAnime`, que incluye `EsquemaUrlPortada`— llamados a
mano con `safeParse` y traducidos con `falloDeValidacion`.

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
encargo). No es un comando —nunca se invoca `curl` ni `wget`— pero **tampoco es un Route
Handler**: es la Server Action `comprobarEspejosDelUsuario`
(`src/app/app/ajustes/acciones-sitios.ts`). Esta regla lo dio por handler y `POST
/api/sitios/comprobar` no existe.

Se hizo Server Action porque nace de un botón y porque **Next comprueba el origen de las
Server Actions por su cuenta** (`security.md` §2 ter): un Route Handler habría necesitado
la guarda CSRF escrita a mano, que es una más que se puede olvidar. Lo que la regla exige
—el rate limit— sí está: `comprobar-espejos:user`, 10/hora.

```ts
// Server Action `comprobarEspejosDelUsuario` — qué espejos siguen vivos.
// El `fetch` real lo hace `comprobarEspejo` en `src/lib/red/comprobar-espejo.ts`.
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
