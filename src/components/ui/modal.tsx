"use client";

import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/ui/cn";

import type { ReactNode } from "react";

/**
 * MODAL — DESIGN-SPEC §6, fila «Modal / hoja», y artboard 06.
 *
 * ── POR QUÉ `<dialog>` NATIVO Y NO UN DIV CON PORTAL ──────────────────────
 * El elemento `<dialog>` con `showModal()` da GRATIS y bien hecho:
 *   · atrapa el foco dentro (no se puede tabular fuera),
 *   · cierra con Escape,
 *   · marca el resto de la página como inerte para lectores de pantalla,
 *   · se pinta en la capa superior, sin pelearse con `z-index`.
 *
 * Un modal hecho a mano necesita reimplementar las cuatro cosas, y la primera
 * —la trampa de foco— se hace mal casi siempre. Es el mismo principio que el
 * resto del proyecto: usar lo que hace imposible el error en vez de recordarlo.
 *
 * Lo único que hay que añadir a mano es cerrar al pulsar el fondo, porque el
 * `::backdrop` no emite eventos propios.
 */

export type PropsModal = {
  abierto: boolean;
  /** Se llama al cerrar: Escape, clic en el fondo o el botón de cerrar. */
  alCerrar: () => void;
  titulo: string;
  /** Descripción bajo el título. Se conecta con `aria-describedby`. */
  descripcion?: string;
  /** Pie del modal: los botones de acción. */
  pie?: ReactNode;
  /** Ancho máximo. El del artboard 06 es 760 px. */
  ancho?: "estrecho" | "normal" | "ancho";
  children: ReactNode;
};

const ANCHOS = {
  estrecho: "max-w-[480px]",
  normal: "max-w-[760px]",
  ancho: "max-w-[960px]",
} as const;

export function Modal({
  abierto,
  alCerrar,
  titulo,
  descripcion,
  pie,
  ancho = "normal",
  children,
}: PropsModal) {
  const dialogo = useRef<HTMLDialogElement>(null);
  // `useId` en vez de ids fijos: dos modales en la misma página producían
  // `modal-titulo` duplicado, y entonces `aria-labelledby` apunta al primero —
  // el segundo diálogo se anuncia con el nombre del otro.
  const id = useId();
  const idTitulo = `${id}-titulo`;
  const idDescripcion = `${id}-descripcion`;

  useEffect(() => {
    const el = dialogo.current;
    if (el === null) return;

    // `showModal()` es lo que activa la trampa de foco y la inercia del resto
    // de la página. `open={true}` como atributo NO hace eso.
    if (abierto && !el.open) el.showModal();
    if (!abierto && el.open) el.close();
  }, [abierto]);

  return (
    <dialog
      ref={dialogo}
      aria-labelledby={idTitulo}
      aria-describedby={descripcion !== undefined ? idDescripcion : undefined}
      /**
       * SOLO `onClose`. Antes había también un `onCancel` que llamaba a
       * `alCerrar()`, y Escape dispara LOS DOS: `cancel` y después `close`. El
       * resultado era `alCerrar()` ejecutado dos veces por cierre — inofensivo
       * con un `setState`, pero no con un «deshacer» o un `router.back()`.
       */
      onClose={alCerrar}
      // El `::backdrop` no emite eventos: se detecta el clic FUERA del contenido
      // comparando con el rectángulo del propio diálogo.
      onClick={(e) => {
        if (e.target === dialogo.current) alCerrar();
      }}
      className={cn(
        "w-[90vw] rounded-card border-t border-t-[var(--gold-400)]",
        "bg-[var(--slate-900)] p-0 text-[var(--porcelain-100)]",
        "shadow-[var(--sombra-losa)]",
        "backdrop:bg-[var(--void)]/86",
        ANCHOS[ancho],
      )}
    >
      <div className="flex flex-col gap-[var(--e-3)] p-[var(--e-4)]">
        <div className="flex flex-col gap-[var(--e-1)]">
          <h2
            id={idTitulo}
            className="font-display text-titulo-m font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]"
          >
            {titulo}
          </h2>
          {descripcion !== undefined && (
            <p id={idDescripcion} className="font-ui text-ui-s text-[var(--ash-400)]">
              {descripcion}
            </p>
          )}
        </div>

        <div>{children}</div>

        {pie !== undefined && (
          <div className="flex items-center justify-end gap-[var(--e-1-5)]">{pie}</div>
        )}
      </div>
    </dialog>
  );
}
