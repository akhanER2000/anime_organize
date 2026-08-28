import { z } from "zod";

import { ESTADOS } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ALTA DE UN ANIME — el esquema del artboard 06, compartido cliente/servidor.
 *
 * Un solo esquema por concepto (`api-conventions.md` § «Validación»): el modal
 * lo usa con `zodResolver` **por UX** y la Server Action lo revalida **por
 * seguridad**, sin fiarse de lo que llegue (`security.md` §8).
 *
 * ── LA REGLA QUE MANDA EN ESTE FICHERO ────────────────────────────────────
 *
 * **Un esquema compartido que TRANSFORMA tiene que aceptar su propia salida.**
 *
 * Aquí transforman seis campos: `urlPortada`, `notas` y `etiquetaProgreso`
 * convierten «no lo rellené» en `null`; `estado` y `esFavorito` rellenan un
 * valor por defecto; `titulo` recorta. Los seis viajan por la red entre los dos
 * parseos:
 *
 *     cliente:  entrada ──validar──▶ salida ──enviar──▶ servidor
 *     servidor: salida  ──validar──▶ tiene que valer LO MISMO
 *
 * Si la ENTRADA no acepta la SALIDA, el segundo parseo rechaza lo que produjo
 * el primero. Eso ya pasó en producción con `EsquemaNombre`: convertía `""` en
 * `null` en el cliente y el servidor rechazaba `null` con «expected string,
 * received null». **Todo registro que dejara el nombre en blanco fallaba** — el
 * caso NORMAL de un campo opcional. Sobrevivió al typecheck, al lint, a 499
 * tests y a la auditoría de seguridad; lo encontró un navegador al primer
 * intento.
 *
 * De ahí que los opcionales lleven `.nullish()` y no `.optional()`: `.nullish()`
 * admite `undefined` (no vino), `null` (vino vacío y ya normalizado) y `string`.
 * `.optional()` solo admite los dos extremos y deja fuera justo lo que el propio
 * esquema acaba de producir.
 *
 * El viaje de ida y vuelta de los seis campos está fijado en `anime.test.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Las cuatro formas de «no lo rellené» se colapsan en una.
 *
 * Ausente, `null`, `""` y `"   "` significan lo mismo para quien rellena el
 * formulario, así que tienen que producir lo mismo: `null`. Si no, la base
 * guardaría `""` unas veces y `null` otras, y cualquier `IS NULL` mentiría a
 * partir de ahí.
 */
function aNuloSiVacio(valor: string | null | undefined): string | null {
  return valor === undefined || valor === null || valor.length === 0 ? null : valor;
}

/**
 * El título. Es el ÚNICO campo obligatorio del alta.
 *
 * Se recorta pero **no se normaliza**: lo que el usuario escribió se guarda tal
 * cual en `anime.title`. `normalizarTitulo` produce `title_normalized`, que es
 * otra columna y otra responsabilidad (skill de dominio §1) — y se calcula en
 * el servidor, porque es la clave de deduplicación y no puede depender de lo
 * que mande el cliente.
 *
 * El tope de 200 sale de los datos reales, no de una intuición: el título más
 * largo de los 83 del vault mide 68 caracteres. 200 deja sitio de sobra a los
 * títulos kilométricos de AniList sin dejar el campo sin cota — un `text` de
 * Postgres acepta megabytes, y este valor alimenta un `UNIQUE` y un índice
 * trigram.
 */
export const EsquemaTitulo = z
  .string({ error: "Escribe el título del anime" })
  .trim()
  .min(1, "Escribe el título del anime")
  .max(200, "Ese título es demasiado largo: máximo 200 caracteres");

/**
 * El estado, de la lista cerrada de `ESTADOS`. Por defecto, `PENDIENTE`.
 *
 * La lista NO se reescribe aquí: sale de `src/lib/domain/enums.ts`, que es de
 * donde beben también el `CHECK` de Drizzle y los chips de la interfaz
 * (`db-conventions.md` § «Enums de dominio»). Una segunda copia acabaría
 * ofreciendo un estado que la base rechaza, y eso se ve como un 500 aleatorio.
 *
 * `PENDIENTE` como defecto es lo correcto para un alta: lo que se acaba de
 * añadir y todavía no se ha tocado está pendiente de ver.
 */
export const EsquemaEstado = z
  .enum(ESTADOS, { error: "Elige uno de los estados de la lista" })
  .default("PENDIENTE");

/**
 * ¿Solo `http:` y `https:`? Sí, y se decide con el parser de URL.
 *
 * **No con `startsWith`**: ` javascript:` con espacios delante y `java\tscript:`
 * con un tabulador en medio esquivan una comparación de cadenas —el navegador
 * los ejecuta igual— y no esquivan al parser. Están fijados en el test.
 *
 * **Por qué no se reutiliza `esHrefSeguro` de `src/lib/ui/href.ts`**, que es la
 * pregunta obvia: esa función acepta además los enlaces internos (`/algo`,
 * `#algo`) porque su trabajo es decidir si algo se puede pintar como `href`.
 * Aquí hace falta lo contrario: una dirección **absoluta** que el servidor
 * pueda ir a descargar. `/portada.jpg` es un `href` perfectamente seguro y una
 * URL de origen inservible.
 */
