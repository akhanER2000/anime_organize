"use client";

import { cn } from "@/lib/ui/cn";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * CHIP DE FILTRO — DESIGN-SPEC §6, fila «Chip de filtro».
 *
 * Es un BOTÓN, no un `<div>` con `onClick`: así responde a Enter y Espacio, sale
 * en el orden de tabulación y un lector lo anuncia como pulsable sin que haya
 * que añadir `role` ni `tabIndex` a mano.
 *
 * `aria-pressed` es lo que comunica «activo» a un lector de pantalla; el
 * subrayado dorado es la mitad visual de lo mismo.
 */

export type PropsChip = {
  activo?: boolean;
  /** Recuento a la derecha, en mono 11. `0` se pinta en `--ash-500`. */
  recuento?: number;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed">;

export function Chip({
  activo = false,
  recuento,
  children,
  disabled,
  className,
  ...resto
}: PropsChip) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 items-center gap-[var(--e-1)] rounded-chip border",
        "px-[var(--e-1_5,12px)] font-ui text-ui-s",
        "transition-colors duration-base ease-base",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        activo
          ? cn(
              "border-[var(--gold-borde)] bg-[var(--gold-wash)] text-[var(--gold-200)]",
              // Subrayado dorado con halo: la mitad visual de `aria-pressed`.
              "shadow-[inset_0_-1px_0_0_var(--gold-400),var(--halo-subrayado)]",
            )
          : cn(
              "border-[var(--slate-700)] bg-[var(--slate-900)] text-[var(--porcelain-200)]",
              "hover:border-[var(--slate-600)] hover:text-[var(--porcelain-100)]",
            ),
        className,
      )}
      {...resto}
    >
      {children}
      {recuento !== undefined && (
        <span
          className={cn(
            "font-mono text-mono-s",
            recuento === 0 ? "text-[var(--ash-500)]" : "text-[var(--ash-400)]",
          )}
        >
          {recuento}
        </span>
      )}
    </button>
  );
}

export type PropsChipEspejo = {
  /** V1 · V2 · V3… */
  etiqueta: string;
  url: string;
  activo?: boolean;
  /** Espejo caído: se marca, no se oculta. */
  roto?: boolean;
};

/**
 * CHIP DE ESPEJO — DESIGN-SPEC §6, fila «Chip de espejo».
 *
 * Es un enlace de verdad: se puede abrir en otra pestaña con el clic central,
 * copiar la dirección y se ve al pasar por encima. Un `<button>` con
 * `window.open` no da nada de eso.
 *
 * `rel="noopener noreferrer"` no es opcional: sin `noopener`, la página destino
 * puede manipular la nuestra con `window.opener`.
 */
export function ChipEspejo({ etiqueta, url, activo = false, roto = false }: PropsChipEspejo) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-current={activo ? "true" : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded-chip border px-[var(--e-1)]",
        "font-mono text-mono-s transition-colors duration-base ease-base",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
        roto
          ? "border-[var(--estado-abandonado-borde)] text-[var(--estado-abandonado-texto)] line-through"
          : activo
            ? "border-[var(--gold-borde)] bg-[var(--gold-wash)] text-[var(--gold-200)]"
            : cn(
                "border-[var(--slate-700)] text-[var(--ash-400)]",
                "hover:border-[var(--gold-700)] hover:text-[var(--gold-300)]",
              ),
      )}
    >
      {etiqueta}
      {roto && <span className="sr-only"> (enlace caído)</span>}
    </a>
  );
}
