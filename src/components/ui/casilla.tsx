"use client";

// `useId` es un hook: en un Server Component lanza en runtime, no en el build,
// así que el fallo aparecería la primera vez que alguien abriera la pantalla.
// Se declara aquí, en la primitiva, y ninguna pantalla tiene que acordarse.

import { useId } from "react";
import { TRANSICION_RAPIDA } from "@/lib/ui/clases";

import { cn } from "@/lib/ui/cn";

import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * CASILLA — DESIGN-SPEC §6, fila «Faceta», y §08 (Buscador y filtros).
 *
 * «Casilla de 15 px (radio 2, borde `--slate-600`); marcada = relleno
 * `--gold-400` con `✓` en `--void`. Recuento a la derecha en mono 11.»
 *
 * ── POR QUÉ NO ES UN `<div>` CON `onClick` ─────────────────────────────────
 * Es un `<input type="checkbox">` real, con la caja pintada encima mediante
 * `peer`. Así se conservan gratis: el foco del teclado, la barra espaciadora,
 * el estado `indeterminate`, el anuncio del lector de pantalla, la asociación
 * con el `<label>` y el envío dentro de un formulario. Una caja dibujada a mano
 * pierde las siete cosas y hay que reimplementarlas mal.
 *
 * ── EL OBJETIVO TÁCTIL ES EL LABEL, NO LA CAJA ─────────────────────────────
 * La caja mide 15 px porque lo manda el diseño. 15 px es menos de la mitad del
 * mínimo táctil de 44 px, así que **el área pulsable es la fila entera**
 * (`min-h-[var(--tactil-min)]` en el `<label>`), no el cuadrito. El diseño se
 * respeta y el dedo también.
 */

export type PropsCasilla = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  etiqueta: ReactNode;
  /**
   * Recuento a la derecha, en mono 11. `0` se apaga.
   * Ver `Chip` para el mismo criterio.
   */
  recuento?: number;
  /**
   * Estado intermedio («algunos hijos marcados»). No es un tercer valor de
   * `checked`: es un atributo del DOM que solo se puede poner por propiedad,
   * de ahí el `ref`.
   */
  indeterminado?: boolean;
};

const CAJA = cn(
  // 15 px exactos y radio 2: DESIGN-SPEC §08. No es --e-2 (16): es 15.
  "relative grid size-[15px] shrink-0 place-items-center rounded-[2px]",
  "border border-[var(--slate-600)] bg-transparent",
  TRANSICION_RAPIDA,
  // hover de la fila → borde dorado apagado
  "peer-hover:border-[var(--gold-700)]",
  // marcada → relleno oro sólido
  "peer-checked:border-[var(--gold-400)] peer-checked:bg-[var(--gold-400)]",
  "peer-indeterminate:border-[var(--gold-400)] peer-indeterminate:bg-[var(--gold-400)]",
  // foco → anillo dorado, igual que el resto del sistema
  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
  "peer-focus-visible:outline-[var(--gold-foco)]",
  "peer-disabled:border-[var(--slate-700)] peer-disabled:bg-transparent",
  // ── LAS MARCAS SE ENCIENDEN DESDE AQUÍ, NO DESDE ELLAS MISMAS ────────────
  // `peer-checked:` compila a `.peer:checked ~ .destino`: exige que el destino
  // sea HERMANO del input. El ✓ es un descendiente de esta caja, así que
  // `peer-checked:opacity-100` puesto sobre el propio ✓ no genera nada y la
  // casilla se quedaría sin marca visible, en silencio.
  // Se resuelve componiendo: la caja (que sí es hermana) alcanza a su hijo.
  "peer-checked:[&_.marca-check]:opacity-100",
  "peer-indeterminate:[&_.marca-indeterminada]:opacity-100",
);

export function Casilla({
  etiqueta,
  recuento,
  indeterminado = false,
  className,
  disabled,
  ...resto
}: PropsCasilla) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-[var(--tactil-min)] cursor-pointer items-center gap-[var(--e-1)]",
        "font-ui text-ui-s text-[var(--porcelain-200)]",
        TRANSICION_RAPIDA,
        "hover:text-[var(--porcelain-100)]",
        disabled === true && "cursor-not-allowed text-[var(--ash-400)] hover:text-[var(--ash-400)]",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        disabled={disabled}
        // `sr-only` y no `hidden`: un input oculto con `display:none` no recibe
        // foco ni se envía, y el lector de pantalla deja de verlo.
        className="peer sr-only"
        ref={(nodo) => {
          if (nodo !== null) nodo.indeterminate = indeterminado;
        }}
        {...resto}
      />

      <span className={CAJA} aria-hidden="true">
        {/* El ✓ va en --void sobre el oro: es el único par de alto contraste
         * que el diseño admite aquí, y nunca es oro sobre oro. */}
        <svg
          viewBox="0 0 10 10"
          className="marca-check size-[9px] opacity-0"
          fill="none"
          stroke="var(--void)"
          strokeWidth="2"
          strokeLinecap="square"
        >
          <path d="M1.5 5.2 4 7.6 8.5 2.6" />
        </svg>
        <span className="marca-indeterminada absolute h-[2px] w-[7px] bg-[var(--void)] opacity-0" />
      </span>

      <span className="min-w-0 flex-1 truncate">{etiqueta}</span>

      {recuento !== undefined && (
        <span
          className={cn(
            "font-mono text-mono-s tabular-nums",
            // lint-tokens-ok: un recuento a 0 ES el estado inactivo de la faceta
            recuento === 0 ? "text-[var(--ash-inactivo)]" : "text-[var(--ash-400)]",
          )}
        >
          {recuento}
        </span>
      )}
    </label>
  );
}
