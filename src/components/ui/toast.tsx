"use client";

import { useEffect } from "react";

import { cn } from "@/lib/ui/cn";

import type { ReactNode } from "react";

/**
 * TOAST — DESIGN-SPEC §6, fila «Toast», y artboard 11.
 *
 * 460 px máximo, borde izquierdo de 2 px, sombra de losa, acción a la derecha en
 * mono 12.
 *
 * ── ACCESIBILIDAD: `role` Y `aria-live` NO SON INTERCAMBIABLES ────────────
 *   · éxito e info  → `role="status"`  + `aria-live="polite"`: se anuncia cuando
 *     el lector termina lo que está diciendo. No interrumpe.
 *   · error         → `role="alert"`   + `aria-live="assertive"`: interrumpe.
 *     Se reserva para lo que el usuario tiene que saber YA.
 *
 * Un toast de éxito con `assertive` corta la lectura de la página por una
 * confirmación que no lo merece.
 */

export type TipoToast = "exito" | "error" | "progreso";

export type PropsToast = {
  tipo: TipoToast;
  mensaje: string;
  /** Acción a la derecha: «Deshacer», «Ver», «Reintentar». */
  accion?: { etiqueta: string; alPulsar: () => void };
  /**
   * Milisegundos hasta el cierre automático. `null` = no se cierra solo.
   *
   * El de «deshacer» del borrado son 10 s (encargo §2). Un toast con acción
   * NUNCA debería cerrarse antes de que dé tiempo a leerlo y pulsarlo.
   */
  duracionMs?: number | null;
  alCerrar?: () => void;
  icono?: ReactNode;
};

const BORDES: Record<TipoToast, string> = {
  exito: "border-l-[var(--gold-400)]",
  error: "border-l-[var(--estado-viendo)]",
  progreso: "border-l-[var(--slate-600)]",
};

export function Toast({ tipo, mensaje, accion, duracionMs = 6000, alCerrar, icono }: PropsToast) {
  useEffect(() => {
    if (duracionMs === null || alCerrar === undefined) return;
    const id = setTimeout(alCerrar, duracionMs);
    return () => clearTimeout(id);
  }, [duracionMs, alCerrar]);

  const esError = tipo === "error";

  return (
    <div
      role={esError ? "alert" : "status"}
      aria-live={esError ? "assertive" : "polite"}
      className={cn(
        "flex w-full max-w-[460px] items-center gap-[var(--e-1_5,12px)]",
        "rounded-card border border-[var(--slate-700)] border-l-2",
        "bg-[var(--slate-850)] px-[var(--e-2)] py-[var(--e-1_5,12px)]",
        "shadow-[var(--sombra-losa)]",
        BORDES[tipo],
      )}
    >
      {tipo === "progreso" ? (
        <span className="spinner-aro shrink-0" aria-hidden="true" />
      ) : (
        icono !== undefined && (
          <span className="shrink-0" aria-hidden="true">
            {icono}
          </span>
        )
      )}

      <p className="flex-1 font-ui text-ui-s text-[var(--porcelain-100)]">{mensaje}</p>

      {accion !== undefined && (
        <button
          type="button"
          onClick={accion.alPulsar}
          className={cn(
            "shrink-0 font-mono text-mono underline underline-offset-2",
            "text-[var(--gold-300)] transition-colors duration-base ease-base",
            "hover:text-[var(--gold-200)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
          )}
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
