/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL VOCABULARIO CONTROLADO DE ETIQUETAS IA — skill de dominio §6.
 *
 * ── UNA SOLA COPIA, Y TRES CONSUMIDORES ──────────────────────────────────
 *
 * De esta constante salen **el prompt** que se le manda a Claude, **el esquema
 * Zod** que valida su respuesta y **los filtros** de la interfaz. Escribirla dos
 * veces es garantizar que un día el modelo proponga etiquetas que el validador
 * rechaza, o que la interfaz ofrezca un filtro que no existe en la base.
 *
 * Es exactamente el caso que `code-style.md` § «Conceptos con un solo dueño»
 * documenta con el parseador de `?estado=`: dos copias, ninguna mal por
 * separado, y la misma URL significando dos cosas distintas.
 *
 * ── POR QUÉ CERRADO, Y NO «LO QUE EL MODELO CREA» ────────────────────────
 *
 * Un vocabulario abierto produce sinónimos: `psicologico`, `psicológico`,
 * `psicologicos`, `thriller-psicologico`. Cada uno crea su fila en `genre` y su
 * chip en los filtros, y el usuario acaba con cinco etiquetas que significan lo
 * mismo y ninguna que filtre bien.
 *
 * El modelo puede proponer **como mucho 2 nuevas** por anime, y esas se guardan
 * con `source = 'IA_PROPUESTA'` y quedan marcadas para revisión: **no entran al
 * vocabulario automáticamente**. La lista de arriba sólo crece cuando una
 * persona decide que crezca.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const VOCABULARIO_ETIQUETAS = [
  "romance",
  "romance-tragico",
  "yandere",
  "tsundere",
  "psicologico",
  "thriller",
  "gore",
  "sobrenatural",
  "isekai",
  "recuentos-de-la-vida",
  "slice-of-life-melancolico",
  "escolar",
  "musical",
  "militar",
  "mecha",
  "ciberpunk",
  "historico",
  "comedia-romantica",
  "harem",
  "drama-adulto",
  "deportes",
  "misterio",
  "supervivencia",
  "sobreviviente-culpa",
  "coming-of-age",
  "obra-maestra-visual",
] as const;

export type EtiquetaIa = (typeof VOCABULARIO_ETIQUETAS)[number];

/** Para buscar en O(1): el vocabulario se consulta una vez por etiqueta devuelta. */
const CONJUNTO: ReadonlySet<string> = new Set(VOCABULARIO_ETIQUETAS);

/**
 * ¿Está EXACTAMENTE en el vocabulario?
 *
 * Exactamente, sin normalizar antes a propósito. Quien llama decide si quiere
 * intentar arreglar lo que llegó (`normalizarSlugDeEtiqueta`) o descartarlo:
 * aceptar aquí `Psicológico` como `psicologico` escondería que el prompt no
 * está consiguiendo que el modelo responda en el formato pedido.
 */
export function esEtiquetaDelVocabulario(valor: string): valor is EtiquetaIa {
  return CONJUNTO.has(valor);
}

/**
 * Convierte lo que proponga el modelo en un slug de esta casa.
 *
 * Sólo para las etiquetas NUEVAS —las del vocabulario ya vienen en forma—, y
 * con la misma receta que `normalizarTitulo` usa para lo suyo: NFKC,
 * minúsculas, fuera los acentos, y todo lo que no sea `[a-z0-9]` a guion.
 *
 * Devuelve `""` cuando no queda nada. **Quien llama tiene que descartarla**: una
 * etiqueta sin slug no se puede guardar (el `UNIQUE` de `genre.slug` la
 * colapsaría con cualquier otra igual de vacía).
 */
export function normalizarSlugDeEtiqueta(valor: string): string {
  return valor
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