function esUrlDescargable(valor: string): boolean {
  try {
    const protocolo = new URL(valor).protocol;
    return protocolo === "https:" || protocolo === "http:";
  } catch {
    // Ni siquiera es una URL absoluta: no hay nada que ir a descargar.
    return false;
  }
}

/**
 * La URL de la portada. OPCIONAL — se da de alta un anime sin imagen.
 *
 * ── ESTO NO ES LA DEFENSA CONTRA SSRF, Y NO PUEDE CONFUNDIRSE CON ELLA ─────
 *
 * Comprobar el esquema `http(s)` es la primera puerta, no la única. La URL la
 * escribe el usuario y el servidor la descarga, así que el bloqueo de rangos
 * privados, el pin de la IP resuelta, el límite de saltos, el timeout, el tope
 * de tamaño y los magic bytes viven en el pipeline de portadas
 * (`security.md` §4). `https://127.0.0.1/x.png` pasa este esquema —es una URL
 * https perfectamente formada— y tiene que morir en la descarga.
 *
 * El tope de 2048 es para que el parseo no salga gratis al que lo envía:
 * `new URL()` sobre una cadena de megabytes es trabajo regalado.
 */
export const EsquemaUrlPortada = z
  .string({ error: "Pega la dirección de una imagen" })
  .trim()
  .max(2048, "Esa dirección es demasiado larga: máximo 2048 caracteres")
  .nullish()
  .transform(aNuloSiVacio)
  .refine(
    (valor) => valor === null || esUrlDescargable(valor),
    "La dirección de la imagen tiene que empezar por http:// o https://",
  );

/**
 * Marcar como favorito al dar de alta. Por defecto, no.
 *
 * `anime.is_favorite` es `NOT NULL DEFAULT false`: aquí no puede acabar en
 * `null`, así que lleva `.default(false)` y no `.nullish()`.
 */
export const EsquemaFavorito = z
  .boolean({ error: "El campo de favorito solo admite sí o no" })
  .default(false);

/**
 * Notas del usuario. Opcionales y libres — `anime.notes` es nullable.
 *
 * 4000 caracteres son unas dos páginas: de sobra para lo que cabe en una nota,
 * y una cota para que el campo no acabe siendo un depósito de megabytes.
 */
export const EsquemaNotas = z
  .string({ error: "Las notas tienen que ser texto" })
  .trim()
  .max(4000, "Las notas son demasiado largas: máximo 4000 caracteres")
  .nullish()
  .transform(aNuloSiVacio);

