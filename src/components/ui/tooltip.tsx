"use client";

import { cloneElement, useId, useState } from "react";

import { cn } from "@/lib/ui/cn";

import type { ReactElement } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOOLTIP — la etiqueta que aparece al posarse o al enfocar.
 *
 * ── UN TOOLTIP NO PUEDE SER LA ÚNICA FORMA DE SABER ALGO ──────────────────
 *
 * Esta es la regla que decide todo lo demás: **si el dato solo está en el
 * tooltip, no existe en móvil**. No hay «posarse» en una pantalla táctil, y
 * hacerlo aparecer al tocar convierte el primer toque en «enseñar la ayuda» y
 * el segundo en «hacer la acción», que es exactamente el patrón que la gente
 * odia de las webs mal portadas.
 *
 * Por eso el tooltip es **siempre redundante**: aclara, nunca informa. El
 * ejemplo del sistema es el conmutador de vista, cuyo botón ya lleva su
 * `aria-label` y su icono reconocible; el tooltip solo pone el nombre a la vista
 * para quien duda. Si algo NO se entiende sin el tooltip, la respuesta es
 * escribirlo en la pantalla, no envolverlo aquí.
 *
 * ── `aria-describedby`, NO `role="tooltip"` A SECAS ───────────────────────
 *
 * Un `role="tooltip"` que nadie referencia es un elemento que el lector de
 * pantalla no lee nunca: no hay nada que lo conecte con el control. La conexión
 * la hace `aria-describedby` en el hijo, y por eso el componente **clona** al
 * hijo en vez de envolverlo en un `<div>` — un envoltorio no puede llevar el
 * atributo que necesita el botón de dentro.
 *
 * Se usa `describedby` y no `labelledby` a propósito: el nombre del control es
 * su texto o su `aria-label`, y sustituirlo por el tooltip haría que el lector
 * anunciara la explicación en lugar del nombre.
 *
 * ── ESCAPE LO CIERRA ──────────────────────────────────────────────────────
 *
 * APG lo exige y tiene un motivo práctico: un tooltip puede tapar justo lo que
 * hay debajo, y sin Escape la única forma de quitarlo es mover el ratón fuera,
 * que con el foco puesto por teclado no es una opción.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsTooltip = {
  /** Lo que dice. Corto: es una aclaración, no una explicación. */
  readonly texto: string;
  /**
   * El control al que acompaña. Se le CLONA para añadirle
   * `aria-describedby` y los manejadores; no se envuelve.
   */
  readonly children: ReactElement<Record<string, unknown>>;
  readonly lado?: "arriba" | "abajo";
  readonly className?: string;
};

export function Tooltip({ texto, children, lado = "arriba", className }: PropsTooltip) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  const abrir = () => {
    setVisible(true);
  };
  const cerrar = () => {
    setVisible(false);
  };

  // El hijo puede traer sus propios manejadores —un `onFocus` que valida, un
  // `onBlur` que guarda—. Sustituirlos los perdería en silencio, así que se
  // encadenan: primero el suyo, después el del tooltip.
  const encadenar = (nombre: string, mio: () => void) => {
    const suyo = children.props[nombre];

    return (...args: unknown[]) => {
      if (typeof suyo === "function") (suyo as (...a: unknown[]) => void)(...args);
      mio();
    };
  };

  const hijo = cloneElement(children, {
    "aria-describedby": visible ? id : undefined,
    onMouseEnter: encadenar("onMouseEnter", abrir),
    onMouseLeave: encadenar("onMouseLeave", cerrar),
    // `focus`/`blur` y no `focus-visible`: quien llega con teclado tiene que
    // ver lo mismo que quien llega con ratón.
    onFocus: encadenar("onFocus", abrir),
    onBlur: encadenar("onBlur", cerrar),
  });

  return (
    <span
      className={cn("relative inline-flex", className)}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && visible) {
          // Sin `stopPropagation`: un tooltip dentro de un modal no debe
          // impedir que Escape cierre también el modal si ya no hay tooltip.
          cerrar();
        }
      }}
    >
      {hijo}

      {/* Se monta solo cuando se ve. Un tooltip permanentemente en el DOM con
       * `opacity-0` sigue siendo leído por algunos lectores al recorrer la
       * página, y entonces cada botón se lee dos veces. */}
      {visible && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-1/2 z-10 -translate-x-1/2",
            "rounded-chip border border-[var(--slate-600)] bg-[var(--slate-850)]",
            "px-[var(--e-1)] py-[var(--e-05)]",
            "font-ui text-ui-xs whitespace-nowrap text-[var(--porcelain-100)]",
            "shadow-[var(--sombra-losa)]",
            lado === "arriba" ? "bottom-[calc(100%+var(--e-1))]" : "top-[calc(100%+var(--e-1))]",
          )}
        >
          {texto}
        </span>
      )}
    </span>
  );
}
