/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CÓMO PREGUNTARLE A ANILIST POR UN TÍTULO QUE ESCRIBIÓ UNA PERSONA.
 *
 * ── EL PROBLEMA, MEDIDO ──────────────────────────────────────────────────
 *
 * Los 83 títulos del vault los escribió su dueño, con sus anotaciones y su
 * ortografía. AniList tiene un catálogo. No coinciden siempre:
 *
 *   · `Death Note (Temporada 1 & 2 )` → 404. `Death Note` → 200.
 *   · `…Dark Elf ga Isekai kara Oikaketekita` → 404, porque AniList lo escribe
 *     `Oikakete Kita`, con espacio. `Chotto dake Ai ga Omoi Dark Elf` → 200.
 *
 * ── POR QUÉ NO SE USA `normalizarTitulo` ────────────────────────────────
 *
 * Porque hace otra cosa, y hacerla aquí rompería lo que protege. `normalizar`
 * quita acentos y sufijos de temporada para **deduplicar dentro del vault**:
 * colapsa `Attack on Titan Season 2` con `Attack on Titan` a propósito. Usarlo
 * para buscar traería la primera temporada cuando el dueño tiene la segunda, y
 * escribiría en su ficha los episodios de la serie equivocada.
 *
 * Son dos preguntas distintas —«¿son el mismo anime en MI vault?» y «¿cómo se
 * llama esto en el catálogo?»— y por eso tienen dos funciones.
 *
 * ── ESTO NO INVENTA DATOS ────────────────────────────────────────────────
 *
 * Se prueban varias formas de PREGUNTAR; la respuesta viene entera de AniList.
 * El título guardado no se toca nunca.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * A partir de cuántas palabras merece la pena probar con un prefijo.
 *
 * Por debajo, acortar es peligroso: `Angel Beats` → `Angel` trae otra serie, y
 * una coincidencia equivocada se guarda en el vault del dueño con su
 * `anilist_id`, su sinopsis y sus géneros. Un intento de más NO es gratis.
 */
const MINIMO_PARA_ACORTAR = 8;

/** Cuántas palabras se conservan en el prefijo. */
const PALABRAS_DEL_PREFIJO = 6;

/** Como mucho tres: cada intento es una petición a un tercero. */
const MAXIMO_INTENTOS = 3;

function limpio(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
}

/**
 * Las formas de preguntar, en orden. La primera es SIEMPRE el título tal cual.
 *
 * Quien llama para en el primer 200: los intentos siguientes sólo se gastan si
 * el anterior no encontró nada.
 */
export function titulosDeBusqueda(titulo: string): string[] {
  const intentos: string[] = [limpio(titulo)];

  const anadir = (candidato: string): void => {
    const valor = limpio(candidato);
    if (valor === "" || intentos.includes(valor)) return;
    if (intentos.length >= MAXIMO_INTENTOS) return;
    intentos.push(valor);
  };

  // 1. Sin las anotaciones del dueño: `(Temporada 1 & 2 )`, `[BD 1080p]`.
  anadir(titulo.replace(/[([][^)\]]*[)\]]/g, " "));

  // 2. Un prefijo, sólo si el título es largo de verdad.
  const palabras = limpio(titulo).split(" ");
  if (palabras.length >= MINIMO_PARA_ACORTAR) {
    anadir(palabras.slice(0, PALABRAS_DEL_PREFIJO).join(" "));
  }

  return intentos;
}
