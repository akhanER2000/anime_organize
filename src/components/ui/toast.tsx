"use client";

import { useEffect, useRef } from "react";
import { FOCO_DORADO } from "@/lib/ui/clases";

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
  // ── EL TEMPORIZADOR NO DEPENDE DE LA IDENTIDAD DE `alCerrar` ─────────────
  // `alCerrar` suele llegar como arrow inline (`alCerrar={() => quitar(id)}`),
  // así que cambia de identidad en CADA render del padre. Con `alCerrar` en las
  // dependencias, el efecto se limpiaba y volvía a montar cada vez: un toast
  // dentro de una pantalla que re-renderiza a menudo **no se cerraba nunca**,
  // porque su cuenta atrás empezaba de cero antes de llegar al final.
  //
  // La ref guarda siempre la última función sin participar en las dependencias:
  // el temporizador se arma UNA vez y llama a la versión vigente al disparar.
  const alCerrarRef = useRef(alCerrar);
  useEffect(() => {
    alCerrarRef.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    if (duracionMs === null) return;
    const id = setTimeout(() => alCerrarRef.current?.(), duracionMs);
    return () => clearTimeout(id);
  }, [duracionMs]);

  const esError = tipo === "error";

  return (
    <div
      role={esError ? "alert" : "status"}
      aria-live={esError ? "assertive" : "polite"}
      className={cn(
        "flex w-full max-w-[460px] items-center gap-[var(--e-1-5)]",
        "rounded-card border border-[var(--slate-700)] border-l-2",
        "bg-[var(--slate-850)] px-[var(--e-2)] py-[var(--e-1-5)]",
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
            "text-[var(--gold-300)] transition-colors duration-[var(--dur-base)] ease-base",
            "hover:text-[var(--gold-200)]",
            FOCO_DORADO,
          )}
        >
          {accion.etiqueta}
        </button>
      )}
    </div>
  );
}