/**
 * La etiqueta de progreso: el texto que pinta la interfaz («Solo 1ra
 * Temporada», «En Proceso», «Temporada 2 · episodio 7»).
 *
 * Se conserva **tal cual la escribe el usuario**, no reescrita por nosotros
 * (skill de dominio §4). Es opcional en el alta: si no se rellena, el servidor
 * la deriva del progreso que corresponda.
 *
 * El tope de 80 sale otra vez de los datos: la más larga de las tres etiquetas
 * del seed mide 21 caracteres, y esto es el texto de una línea dentro de una
 * card, no un campo de notas.
 */
export const EsquemaEtiquetaProgreso = z
  .string({ error: "La etiqueta de progreso tiene que ser texto" })
  .trim()
  .max(80, "Esa etiqueta es demasiado larga: máximo 80 caracteres")
  .nullish()
  .transform(aNuloSiVacio);

/**
 * El alta completa, tal y como la envía el modal del artboard 06.
 *
 * `z.object` **descarta las claves que no conoce**, así que un campo de más en
 * el `FormData` —un `utm_source`, un input oculto, un cliente antiguo— entra y
 * sale sin efecto y sin romper el parseo. No hace falta una lista negra.
 */
export const EsquemaCrearAnime = z.object({
  titulo: EsquemaTitulo,
  estado: EsquemaEstado,
  urlPortada: EsquemaUrlPortada,
  esFavorito: EsquemaFavorito,
  notas: EsquemaNotas,
  etiquetaProgreso: EsquemaEtiquetaProgreso,
});

/**
 * Lo que SALE del esquema: todo resuelto, sin `undefined`.
 *
 * No se llama `DatosCrearAnime` a propósito: ese nombre ya existe en
 * `src/lib/db/vault.ts` con otra forma —lleva `formato`, `anio` y `anilistId`,
 * y no lleva `urlPortada` ni `etiquetaProgreso`, que no son columnas de
 * `anime`—. Dos tipos distintos con el mismo nombre es exactamente la deriva
 * que este proyecto intenta impedir. La Server Action traduce de este a aquel.
 */
export type DatosAltaAnime = z.output<typeof EsquemaCrearAnime>;

/**
 * Lo que ENTRA: los opcionales pueden faltar.
 *
 * Es el tipo que necesita `react-hook-form`, cuyos valores por defecto son los
 * del formulario **antes** de validar:
 *
 *     useForm<EntradaAltaAnime, unknown, DatosAltaAnime>({
 *       resolver: zodResolver(EsquemaCrearAnime),
 *     })
 */
export type EntradaAltaAnime = z.input<typeof EsquemaCrearAnime>;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LO QUE FALTABA PARA EL MODAL Y PARA LA FICHA.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El uuid de un anime tal y como llega de un formulario o de la URL. */
export const EsquemaIdAnime = z.uuid({ error: "Ese identificador no es válido" });

/**
 * `anilist_id` — entero positivo, opcional.
 *
 * Llega del autocompletado, así que llega **del cliente**, así que se valida:
 * un `anilist_id` inventado no hace daño por sí solo, pero es la clave por la
 * que se decide «es el mismo anime» y un valor basura convertiría esa
 * comprobación en ruido.
 */
export const EsquemaAnilistId = z
  .number({ error: "El identificador de AniList tiene que ser un número" })
  .int("El identificador de AniList tiene que ser un número entero")
  .positive("El identificador de AniList tiene que ser positivo")
  .nullish()
  .transform((valor) => valor ?? null);

/**
 * El porcentaje de progreso.
 *
 * Se acota **también** aquí, además de en `progresoLibre`: el deslizador es un
 * `<input type="range">` que el navegador limita, y la Server Action recibe lo
 * que le manden. Dos puertas para el mismo número no es redundancia — la de la
 * interfaz es comodidad y la del servidor es la que cuenta.
 */
export const EsquemaPorcentaje = z
  .number({ error: "El progreso tiene que ser un número" })
  .min(0, "El progreso no puede ser negativo")
  .max(100, "El progreso no puede pasar de 100")
  .nullish()
  .transform((valor) => valor ?? null);

