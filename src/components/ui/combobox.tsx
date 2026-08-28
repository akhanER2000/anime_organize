"use client";

import { useId, useRef, useState } from "react";
import { CAJA_DE_CONTROL } from "@/lib/ui/clases";

import { cn } from "@/lib/ui/cn";
import { indiceCircular } from "@/lib/ui/navegacion-circular";

import type { KeyboardEvent, ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COMBOBOX — escribir para filtrar, elegir de la lista.
 *
 * Es lo que necesitan el buscador de títulos del artboard 07 y el selector de
 * sitio de un enlace de continuación: **muchas opciones y un texto libre que
 * las filtra**. Un `<select>` no vale con 83 series ni con una lista de sitios
 * que crece, y un `<input>` a secas obliga a escribirlo entero y sin erratas.
 *
 * ── POR QUÉ NO SE PUEDE USAR `<datalist>`, QUE SERÍA LO NATIVO ────────────
 *
 * Sería la respuesta correcta —igual que `<select>` lo es para el `Selector`—
 * si se pudiera pintar. No se puede: el desplegable de `<datalist>` lo dibuja el
 * sistema operativo y **no acepta ni un solo estilo**. Aquí eso significa una
 * caja blanca de Windows encima de la losa negra, con la tipografía del sistema.
 * Además, Safari lo trata de forma distinta y en algunas versiones no filtra.
 *
 * La consecuencia hay que asumirla entera: al no usar el elemento, hay que
 * reimplementar a mano TODO lo que da gratis, y ahí es donde fallan casi todos
 * los combobox del mundo. Lo que implementa este, deliberadamente:
 *
 *   · `role="combobox"` con `aria-expanded`, `aria-controls` y `aria-haspopup`
 *   · `aria-activedescendant` — el foco NO se mueve a la opción; se queda en el
 *     input y se anuncia cuál está resaltada. Mover el foco de verdad rompería
 *     el poder seguir escribiendo, que es el punto entero del control.
 *   · ↓ ↑ recorren, Home/End saltan a los extremos, la lista es circular
 *   · Enter elige la resaltada; Escape cierra sin elegir; Tab cierra y sigue
 *   · el foco fuera cierra (sin `setTimeout`, ver abajo)
 *   · `aria-live` anuncia cuántas opciones quedan al filtrar
 *
 * ── ELEGIR CON EL RATÓN ES LO QUE SE ROMPE, Y NO SE ARREGLA CON UN TIMEOUT ─
 *
 * Al pulsar una opción con el ratón, el `blur` del input llega ANTES que el
 * `click` de la opción. Cerrar en el `blur` desmonta la opción antes de que su
 * clic se procese, y **elegir con el ratón deja de funcionar** mientras que con
 * el teclado va bien: el fallo clásico de esta primitiva, y de los que solo se
 * ven probando con ratón.
 *
 * Se resuelve mirando a dónde fue el foco (`relatedTarget`): si sigue dentro del
 * componente, no se cierra. Es más preciso que un `setTimeout`, que es la otra
 * solución habitual y depende de que 150 ms sean suficientes.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type OpcionCombobox = {
  readonly valor: string;
  readonly etiqueta: string;
  /** Segunda línea: el año, el estado, el tipo de sitio… */
  readonly detalle?: string;
};

export type PropsCombobox = {
  readonly etiqueta: string;
  readonly opciones: readonly OpcionCombobox[];
  readonly valor: string;
  readonly onCambiar: (texto: string) => void;
  /** Se llama al ELEGIR una opción, que no es lo mismo que escribir. */
  readonly onElegir: (opcion: OpcionCombobox) => void;
  readonly placeholder?: string;
  readonly etiquetaOculta?: boolean;
  readonly disabled?: boolean;
  /** Qué poner cuando el filtro no deja ninguna. */
  readonly vacio?: ReactNode;
  readonly className?: string;
};

export function Combobox({
  etiqueta,
  opciones,
  valor,
  onCambiar,
  onElegir,
  placeholder,
  etiquetaOculta = false,
  disabled = false,
  vacio = "Ninguna coincidencia",
  className,
}: PropsCombobox) {
  const id = useId();
  const idLista = `${id}-lista`;
  const [abierto, setAbierto] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const contenedor = useRef<HTMLDivElement>(null);

  const hayOpciones = opciones.length > 0;
  // Acotar en vez de confiar en el índice: la lista cambia con cada tecla, y un
  // índice que se sale deja `aria-activedescendant` apuntando a un id muerto.
  const indice = hayOpciones ? Math.min(resaltada, opciones.length - 1) : -1;
  const activa = indice >= 0 ? opciones[indice] : undefined;

  const abrir = () => {
    if (!disabled) setAbierto(true);
  };

  const elegir = (opcion: OpcionCombobox) => {
    onElegir(opcion);
    setAbierto(false);
    setResaltada(0);
  };

  const alPulsarTecla = (evento: KeyboardEvent<HTMLInputElement>) => {
    if (evento.key === "Escape") {
      setAbierto(false);
      return;
    }

    if (evento.key === "Tab") {
      // Tab NO elige: se marcha del control dejándolo como estaba. Elegir al
      // tabular es el comportamiento que hace que la gente acabe con valores
      // que no puso.
      setAbierto(false);
      return;
    }

    if (evento.key === "Enter") {
      if (abierto && activa !== undefined) {
        // Sin esto, Enter envía el formulario que envuelve al combobox antes de
        // que se procese la elección.
        evento.preventDefault();
        elegir(activa);
      }
      return;
    }

    const salto = { ArrowDown: 1, ArrowUp: -1 } as const;
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      // `preventDefault` para que la flecha no mueva el cursor de texto al
      // principio o al final mientras recorre la lista.
      evento.preventDefault();
      if (!abierto) {
        abrir();
        return;
      }
      if (!hayOpciones) return;
      const paso = salto[evento.key as "ArrowDown" | "ArrowUp"];
      setResaltada((n) => indiceCircular(n, paso, opciones.length));
      return;
    }

    if (evento.key === "Home" && abierto) {
      evento.preventDefault();
      setResaltada(0);
      return;
    }
    if (evento.key === "End" && abierto && hayOpciones) {
      evento.preventDefault();
      setResaltada(opciones.length - 1);
    }
  };

  return (
    <div
      ref={contenedor}
      className={cn("flex flex-col gap-[var(--e-1)]", className)}
      onBlur={(evento) => {
        // Si el foco se fue A UNA OPCIÓN de esta misma lista, no se cierra: el
        // `click` todavía no ha llegado. Ver la cabecera.
        const destino = evento.relatedTarget;
        if (destino instanceof Node && contenedor.current?.contains(destino) === true) return;
        setAbierto(false);
      }}
    >
      <label
        htmlFor={id}
        className={cn(
          "font-ui text-ui-s font-[var(--fw-ui-medium)] text-[var(--porcelain-200)]",
          etiquetaOculta && "sr-only",
        )}
      >
        {etiqueta}
      </label>

      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={idLista}
          aria-autocomplete="list"
          // El foco NO se mueve a la opción: se queda aquí y se ANUNCIA cuál
          // está resaltada. Es lo que permite seguir escribiendo.
          aria-activedescendant={
            abierto && activa !== undefined ? `${id}-op-${activa.valor}` : undefined
          }
          autoComplete="off"
          value={valor}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(evento) => {
            onCambiar(evento.target.value);
            setResaltada(0);
            abrir();
          }}
          onFocus={abrir}
          onKeyDown={alPulsarTecla}
          className={cn(
            CAJA_DE_CONTROL,
            "h-[var(--tactil-min)]",
            // lint-tokens-ok: `--ash-inactivo` es el token del placeholder
            "placeholder:text-[var(--ash-inactivo)]",
          )}
        />

        {abierto && (
          <ul
            id={idLista}
            role="listbox"
            aria-label={etiqueta}
            className={cn(
              "absolute inset-x-0 top-[calc(100%+var(--e-05))] z-10 max-h-[280px] overflow-y-auto",
              "rounded-input border border-[var(--slate-600)] bg-[var(--slate-850)]",
              "py-[var(--e-05)] shadow-[var(--sombra-losa)]",
            )}
          >
            {!hayOpciones && (
              <li className="px-[var(--e-2)] py-[var(--e-1)] font-ui text-ui-s text-[var(--ash-400)]">
                {vacio}
              </li>
            )}

            {opciones.map((opcion, i) => (
              <li
                key={opcion.valor}
                id={`${id}-op-${opcion.valor}`}
                role="option"
                aria-selected={i === indice}
                // `mousedown` y no `click`: `mousedown` llega ANTES del `blur`
                // del input, así que la elección se procesa con la lista aún
                // montada pase lo que pase con el foco.
                onMouseDown={(evento) => {
                  evento.preventDefault();
                  elegir(opcion);
                }}
                onMouseEnter={() => {
                  setResaltada(i);
                }}
                className={cn(
                  "cursor-pointer px-[var(--e-2)] py-[var(--e-1)]",
                  "font-ui text-ui-s",
                  i === indice
                    ? "bg-[var(--gold-wash)] text-[var(--porcelain-050)]"
                    : "text-[var(--porcelain-200)]",
                )}
              >
                {opcion.etiqueta}
                {opcion.detalle !== undefined && (
                  <span className="ml-[var(--e-1)] font-mono text-mono-s text-[var(--ash-400)]">
                    {opcion.detalle}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Sin esto, quien usa lector de pantalla escribe y no se entera de que la
       * lista pasó de 83 a 2 opciones: el `listbox` no anuncia su propio tamaño
       * al cambiar. `polite` para no cortar lo que esté leyendo. */}
      <span aria-live="polite" className="sr-only">
        {abierto
          ? hayOpciones
            ? `${String(opciones.length)} ${opciones.length === 1 ? "opción disponible" : "opciones disponibles"}`
            : "Ninguna coincidencia"
          : ""}
      </span>
    </div>
  );
}
