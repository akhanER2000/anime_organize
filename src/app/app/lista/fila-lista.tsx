"use client";

import { BadgeEstado } from "@/components/ui/badge";
import { TRANSICION } from "@/lib/ui/clases";
import { etiquetaDeProgreso } from "@/lib/domain/progreso";
import { Boton } from "@/components/ui/boton";
import { BarraProgreso } from "@/components/ui/card";
import { Casilla } from "@/components/ui/casilla";
import { cn } from "@/lib/ui/cn";

import { COLUMNAS, claseDeVisibilidad } from "./columnas";

import type { IdColumna } from "./columnas";
import type { FilaVista } from "./tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNA FILA DE LA TABLA — DESIGN-SPEC §04 y §6 («Fila de tabla»).
 *
 * Los estados que pide §6 están aquí, y ninguno se comunica solo por color:
 *
 *   normal / cebra   impares `--slate-950`, pares `--slate-900`
 *   hover            fondo `--slate-900` + VETA dorada de 1 px a la izquierda
 *   foco             anillo dorado interior (lo pone la tabla con `focus-within`)
 *   seleccionada     veta izquierda + texto `--porcelain-050` + casilla marcada
 *   vacío            no es de la fila: ver `vacio.tsx`
 *
 * ── LA CEBRA SE CALCULA AQUÍ, NO CON `odd:` / `even:` ─────────────────────
 *
 * `odd:bg-…` y `hover:bg-…` son dos VARIANTES con la misma especificidad, así
 * que cuál gana depende del orden en que Tailwind las emita, y eso no debería
 * decidir si el hover se ve. Con la cebra como clase base y el hover como
 * variante el orden está garantizado: las utilidades sin variante se emiten
 * siempre antes que las variantes.
 *
 * ── LA VETA VA EN LA PRIMERA CELDA, NO EN EL `<tr>` ───────────────────────
 *
 * Un borde sobre `<tr>` depende de `border-collapse` y de cómo lo resuelva cada
 * navegador. Sobre la primera celda se pinta siempre, y `group-hover` la
 * enciende desde la fila entera.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsFilaLista = {
  fila: FilaVista;
  /** Índice en la tabla YA ordenada. Decide la cebra. */
  indice: number;
  seleccionada: boolean;
  alAlternar: (id: string) => void;
};

/** La clase de ancho y de visibilidad de una columna, buscada por su id. */
function claseDeColumna(id: IdColumna): string {
  const columna = COLUMNAS.find((c) => c.id === id);
  return columna === undefined ? "" : cn(columna.ancho, claseDeVisibilidad(columna));
}

/**
 * Padding de celda: §04 dice «gap 18 px» entre columnas y «padding de fila
 * 13/20». Una tabla no tiene `gap`, así que cada celda pone la mitad del hueco a
 * cada lado (9 + 9 = 18) y los extremos llevan los 20 px del padding de fila.
 */
const CELDA = "px-[9px] align-middle";
const PRIMERA = "pl-[var(--e-2-5)] pr-[9px] align-middle";
const ULTIMA = "pl-[9px] pr-[var(--e-2-5)] align-middle";