/**
 * La URL de un enlace para continuar.
 *
 * ── NO ES EL MISMO ESQUEMA QUE `EsquemaUrlPortada`, Y NO SE COMPARTE ──────
 *
 * Se parecen —las dos exigen `http(s)` absoluto— y hacen cosas distintas con lo
 * que validan: la de la portada la **descarga el servidor**, así que su peligro
 * es el SSRF y su defensa está en el pipeline; ésta se pinta como `href` y se
 * abre en el navegador **del usuario**, así que su peligro es el XSS por
 * `javascript:` y su defensa es exactamente este parseo, más el `CHECK` de la
 * columna (`ck_continue_link_url`).
 *
 * Unificarlas ahorraría diez líneas y borraría esa diferencia. El día que
 * alguien relajara una para su caso, relajaría la otra sin saberlo.
 */
export const EsquemaUrlEnlace = z
  .string({ error: "Pega la dirección del capítulo" })
  .trim()
  .min(1, "Pega la dirección del capítulo")
  .max(2048, "Esa dirección es demasiado larga: máximo 2048 caracteres")
  .refine(esUrlDescargable, "La dirección tiene que empezar por http:// o https://");

/** «AnimeFLV V2 · Ep 7». Opcional: se puede pegar un enlace desnudo. */
export const EsquemaEtiquetaEnlace = z
  .string({ error: "La etiqueta tiene que ser texto" })
  .trim()
  .max(120, "Esa etiqueta es demasiado larga: máximo 120 caracteres")
  .nullish()
  .transform(aNuloSiVacio);

/** Temporada y episodio de un enlace o de un progreso. */
const EsquemaNumeroPequeno = (que: string) =>
  z
    .number({ error: `${que} tiene que ser un número` })
    .int(`${que} tiene que ser un número entero`)
    .min(0, `${que} no puede ser negativo`)
    // 9999 no es un límite estético: `season` y `episode` son `integer` y este
    // campo lo escribe una persona. Un número de seis cifras es una errata.
    .max(9999, `${que} no puede pasar de 9999`)
    .nullish()
    .transform((valor) => valor ?? null);

export const EsquemaTemporada = EsquemaNumeroPequeno("La temporada");
export const EsquemaEpisodio = EsquemaNumeroPequeno("El episodio");

/** Guardar o reemplazar el progreso de un anime, desde la ficha o el modal. */
export const EsquemaGuardarProgreso = z.object({
  animeId: EsquemaIdAnime,
  etiqueta: EsquemaEtiquetaProgreso,
  porcentaje: EsquemaPorcentaje,
});

/** Añadir un enlace para continuar. */
export const EsquemaGuardarEnlace = z.object({
  animeId: EsquemaIdAnime,
  url: EsquemaUrlEnlace,
  etiqueta: EsquemaEtiquetaEnlace,
  temporada: EsquemaTemporada,
  episodio: EsquemaEpisodio,
});

/**
 * La edición de un anime.
 *
 * El título es OPCIONAL aquí y obligatorio en el alta, y esa asimetría es
 * intencionada: editar «solo el estado» tiene que poder mandar únicamente el
 * estado. Lo que no puede es mandar un título **vacío**, y de eso se encarga
 * `EsquemaTitulo` cuando viene.
 */
export const EsquemaEditarAnime = z.object({
  animeId: EsquemaIdAnime,
  titulo: EsquemaTitulo.optional(),
  estado: z.enum(ESTADOS, { error: "Elige uno de los estados de la lista" }).optional(),
  esFavorito: z.boolean().optional(),
  notas: EsquemaNotas,
});

export type DatosGuardarProgreso = z.output<typeof EsquemaGuardarProgreso>;
export type DatosGuardarEnlace = z.output<typeof EsquemaGuardarEnlace>;
export type DatosEditarAnimeValidados = z.output<typeof EsquemaEditarAnime>;
