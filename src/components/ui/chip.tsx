"use client";

import { cn } from "@/lib/ui/cn";
import { FOCO_DORADO, TRANSICION } from "@/lib/ui/clases";

import type { Estado } from "@/lib/domain/enums";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Un recuento de 0 se apaga. Es el ÚNICO texto no interactivo del chip: el
 * número no aporta nada cuando no hay nada que contar, y la etiqueta —que sí
 * lleva la información— se pinta a contraste pleno al lado.
 *
 * Por eso puede usar `--ash-inactivo` (2,4–2,9:1). Ver el comentario del token
 * en `globals.css`: fuera de un contexto inactivo, `lint:tokens` lo rechaza.
 */
// lint-tokens-ok: el recuento a 0 ES el estado inactivo — ver el TSDoc de arriba
const RECUENTO_INACTIVO = "text-[var(--ash-inactivo)]";

/**
 * CHIP DE FILTRO — DESIGN-SPEC §6, fila «Chip de filtro».
 *
 * Es un BOTÓN, no un `<div>` con `onClick`: así responde a Enter y Espacio, sale
 * en el orden de tabulación y un lector lo anuncia como pulsable sin que haya
 * que añadir `role` ni `tabIndex` a mano.
 *
 * `aria-pressed` es lo que comunica «activo» a un lector de pantalla; el
 * subrayado dorado es la mitad visual de lo mismo.
 *
 * ── `como="span"`: CUANDO EL CHIP NAVEGA EN VEZ DE ALTERNAR ───────────────
 *
 * En la biblioteca (§03) los chips **son filtros que viven en la URL**, no
 * estado local: pulsar uno navega. Y lo que navega tiene que ser un `<a>`, o se
 * pierden el botón de atrás, «abrir en pestaña nueva», el arrastre del enlace y
 * la posibilidad de compartir la vista filtrada pegando la dirección.
 *
 * Un `<button>` dentro de un `<a>` es HTML inválido —y los navegadores lo
 * reparan de formas distintas—, así que en ese caso el chip se pinta como
 * `<span>` y es el `Link` de alrededor quien aporta la semántica. Ahí no va
 * `aria-pressed`, que es de botón: lo correcto en un enlace de filtro es
 * `aria-current`, y lo pone quien envuelve.
 */

export type PropsChip = {
  activo?: boolean;
  /** Recuento a la derecha, en mono 11. `0` se apaga: ver `RECUENTO_INACTIVO`. */
  recuento?: number;
  /**
   * `"button"` (por defecto) alterna un estado. `"span"` cuando el chip va
   * dentro de un `Link` porque el filtro vive en la URL. Ver la cabecera.
   */
  como?: "button" | "span";
  /**
   * Punto de color del estado, como en el artboard 03. Va acompañado SIEMPRE
   * del texto de la etiqueta: el color nunca comunica solo.
   */
  estado?: Estado;
  children: ReactNode;
  /**
   * `type` NO se puede pasar: lo fija el componente en `"button"`.
   *
   * Un `<button>` sin `type` DENTRO de un `<form>` es `submit` por
   * definición del HTML, y estos chips son el control de filtrado. Un
   * `type="submit"` colado convertía el chip en el botón de envío del
   * formulario que lo contenga —y, si era el primero, en el envío por defecto
   * al pulsar Enter en cualquier input—.
   */
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed" | "type">;

/**
 * El punto de color de cada estado. Los mismos tokens que usa `BadgeEstado`:
 * dos sitios pintando el mismo estado de dos colores distintos es justo lo que
 * hace que un sistema de diseño deje de parecerlo.
 */
const PUNTO_DE_ESTADO: Readonly<Record<Estado, string>> = {
  VISTO: "bg-[var(--estado-visto)]",
  VIENDO: "bg-[var(--estado-viendo)]",
  EN_ESPERA: "bg-[var(--estado-espera)]",
  ABANDONADO: "bg-[var(--estado-abandonado)]",
  PENDIENTE: "bg-[var(--estado-pendiente)]",
};

export function Chip({
  activo = false,
  recuento,
  como = "button",
  estado,
  children,
  disabled,
  className,
  ...resto
}: PropsChip) {
  const Elemento = como;
  const propiosDeBoton =
    como === "button" ? ({ type: "button", "aria-pressed": activo, disabled } as const) : {};

  return (
    <Elemento
      // El spread del llamador va DELANTE de lo que el chip garantiza: JSX
      // aplica los atributos en orden y el último gana entero. Con `{...resto}`
      // al final, pisaba el `type="button"` de `propiosDeBoton`.
      {...resto}
      {...propiosDeBoton}
      className={cn(
        // ── 32 px DE ALTO VISIBLE, 44 px DE ÁREA PULSABLE ──────────────────
        // El diseño manda 32 px y no se toca. Pero 32 < 44, el mínimo táctil
        // del propio sistema (`--tactil-min`, DESIGN-SPEC §7), y estos chips
        // son el control principal del filtrado en móvil.
        //
        // El pseudo-elemento `::before` extiende el área pulsable por encima y
        // por debajo SIN cambiar un píxel de lo que se ve ni empujar el layout
        // (va en `absolute`). El dedo acierta y el diseño queda intacto.
        "relative inline-flex h-[var(--e-4)] items-center gap-[var(--e-1)] rounded-chip border",
        "before:absolute before:inset-x-0 before:top-1/2 before:h-[var(--tactil-min)]",
        "before:-translate-y-1/2 before:content-['']",
        "px-[var(--e-1-5)] font-ui text-ui-s",
        TRANSICION,
        FOCO_DORADO,
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
        // Un `<span>` no se deshabilita solo: se le quita el aspecto a mano.
        como === "span" && disabled === true && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {estado !== undefined && (
        <span
          aria-hidden="true"
          className={cn("size-[6px] shrink-0 rounded-barra", PUNTO_DE_ESTADO[estado])}
        />
      )}
      {children}
      {recuento !== undefined && (
        <span
          className={cn(
            "font-mono text-mono-s",
            recuento === 0 ? RECUENTO_INACTIVO : "text-[var(--ash-400)]",
          )}
        >
          {recuento}
        </span>
      )}
    </Elemento>
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
        // Mismo criterio que el chip de filtro: 28 px visibles (DESIGN-SPEC
        // §6, fila «Chip de espejo»), 44 px pulsables.
        "relative inline-flex h-[var(--e-3-5)] items-center rounded-chip border px-[var(--e-1)]",
        "before:absolute before:inset-x-0 before:top-1/2 before:h-[var(--tactil-min)]",
        "before:-translate-y-1/2 before:content-['']",
        "font-mono text-mono-s transition-colors duration-[var(--dur-base)] ease-base",
        FOCO_DORADO,
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
