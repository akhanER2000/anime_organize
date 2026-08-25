/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORMATEAR UNA FECHA PARA PANTALLA — un solo sitio.
 *
 * ── ESTO ESTABA ESCRITO DOS VECES, Y LAS DOS COPIAS DIVERGÍAN ─────────────
 *
 * La ficha (`anime/[id]/ficha.ts`) y la vista lista (`lista/page.tsx`) tenían
 * cada una su `Intl.DateTimeFormat("es-ES", …)` con las mismas tres opciones de
 * formato… y **una fijaba la zona horaria y la otra no**.
 *
 * Consecuencia medida, con `TZ=America/Santiago` y Node 24:
 *
 *     2026-01-03T00:30:00.000Z  →  ficha «03 ene 2026» · lista «02 ene 2026»
 *     2026-01-03T12:00:00.000Z  →  ficha «03 ene 2026» · lista «03 ene 2026»
 *
 * O sea: **cualquier marca de las primeras horas UTC del día se pinta un día
 * antes en la lista y no en la ficha**. Y como la ficha muestra `createdAt` y la
 * lista `updatedAt`, en un anime recién añadido —donde las dos marcas son casi
 * la misma— el choque se ve de frente: la ficha dice «añadido el 03 ene» y la
 * fila de la lista dice «02 ene».
 *
 * En Vercel las funciones corren en UTC y las dos coinciden, así que el fallo
 * es **invisible en producción y visible en local**, que es la peor forma de
 * tenerlo: se descarta como «cosa de mi máquina».
 *
 * Peor todavía, la lista se contradecía consigo misma: serializa el ISO —que sí
 * es UTC— en el atributo `dateTime` del `<time>` y pintaba el texto en la zona
 * del proceso. En la misma celda, el texto visible y lo que lee una máquina
 * podían nombrar días distintos.
 *
 * ── LO QUE FIJA ESTE MÓDULO, Y POR QUÉ CADA COSA ──────────────────────────
 *
 *   · **`timeZone: "UTC"`**. Las marcas se guardan en `timestamptz` y la
 *     aplicación no sabe dónde está quien mira. Fijar UTC no es «correcto» en
 *     abstracto —es una decisión— pero es la única que da la MISMA respuesta en
 *     todas las pantallas y en todos los despliegues, que es lo que importa
 *     cuando el mismo dato se pinta en tres sitios.
 *   · **Se quita el punto del mes abreviado.** `es-ES` escribe «ene» en unas
 *     versiones de ICU y «ene.» en otras. Sin normalizar, la pantalla depende de
 *     la versión de Node del despliegue.
 *   · **Una fecha inválida devuelve `""`, no revienta.** Medido:
 *     `Intl.DateTimeFormat.prototype.format(new Date("x"))` lanza `RangeError`,
 *     no imprime «Invalid Date» — o sea que tumba el render del Server Component
 *     entero. Hoy es inalcanzable (`updated_at` es `NOT NULL`), pero una guarda
 *     que cuesta una línea no se discute.
 *   · **El ISO sale del mismo módulo.** Si el texto y el atributo `dateTime` se
 *     componen en sitios distintos, vuelven a poder discrepar.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const FORMATO_CORTO = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `03 ene 2026`. Cadena vacía si la fecha no es válida. */
export function fechaCorta(fecha: Date): string {
  if (Number.isNaN(fecha.getTime())) return "";
  return FORMATO_CORTO.format(fecha).replace(/\./g, "");
}

/**
 * El valor del atributo `dateTime` de un `<time>`, en ISO 8601.
 *
 * Va emparejado con `fechaCorta` a propósito: los dos salen de la misma marca y
 * del mismo módulo, así que no pueden nombrar días distintos.
 */
export function fechaIso(fecha: Date): string {
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toISOString();
}
