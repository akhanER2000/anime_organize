"use client";

import { useId, useState } from "react";
import { FOCO_DORADO, TRANSICION } from "@/lib/ui/clases";

import { cn } from "@/lib/ui/cn";

import { BarraProgreso } from "./card";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BARRA DE PROGRESO EDITABLE — artboard 05 (ficha) y el modal del 06.
 *
 * `BarraProgreso` en `card.tsx` PINTA el progreso. Esta lo deja CAMBIAR, y son
 * dos cosas distintas: la primera aparece 83 veces en la rejilla y tiene que ser
 * un `<div>` barato; ésta aparece una vez y necesita ser un control de verdad.
 *
 * ── ES UN `<input type="range">`, NO UNA BARRA CON `onClick` ──────────────
 *
 * Una barra que calcula el porcentaje a partir de dónde cayó el clic es la
 * versión que casi todo el mundo escribe, y es inservible sin ratón: no tiene
 * foco, no responde a las flechas, no anuncia su valor y no se puede ajustar con
 * precisión ni con el dedo. El `<input type="range">` da las cuatro cosas —más
 * PageUp/PageDown y Home/End— y se pinta entero con `appearance-none`.
 *
 * ── LOS BOTONES RÁPIDOS SON EL CAMINO PRINCIPAL ───────────────────────────
 *
 * La skill de dominio §4 fija tres: **+1 episodio**, **marcar temporada
 * completa** y **marcar todo visto**. Son lo que la gente usa de verdad: nadie
 * arrastra una barra hasta el 63 % para decir «voy por el capítulo 7 de 11».
 * El deslizador está para el caso `PORCENTAJE`, que es el minoritario.
 *
 * Por eso los botones van ANTES en el DOM que el deslizador: el orden de
 * tabulación tiene que ofrecer primero lo que se usa.
 *
 * ── LA UI ES OPTIMISTA, Y EL VALOR VIVE FUERA ─────────────────────────────
 *
 * §4 de la skill: «se pinta el cambio y se revierte si el servidor falla». Este
 * componente es **controlado** —el valor y su revertido son de quien lo usa—,
 * pero mantiene un estado local mientras se ARRASTRA: mandar una mutación por
 * cada píxel del recorrido serían cincuenta peticiones para un gesto. Se avisa
 * al soltar (`onChange` del range, que en React se dispara al mover, y
 * `onPointerUp`/`onKeyUp` para confirmar).
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsProgresoEditable = {
  /** 0–100. `null` = indeterminado: el deslizador arranca en 0. */
  readonly porcentaje: number | null;
  /** Lo que se pinta bajo la barra: «Temporada 2 · episodio 7». */
  readonly etiqueta: string;
  readonly abandonado?: boolean;
  readonly disabled?: boolean;
  /** Se llama al SOLTAR, no en cada píxel del arrastre. */
  readonly onCambiar: (porcentaje: number) => void;
  /** Skill de dominio §4. Si falta, su botón no se pinta. */
  readonly onEpisodioMas?: () => void;
  readonly onTemporadaCompleta?: () => void;
  readonly onTodoVisto?: () => void;
  readonly className?: string;
};

export function ProgresoEditable({
  porcentaje,
  etiqueta,
  abandonado = false,
  disabled = false,
  onCambiar,
  onEpisodioMas,
  onTemporadaCompleta,
  onTodoVisto,
  className,
}: PropsProgresoEditable) {
  const id = useId();
  // `null` mientras no se arrastra: así el valor de fuera manda, y el local
  // solo existe durante el gesto. Un `useState(porcentaje)` a secas se quedaría
  // desincronizado en cuanto el servidor devolviera otro número.
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const mostrado = arrastrando ?? porcentaje ?? 0;

  const confirmar = () => {
    if (arrastrando === null) return;
    onCambiar(arrastrando);
    setArrastrando(null);
  };

  const rapidos = [
    { al: onEpisodioMas, texto: "+1 episodio" },
    { al: onTemporadaCompleta, texto: "Temporada completa" },
    { al: onTodoVisto, texto: "Todo visto" },
  ].filter((b): b is { al: () => void; texto: string } => b.al !== undefined);

  return (
    <div className={cn("flex flex-col gap-[var(--e-1-5)]", className)}>
      {/* Los botones PRIMERO: es lo que se usa, y el tabulador tiene que
       * ofrecerlo antes que el deslizador. */}
      {rapidos.length > 0 && (
        <div className="flex flex-wrap gap-[var(--e-1)]">
          {rapidos.map((boton) => (
            <button
              key={boton.texto}
              type="button"
              onClick={boton.al}
              disabled={disabled}
              className={cn(
                "rounded-chip border px-[var(--e-1-5)] py-[var(--e-05)]",
                "min-h-[var(--tactil-min)] tablet:min-h-0",
                "font-ui text-ui-s",
                "border-[var(--slate-700)] bg-[var(--slate-900)] text-[var(--porcelain-200)]",
                TRANSICION,
                "hover:border-[var(--gold-borde)] hover:text-[var(--gold-200)]",
                FOCO_DORADO,
                // lint-tokens-ok: estado deshabilitado
                "disabled:cursor-not-allowed disabled:text-[var(--ash-inactivo)]",
              )}
            >
              {boton.texto}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-[var(--e-05)]">
        <label htmlFor={id} className="sr-only">
          Progreso, en porcentaje
        </label>

        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={mostrado}
          disabled={disabled}
          // El texto, no el número: «65» a secas no dice nada. El lector lee
          // «Temporada 2 · episodio 7» igual que lo lee quien ve la pantalla.
          aria-valuetext={etiqueta}
          onChange={(evento) => {
            setArrastrando(Number(evento.target.value));
          }}
          onPointerUp={confirmar}
          onKeyUp={confirmar}
          // El puntero puede soltarse fuera del control: sin esto, el gesto se
          // queda a medias y el valor nunca se confirma.
          onBlur={confirmar}
          className="deslizador-progreso"
        />

        {/* La barra pintada sigue siendo la MISMA primitiva que la rejilla:
         * si el relleno cambiara de aspecto aquí, el mismo progreso se vería
         * distinto en dos pantallas. `aria-hidden` porque el `range` de arriba
         * ya anuncia el valor, y anunciarlo dos veces es peor que una. */}
        <div aria-hidden="true">
          <BarraProgreso
            porcentaje={arrastrando ?? porcentaje}
            grosor="acento"
            abandonado={abandonado}
            etiqueta={etiqueta}
          />
        </div>

        <p className="font-mono text-mono-s text-[var(--ash-400)]">{etiqueta}</p>
      </div>
    </div>
  );
}
