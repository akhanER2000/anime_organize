import type { Estado } from "@/lib/domain/enums";

/**
 * UNA FILA, YA LISTA PARA PINTARSE.
 *
 * Es lo que el servidor entrega a la tabla, que es un Componente de Cliente.
 * Por eso **no hay ni un `Date` aquí**: `code-style.md` prohíbe cruzar la
 * frontera servidor→cliente con un `Date` sin serializar, y además la fecha
 * formateada en el servidor evita que el mismo dato se pinte distinto en el
 * render del servidor y en la hidratación —el locale del navegador no tiene por
 * qué ser el del servidor, y React lo canta como error de hidratación—.
 *
 * Sale de `AnimeEnListado` (`@/lib/db`), que es lo que devuelve `vault.listar()`.
 * **Los bytes de la portada no viajan nunca**: solo el checksum, que es lo que
 * necesita la URL versionada de `/api/covers`.
 */
export type FilaVista = {
  /** 0-100, o `null` si el progreso es indeterminado (CUSTOM, o sin totales). */
  relleno: number | null;
  id: string;
  titulo: string;
  estado: Estado;
  esFavorito: boolean;
  anio: number | null;
  /** La etiqueta que escribió el usuario, nunca una reescrita por nosotros. */
  progresoEtiqueta: string | null;
  checksumPortada: string | null;
  /** Ya formateada: «12 mar 2026». */
  actualizadoTexto: string;
  /** ISO 8601, para el atributo `datetime` de `<time>`. */
  actualizadoIso: string;
};