export function FilaLista({ fila, indice, seleccionada, alAlternar }: PropsFilaLista) {
  // §04: «Cebra: filas impares --slate-950, pares --slate-900». La primera fila
  // es la impar, así que el índice 0 va en `--slate-950`.
  const cebra = indice % 2 === 0 ? "bg-[var(--slate-950)]" : "bg-[var(--slate-900)]";

  const miniatura =
    fila.checksumPortada === null
      ? `/api/covers/${fila.id}?size=thumb`
      : `/api/covers/${fila.id}?size=thumb&v=${fila.checksumPortada}`;

  return (
    <tr className={cn("group h-[74px]", cebra, TRANSICION, "hover:bg-[var(--slate-900)]")}>
      {/* Sin `aria-selected` en el `<tr>`: ese atributo solo es válido sobre
       * `row` dentro de un `grid`/`treegrid`, y esto es una `table` estática.
       * Quien anuncia la selección es la casilla —un `<input type="checkbox">`
       * de verdad, con su estado nativo— más la región viva de la tabla. */}
      <td
        className={cn(
          PRIMERA,
          claseDeColumna("seleccion"),
          // LA VETA KINTSUGI en su segunda forma (DESIGN-SPEC §1): borde
          // izquierdo de 1 px que pasa a dorado. Ni escala ni sombra: el
          // movimiento del sistema es de opacidad y de color de borde.
          "border-l border-l-transparent",
          TRANSICION,
          "group-hover:border-l-[var(--gold-400)]",
          seleccionada && "border-l-[var(--gold-400)]",
        )}
      >
        <Casilla
          checked={seleccionada}
          onChange={() => {
            alAlternar(fila.id);
          }}
          etiqueta={<span className="sr-only">Seleccionar {fila.titulo}</span>}
          // La casilla mide 15 px por diseño y su área pulsable son 44 px, que
          // aquí desbordarían la fila de 74. En escritorio el mínimo de §7 son
          // 32 px con 8 de separación, y la tabla no existe por debajo de 768.
          className="min-h-[var(--e-4)]"
        />
      </td>

      <td className={cn(CELDA, claseDeColumna("portada"))}>
        {/* §04: miniatura 32 × 48, radio 3. La portada sale SIEMPRE de
         * `/api/covers`, nunca del dominio original: es la invariante que
         * comprueba el e2e crítico del proyecto. El `?v=<checksum>` no es
         * decoración: la respuesta es `immutable` durante un año.
         * `alt=""` porque el título va en la celda de al lado; repetirlo aquí
         * haría que el lector lo dijera dos veces. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- ya optimizada por sharp en /api/covers */}
        <img
          src={miniatura}
          alt=""
          width={32}
          height={48}
          loading="lazy"
          decoding="async"
          className="h-[48px] w-[32px] rounded-chip border border-[var(--slate-700)] bg-[var(--slate-850)] object-cover"
        />
      </td>

      {/* `<th scope="row">` y no `<td>`: el título es la CABECERA DE FILA. Es lo
       * que hace que un lector de pantalla diga «Mushishi, Estado, Visto» al
       * recorrer la fila, en vez de «Visto» a secas. */}
      <th
        scope="row"
        className={cn(
          CELDA,
          claseDeColumna("titulo"),
          "text-left font-ui text-ui font-[var(--fw-ui-medium)] leading-ui",
          seleccionada ? "text-[var(--porcelain-050)]" : "text-[var(--porcelain-100)]",
        )}
      >
        <span className="flex items-center gap-[var(--e-1)]">
          <span className="truncate">{fila.titulo}</span>

          {fila.esFavorito && (
            <span className="shrink-0 text-[var(--estado-favorito)]">
              <span aria-hidden="true">★</span>
              <span className="sr-only">Favorito</span>
            </span>
          )}
        </span>

        {fila.anio !== null && (
          <span className="mt-[var(--e-05)] block font-mono text-mono font-[var(--fw-ui)] text-[var(--ash-400)]">
            {fila.anio}
          </span>
        )}
      </th>

      <td className={cn(CELDA, claseDeColumna("estado"))}>
        <BadgeEstado estado={fila.estado} />
      </td>

      <td className={cn(CELDA, claseDeColumna("progreso"))}>
        <span className="block truncate font-mono text-mono text-[var(--ash-400)]">
          {fila.progresoEtiqueta ?? "Sin progreso"}
        </span>

        {/* Barra INDETERMINADA —pista sola, sin relleno—, que es exactamente lo
         * que se sabe: `vault.listar()` devuelve la etiqueta del progreso pero
         * no su `kind` ni sus números, así que calcular un porcentaje sería
         * inventarlo. Ver SUPUESTOS.md. */}
        <div className="mt-[var(--e-1)]">
          <BarraProgreso
            porcentaje={fila.relleno}
            etiqueta={etiquetaDeProgreso(fila.progresoEtiqueta, fila.relleno)}
          />
        </div>
      </td>

      <td className={cn(CELDA, claseDeColumna("generos"))}>
        {/* Los géneros llegan con el enriquecimiento (AniList + IA) y no viajan
         * en el listado. No se inventan: se dice que no hay. */}
        <span className="font-ui text-ui-s text-[var(--ash-400)]">
          <span aria-hidden="true">—</span>
          <span className="sr-only">Sin géneros</span>
        </span>
      </td>

      <td className={cn(CELDA, claseDeColumna("actualizado"))}>
        <time dateTime={fila.actualizadoIso} className="font-mono text-mono text-[var(--ash-400)]">
          {fila.actualizadoTexto}
        </time>
      </td>

      <td className={cn(ULTIMA, claseDeColumna("acciones"), "text-right")}>
        {/* Obsidiana con borde neutro, sin oro: son 83 celdas iguales y el oro
         * no puede cubrir más del 10 % de la pantalla (regla del oro nº 1).
         *
         * Esto era un `<a>` reconstruido a mano, con el motivo «un `Boton` no
         * puede navegar». Ya no es cierto: `Boton` es polimórfico y con `href`
         * renderiza un ancla de verdad. Y la copia olvidaba
         * `font-[var(--fw-ui-medium)]`, así que «Ver ficha» salía en peso 400
         * mientras cualquier otro botón secundario del sistema va en 500 —
         * 83 veces en la misma pantalla. */}
        <Boton href={`/app/anime/${fila.id}`} variante="secundario" tamano="s">
          Ver ficha<span className="sr-only"> de {fila.titulo}</span>
        </Boton>
      </td>
    </tr>
  );
}
