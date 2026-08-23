/**
 * Dominios cerrados de Anime Vault.
 *
 * Fuente ÚNICA de estos valores. De aquí beben Drizzle (los `CHECK`), Zod (los
 * esquemas de validación) y la interfaz (los filtros y las etiquetas). Si esta
 * lista y la base de datos se separan, la base rechaza inserciones que la
 * interfaz ofrece, y eso se manifiesta como un 500 aleatorio en producción.
 *
 * Módulo puro: no importa nada de `db/`, de `app/` ni de React.
 */

// ---------------------------------------------------------------------------
// Estado de un anime
// ---------------------------------------------------------------------------

export const ESTADOS = ["VISTO", "VIENDO", "EN_ESPERA", "ABANDONADO", "PENDIENTE"] as const;
export type Estado = (typeof ESTADOS)[number];

/** Etiqueta visible. El estado NUNCA se comunica solo por color (accesibilidad). */
export const ETIQUETA_ESTADO: Readonly<Record<Estado, string>> = {
  VISTO: "Visto",
  VIENDO: "Viendo",
  EN_ESPERA: "En espera",
  ABANDONADO: "Abandonado",
  PENDIENTE: "Pendiente",
};

/**
 * Sinónimos aceptados al importar (seed, .xlsx, .csv).
 *
 * La clave ya viene normalizada: minúsculas, sin acentos y con espacios
 * colapsados — usa `normalizarEtiquetaLibre` antes de consultar este mapa.
 */
const SINONIMOS_ESTADO: Readonly<Record<string, Estado>> = {
  visto: "VISTO",
  vistos: "VISTO",
  completado: "VISTO",
  completada: "VISTO",
  completo: "VISTO",
  terminado: "VISTO",
  terminada: "VISTO",
  finalizado: "VISTO",
  completed: "VISTO",
  watched: "VISTO",
  finished: "VISTO",

  viendo: "VIENDO",
  "en curso": "VIENDO",
  "en proceso": "VIENDO",
  "en emision": "VIENDO",
  mirando: "VIENDO",
  watching: "VIENDO",
  "currently watching": "VIENDO",

  "en espera": "EN_ESPERA",
  espera: "EN_ESPERA",
  pausado: "EN_ESPERA",
  pausada: "EN_ESPERA",
  "on hold": "EN_ESPERA",
  onhold: "EN_ESPERA",
  paused: "EN_ESPERA",

  abandonado: "ABANDONADO",
  abandonada: "ABANDONADO",
  droppeado: "ABANDONADO",
  dropped: "ABANDONADO",

  pendiente: "PENDIENTE",
  "por ver": "PENDIENTE",
  "plan to watch": "PENDIENTE",
  ptw: "PENDIENTE",
  planned: "PENDIENTE",
  "quiero verla": "PENDIENTE",
};

/** Normaliza texto libre para buscarlo en una tabla de sinónimos. */
export function normalizarEtiquetaLibre(valor: string): string {
  return valor
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .replace(/[^0-9a-z]+/g, " ")
    .trim();
}

/**
 * Mapea texto libre a un estado del dominio.
 *
 * Devuelve `PENDIENTE` ante lo desconocido, y lo señala con `reconocido: false`
 * para que la importación pueda listarlo en su reporte en vez de tragárselo.
 */
export function mapearEstado(valor: string | null | undefined): {
  estado: Estado;
  reconocido: boolean;
} {
  if (valor == null) return { estado: "PENDIENTE", reconocido: false };

  const clave = normalizarEtiquetaLibre(valor);
  if (clave.length === 0) return { estado: "PENDIENTE", reconocido: false };

  // Un valor que ya viene en formato del dominio ("EN_ESPERA") pierde el guion
  // bajo al normalizarse, así que se comprueba también contra la lista canónica.
  const canonico = ESTADOS.find((e) => normalizarEtiquetaLibre(e) === clave);
  if (canonico !== undefined) return { estado: canonico, reconocido: true };

  const encontrado = SINONIMOS_ESTADO[clave];
  if (encontrado !== undefined) return { estado: encontrado, reconocido: true };

  return { estado: "PENDIENTE", reconocido: false };
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export const FORMATOS = ["TV", "MOVIE", "OVA", "ONA", "SPECIAL"] as const;
export type Formato = (typeof FORMATOS)[number];

export const ETIQUETA_FORMATO: Readonly<Record<Formato, string>> = {
  TV: "Serie",
  MOVIE: "Película",
  OVA: "OVA",
  ONA: "ONA",
  SPECIAL: "Especial",
};

// ---------------------------------------------------------------------------
// Progreso
// ---------------------------------------------------------------------------

export const TIPOS_PROGRESO = [
  "COMPLETO",
  "TEMPORADA",
  "EPISODIO",
  "PORCENTAJE",
  "CUSTOM",
] as const;
export type TipoProgreso = (typeof TIPOS_PROGRESO)[number];

// ---------------------------------------------------------------------------
// Géneros y etiquetas
// ---------------------------------------------------------------------------

export const TIPOS_GENERO = ["OFICIAL", "IA", "USUARIO"] as const;
export type TipoGenero = (typeof TIPOS_GENERO)[number];

// ---------------------------------------------------------------------------
// Sitios de streaming
// ---------------------------------------------------------------------------

export const TIPOS_SITIO = ["GRATIS", "PAGO", "MIXTO"] as const;
export type TipoSitio = (typeof TIPOS_SITIO)[number];

// ---------------------------------------------------------------------------
// Trabajos de IA
// ---------------------------------------------------------------------------

export const ESTADOS_TRABAJO = ["PENDIENTE", "OK", "ERROR", "OMITIDO"] as const;
export type EstadoTrabajo = (typeof ESTADOS_TRABAJO)[number];

// ---------------------------------------------------------------------------
// Utilidad para los CHECK de Drizzle
// ---------------------------------------------------------------------------

/** `listaSql(ESTADOS)` → `'VISTO','VIENDO',...` para un `CHECK (col IN (...))`. */
export function listaSql(valores: readonly string[]): string {
  return valores.map((v) => `'${v}'`).join(",");
}
