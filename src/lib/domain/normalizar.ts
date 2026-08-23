/**
 * Normalización de títulos de anime.
 *
 * El resultado se materializa en `anime.title_normalized`, que tiene un
 * `UNIQUE (user_id, title_normalized)` y un índice GIN trigram. Es la clave de
 * la deduplicación.
 *
 * CUIDADO: cambiar esta función es una MIGRACIÓN DE DATOS. Las filas existentes
 * hay que recalcularlas en la misma migración; si no, quedan duplicados
 * invisibles y colisiones al insertar. Ver `.claude/agents/db-migrator.md`.
 *
 * Módulo puro: no importa nada de `db/`, de `app/` ni de React.
 */

/**
 * Sufijos de temporada que SÍ se recortan.
 *
 * Todos exigen una PALABRA CLAVE. Un número final suelto no basta, y esa
 * restricción no es cosmética: sin ella `White Album 2` colapsaría sobre
 * `White Album`, y el usuario tiene ambas series.
 */
const SUFIJOS_TEMPORADA: readonly RegExp[] = [
  // "… Season 2" · "… temporada 2" · "… Part II" · "… cour 2"
  /\s+(?:temporadas?|temps?|seasons?|saisons?|stagione|staffel|cours?|partes?|parts?)\s+(?:\d{1,2}|[ivx]{1,4})\s*$/i,
  // "… 2nd Season" · "… 3rd season"
  /\s+\d{1,2}(?:st|nd|rd|th)\s+seasons?\s*$/i,
  // "… S2"
  /\s+s\d{1,2}\s*$/i,
  // "… The Final Season" · "… Final Season"
  /\s+(?:the\s+)?final\s+seasons?\s*$/i,
];

/** Cuántas veces se reintenta el recorte: los sufijos se acumulan ("Season 2 Part 2"). */
const PASADAS_MAXIMAS = 3;

/**
 * Normaliza un título para deduplicar.
 *
 * Pasos, en este orden exacto:
 *  1. `NFKC` — colapsa ancho completo japonés a ASCII.
 *  2. minúsculas y recorte de extremos.
 *  3. quitar acentos (`NFD` y descartar los diacríticos).
 *  4. recortar sufijos de temporada explícitos, en bucle.
 *  5. puntuación a espacio — conserva TODO lo alfanumérico, incluido lo que va
 *     dentro de los paréntesis: si se descarta el año, `Higurashi (2020)`
 *     colisiona con `Higurashi`, y el usuario tiene las dos.
 *  6. colapsar espacios.
 *
 * @example
 * normalizarTitulo("Attack on Titan Season 2")        // "attack on titan"
 * normalizarTitulo("White Album 2")                   // "white album 2"
 * normalizarTitulo("Higurashi no Naku Koro ni (2020)")// "higurashi no naku koro ni 2020"
 */
export function normalizarTitulo(titulo: string): string {
  // 1–3. Unicode, minúsculas, sin acentos.
  let s = titulo
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "");

  // 4. Sufijos de temporada, en bucle porque se acumulan.
  for (let pasada = 0; pasada < PASADAS_MAXIMAS; pasada += 1) {
    const antes = s;
    for (const patron of SUFIJOS_TEMPORADA) {
      s = s.replace(patron, "");
    }
    if (s === antes) break;
  }

  // 5–6. Puntuación a espacio y colapso.
  const limpio = s
    .replace(/[^0-9a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Un título que era SOLO un sufijo de temporada ("Season 2") se quedaría en
  // vacío, y la cadena vacía en un UNIQUE haría colisionar a todos entre sí.
  // En ese caso se conserva el título sin recortar el sufijo.
  if (limpio.length === 0) {
    return titulo
      .normalize("NFKC")
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Mn}+/gu, "")
      .replace(/[^0-9a-z]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return limpio;
}

/**
 * Variante para el buscador: como `normalizarTitulo` pero SIN recortar sufijos
 * de temporada. Buscar "season 2" debe poder encontrar algo.
 */
export function normalizarParaBusqueda(texto: string): string {
  return texto
    .normalize("NFKC")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}+/gu, "")
    .replace(/[^0-9a-z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
