/**
 * Export del vault.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUÉ LOS BINARIOS VAN APARTE
 *
 * El borrado de cuenta entrega un export ANTES de borrar, y va por Server Action
 * (no por un `GET`, que expondría el vault entero a cualquiera con la URL). Pero
 * el valor de retorno de una Server Action viaja por el flujo RSC, y meter ahí
 * 83 portadas en base64 son **varios MB** en una sola respuesta: se rompe, o va
 * tan lento que el usuario cree que ha fallado.
 *
 * LA DECISIÓN: **el export por defecto lleva solo lo irrecuperable.**
 *
 *   · metadatos, progreso, enlaces de continuación y etiquetas → SÍ.
 *     Es lo que no se puede reconstruir: son años de anotaciones propias.
 *   · portadas → NO por defecto. Se ofrecen como descarga aparte si se piden.
 *     Una portada perdida se vuelve a descargar; una nota, no.
 *
 * El límite se comprueba con un test sobre un vault de 83 animes.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Módulo puro: construye y mide, no consulta.
 */

/** Presupuesto del export de metadatos que viaja por una Server Action. */
export const LIMITE_EXPORT_BYTES = 1_048_576; // 1 MiB

/**
 * Aviso a partir del cual conviene sugerir la descarga por partes, antes de
 * llegar al límite duro.
 */
export const UMBRAL_AVISO_BYTES = 786_432; // 0,75 MiB

export type AnimeExportado = {
  titulo: string;
  tituloIngles: string | null;
  tituloNativo: string | null;
  sinonimos: string[] | null;
  estado: string;
  formato: string | null;
  anio: number | null;
  episodiosTotales: number | null;
  temporadasTotales: number | null;
  puntuacion: string | null;
  favorito: boolean;
  notas: string | null;
  sinopsis: string | null;
  anilistId: number | null;
  malId: number | null;
  creadoEn: string;
  actualizadoEn: string;
  progreso: {
    tipo: string;
    temporada: number | null;
    episodio: number | null;
    porcentaje: number | null;
    etiqueta: string;
  } | null;
  enlaces: { url: string; etiqueta: string | null; temporada: number | null; episodio: number | null }[];
  generos: { slug: string; nombre: string; tipo: string; confianza: string | null }[];
  /** Solo la referencia, NUNCA los bytes. */
  portada: { checksum: string; urlOrigen: string | null; ancho: number | null; alto: number | null } | null;
};

export type ExportVault = {
  version: 1;
  generadoEn: string;
  usuario: { email: string; nombre: string | null };
  animes: AnimeExportado[];
  sitiosPropios: { slug: string; nombre: string; tipo: string; espejos: { etiqueta: string; url: string }[] }[];
  /** Qué se ha dejado fuera, para que quien lea el fichero no se lleve sorpresas. */
  excluido: {
    portadas: {
      motivo: string;
      cantidad: number;
      comoObtenerlas: string;
    };
  };
};

/** Tamaño real del JSON serializado, en bytes UTF-8. */
export function tamanoEnBytes(datos: unknown): number {
  return Buffer.byteLength(JSON.stringify(datos), "utf8");
}

export type VeredictoTamano = {
  bytes: number;
  cabe: boolean;
  conviene_avisar: boolean;
  /** Porcentaje del presupuesto consumido, redondeado. */
  porcentaje: number;
};

export function medirExport(datos: unknown): VeredictoTamano {
  const bytes = tamanoEnBytes(datos);
  return {
    bytes,
    cabe: bytes <= LIMITE_EXPORT_BYTES,
    conviene_avisar: bytes >= UMBRAL_AVISO_BYTES,
    porcentaje: Math.round((bytes / LIMITE_EXPORT_BYTES) * 100),
  };
}

/**
 * Construye la nota de lo excluido.
 *
 * Que el fichero DIGA qué falta es parte del contrato: un export silencioso al
 * que le faltan las portadas es peor que no tener export, porque el usuario cree
 * que lo tiene todo.
 */
export function notaDeExclusion(cuantasPortadas: number): ExportVault["excluido"] {
  return {
    portadas: {
      motivo:
        "Las portadas son binarios y no caben en este fichero. Aquí va su checksum " +
        "y su URL de origen, que es lo que permite reconstruirlas.",
      cantidad: cuantasPortadas,
      comoObtenerlas:
        "Ajustes → Exportar → «Descargar portadas», que entrega un .zip aparte.",
    },
  };
}
