"use client";

import { useId, useRef, useState } from "react";
import { FOCO_DORADO, TRANSICION } from "@/lib/ui/clases";

import { cn } from "@/lib/ui/cn";
import { indiceCircular } from "@/lib/ui/navegacion-circular";

import type { KeyboardEvent, ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PESTAÑAS — DESIGN-SPEC §6 fila «Pestaña», y §5 (Ajustes, artboards 09–12).
 *
 * «48 px de alto sobre `border-bottom: 1px solid --slate-800`; texto
 * `--ash-400`, activa `--porcelain-100` con subrayado 1 px `--gold-400` + halo,
 * granate en Peligro.»
 *
 * ── LAS FLECHAS NO SON UN ADORNO DE ACCESIBILIDAD ─────────────────────────
 *
 * El patrón `tablist` de ARIA exige que **el conjunto de pestañas sea UNA sola
 * parada de tabulador** y que dentro se mueva con las flechas. No es una
 * preferencia: es lo que el lector de pantalla anuncia («pestaña 2 de 4»), y es
 * lo que evita que quien navega con teclado tenga que pasar por las cuatro
 * pestañas para llegar al contenido.
 *
 * Se implementa con `tabIndex` móvil: la activa vale 0 y las demás −1. Sin eso,
 * `role="tab"` es una etiqueta que promete un comportamiento que no existe, y
 * eso es peor que no ponerla — el lector anuncia «pestaña» y las flechas no
 * hacen nada.
 *
 * ── POR QUÉ NO SE DESMONTA EL PANEL OCULTO ────────────────────────────────
 *
 * Solo se pinta el panel activo. Es a propósito: Ajustes tiene un formulario
 * por pestaña, y mantenerlos todos montados significa cuatro formularios
 * escuchando a la vez y cuatro estados que se pisan. El coste es perder lo
 * escrito al cambiar de pestaña, y es el correcto aquí: cada pestaña de Ajustes
 * es una operación independiente que se guarda por su cuenta.
 *
 * ── EL PELIGRO ES GRANATE, Y ES LA ÚNICA EXCEPCIÓN ────────────────────────
 *
 * `design-tokens.md`: el granate aparece **solo** en la pestaña Peligro y en
 * errores de validación. No es un color de marca, así que `tono: "peligro"` es
 * una prop de la pestaña concreta y no una variante del componente entero.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Pestana = {
  readonly id: string;
  readonly etiqueta: string;
  /** Granate en vez de oro. Reservado a «Peligro» (DESIGN-SPEC §5). */
  readonly tono?: "normal" | "peligro";
  /** Punto brasa sobre la pestaña: hay un error dentro. DESIGN-SPEC §6. */
  readonly conError?: boolean;
  readonly contenido: ReactNode;
};

export type PropsPestanas = {
  readonly pestanas: readonly Pestana[];
  /** Cuál empieza abierta. Por defecto, la primera. */
  readonly inicial?: string;
  /** Nombre del grupo para el lector de pantalla: «Ajustes de la cuenta». */
  readonly etiqueta: string;
  readonly className?: string;
};

export function Pestanas({ pestanas, inicial, etiqueta, className }: PropsPestanas) {
  const primera = pestanas[0];
  const [activa, setActiva] = useState(inicial ?? primera?.id ?? "");
  const id = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  if (primera === undefined) return null;

  // Una `inicial` que no existe dejaría el grupo sin ninguna activa: ni panel
  // pintado ni parada de tabulador. Se cae a la primera, que siempre existe.
  const indiceActivo = Math.max(
    0,
    pestanas.findIndex((p) => p.id === activa),
  );
  const actual = pestanas[indiceActivo] ?? primera;

  const alPulsarTecla = (evento: KeyboardEvent<HTMLButtonElement>) => {
    const salto = { ArrowRight: 1, ArrowLeft: -1 } as const;
    const destino =
      evento.key === "Home"
        ? 0
        : evento.key === "End"
          ? pestanas.length - 1
          : evento.key === "ArrowRight" || evento.key === "ArrowLeft"
            ? // Circular, y la aritmética la hace `indiceCircular` porque
              // `Combobox` necesita la misma y en JS `-1 % 4` es `-1`.
              indiceCircular(indiceActivo, salto[evento.key], pestanas.length)
            : null;

    if (destino === null) return;

    evento.preventDefault();
    const siguiente = pestanas[destino];
    if (siguiente === undefined) return;

    setActiva(siguiente.id);
    // El foco tiene que SEGUIR a la selección, o el lector anuncia una pestaña
    // y el teclado sigue operando sobre otra.
    botones.current[destino]?.focus();
  };

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={etiqueta}
        className="flex gap-[var(--e-3)] overflow-x-auto border-b border-b-[var(--slate-800)]"
      >
        {pestanas.map((pestana, indice) => {
          const esActiva = pestana.id === actual.id;
          const esPeligro = pestana.tono === "peligro";

          return (
            <button
              key={pestana.id}
              ref={(nodo) => {
                botones.current[indice] = nodo;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${pestana.id}`}
              aria-selected={esActiva}
              aria-controls={`${id}-panel-${pestana.id}`}
              // La parada de tabulador es UNA para todo el grupo: la activa.
              tabIndex={esActiva ? 0 : -1}
              onClick={() => {
                setActiva(pestana.id);
              }}
              onKeyDown={alPulsarTecla}
              className={cn(
                "relative flex h-[48px] shrink-0 items-center gap-[var(--e-1)] px-[var(--e-05)]",
                "font-ui text-ui whitespace-nowrap",
                TRANSICION,
                FOCO_DORADO,
                esActiva
                  ? "text-[var(--porcelain-100)]"
                  : "text-[var(--ash-400)] hover:text-[var(--porcelain-100)]",
                esPeligro && esActiva && "text-[var(--estado-abandonado-texto)]",
              )}
            >
              {pestana.etiqueta}

              {/* Punto brasa: «hay un error dentro». Va acompañado de texto en
               * el propio panel — DESIGN-SPEC §7: el estado nunca se comunica
               * solo por color. */}
              {pestana.conError === true && (
                <span
                  className="size-[6px] rounded-[50%] bg-[var(--estado-viendo)] shadow-[var(--halo-punto)]"
                  aria-hidden="true"
                />
              )}
              {pestana.conError === true && <span className="sr-only">(tiene errores)</span>}

              {/* El subrayado va DENTRO del botón y no como `border-b`, porque
               * el borde del contenedor ya ocupa esa línea y los dos se
               * solaparían con un píxel de diferencia según el zoom. */}
              {esActiva && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-px",
                    esPeligro
                      ? "bg-[var(--estado-abandonado)]"
                      : "bg-[var(--gold-400)] shadow-[var(--halo-veta)]",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${id}-panel-${actual.id}`}
        aria-labelledby={`${id}-tab-${actual.id}`}
        // El panel es una parada de tabulador para que, tras elegir con las
        // flechas, `Tab` lleve AL CONTENIDO y no a lo que haya después.
        tabIndex={0}
        className="pt-[var(--e-3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]"
      >
        {actual.contenido}
      </div>
    </div>
  );
}
