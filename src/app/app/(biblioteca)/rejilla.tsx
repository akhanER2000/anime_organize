import { AnimeCard } from "@/components/anime/anime-card";

import type { AnimeEnListado } from "@/lib/db";
import { etiquetaDeProgreso, rellenoDeFila } from "@/lib/domain/progreso";
import { BarraProgreso } from "@/components/ui/card";

import { REJILLA } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA REJILLA DE PORTADAS — DESIGN-SPEC §03.
 *
 * `repeat(5,1fr)` en desktop, bajando a 4 · 3 · 2 (§3). Gap 24 horizontal y 28
 * vertical. Las medidas viven en `medidas.ts` porque `loading.tsx` tiene que
 * caer sobre la misma columna.
 *
 * ── ES UNA LISTA, Y ESO NO ES DECORACIÓN ──────────────────────────────────
 * `<ul>`/`<li>` con `aria-label`: un lector de pantalla anuncia «lista de 83
 * elementos» y permite saltar de uno a otro. Un `<div>` con 83 `<div>` dentro
 * obliga a recorrerlos todos para saber cuántos hay.
 *
 * ── LA BARRA DE PROGRESO VA AQUÍ, Y NO DEBERÍA ────────────────────────────
 * El artboard dibuja la hairline dentro de la card, bajo la línea de meta.
 * `AnimeCard` —que no me toca editar— pinta la portada, el badge, el favorito,
 * el título y la ETIQUETA de progreso, pero no la barra. Se compone aquí, con
 * la misma primitiva del sistema (`BarraProgreso`) y la misma sangría de 12 px
 * que usa la card, para que caiga alineada.
 *
 * Consecuencia visible y asumida: la veta dorada del hover vive en el
 * `<article>` de la card, así que no cubre esta última franja. El arreglo
 * correcto es mover la barra DENTRO de `AnimeCard`. Anotado en `SUPUESTOS.md`.
 *
 * ── EL RELLENO VA INDETERMINADO, Y ES LO HONESTO ──────────────────────────
 * `vault.listar()` devuelve `progresoEtiqueta` y nada más: ni `kind`, ni
 * `episode`, ni `total_episodes`. Sin esos campos no se puede calcular el
 * porcentaje que manda `anime-vault-domain` §4, y adivinarlo leyendo el texto
 * de la etiqueta sería inventarse el progreso del usuario.
 *
 * Así que se pinta lo que §6 llama el estado «vacío» de la barra —«pista sola,
 * sin relleno»—, que es exactamente lo que el sistema define para un progreso
 * indeterminado. En `ABANDONADO` la pista se marca en granate sin halo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
/**
 * ── RECIBE LA FILA ENTERA, NO LA CARD RECORTADA ───────────────────────────
 *
 * `AnimeParaCard` es lo que necesita la card para pintarse, y no incluye los
 * campos de progreso. Mientras la rejilla recibió ESE tipo, no tenía con qué
 * calcular el relleno y pasaba `null`: 69 de 83 barras salían vacías teniendo
 * el dato en la base.
 *
 * `AnimeParaCard` sigue siendo el contrato de la card —lo que se le pasa a
 * `AnimeCard` no cambia— pero la rejilla, que además pinta la barra, necesita
 * la fila completa.
 */
export function Rejilla({ animes }: { animes: readonly AnimeEnListado[] }) {
  return (
    <ul aria-label="Tus series" className={REJILLA}>
      {/* `min-w-0` en la celda: una celda de rejilla vale por defecto lo que su
       * contenido MÍNIMO (`min-width:auto`), así que un título con una palabra
       * muy larga ensancharía la columna y sacaría scroll horizontal en móvil.
       * Con esto la columna manda sobre el texto, no al revés. */}
      {animes.map((anime) => (
        <li key={anime.id} className="flex min-w-0 flex-col">
          <AnimeCard anime={anime} />

          {/* El borde transparente de 1 px replica el de la card: sin él, la
           * barra quedaría un píxel a la izquierda del título. */}
          <div className="border-l border-transparent pl-[var(--e-1-5)] pt-[var(--e-1)]">
            <BarraProgreso
              porcentaje={rellenoDeFila(anime)}
              grosor="hairline"
              abandonado={anime.estado === "ABANDONADO"}
              etiqueta={etiquetaAccesibleDeProgreso(anime)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Lo que oye quien no ve la barra.
 *
 * Se conserva **la etiqueta que escribió el usuario** («Completo (Todo Visto)»,
 * «Solo 1ra Temporada»…), nunca una reescrita por nosotros: es lo que pide
 * `anime-vault-domain` §4.
 *
 * ── EL DETALLE SALE DEL DUEÑO, NO DE UN LITERAL DE AQUÍ ──────────────────
 *
 * Esto tenía su propio `?? "sin progreso registrado"`, y el mismo anime sin
 * progreso se anunciaba de tres formas según la pantalla: línea en blanco en la
 * card, «Sin progreso» en la fila de la lista y «Sin progreso registrado» en la
 * ficha. Ahora las tres preguntan a `etiquetaDeProgreso`, que además sabe decir
 * «45 %» cuando hay número y no hay etiqueta.
 *
 * Lo que se queda aquí es solo lo que ESTA pantalla añade: el título delante,
 * porque en una rejilla de 83 barras «Progreso: completo» no dice de qué.
 */
function etiquetaAccesibleDeProgreso(anime: AnimeEnListado): string {
  return `Progreso de ${anime.titulo}: ${etiquetaDeProgreso(anime.progresoEtiqueta, rellenoDeFila(anime))}`;
}
