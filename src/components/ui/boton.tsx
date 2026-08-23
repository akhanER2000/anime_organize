import { cn } from "@/lib/ui/cn";

import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * BOTÓN — DESIGN-SPEC §6, fila «Botón».
 *
 * ── LA REGLA DEL ORO Nº 3 ──────────────────────────────────────────────────
 * **Un solo botón `solido` por pantalla, como máximo.** El resto son `primario`
 * (obsidiana con borde dorado). En la landing el sólido es «Entrar al Vault»;
 * en el modal, «Añadir al vault»; en Ajustes, «Importar N series».
 *
 * No hay forma de comprobarlo en el tipo —dos botones sólidos en dos ficheros
 * distintos compilan igual—, así que lo verifica `ui-fidelity-checker` contra el
 * PNG del artboard.
 * ───────────────────────────────────────────────────────────────────────────
 */

export type VarianteBoton =
  /** Obsidiana con borde dorado. **El botón por defecto del sistema.** */
  | "primario"
  /** Relleno dorado sólido. Máximo UNO por pantalla. */
  | "solido"
  /** Borde neutro. Para acciones secundarias junto a un primario. */
  | "secundario"
  /** Granate. **Solo** en Ajustes → Peligro. No es un color de marca. */
  | "destructivo"
  /** Sin borde ni fondo. Para acciones terciarias y enlaces de acción. */
  | "fantasma";

export type TamanoBoton = "s" | "m" | "l";

/**
 * `className` SÍ se acepta, y es deliberado.
 *
 * Prohibirlo obligaría a las doce pantallas a envolver cada primitiva en un
 * `<div>` solo para colocarla, que es exactamente el código repetido que se
 * quería evitar. Lo que impide inventarse un color no es el tipo: es
 * `npm run lint:tokens`, que falla si aparece un hex fuera de globals.css.
 *
 * Se fusiona con `cn()`, así que lo que se pase aquí GANA sobre lo del
 * componente (twMerge resuelve el conflicto en favor de lo último).
 */
export type PropsBoton = {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /**
   * Muestra un spinner a la izquierda del texto y bloquea el botón.
   *
   * El ancho se mantiene: el spinner sustituye al icono, no se suma. Un botón
   * que cambia de tamaño al pulsarlo desplaza lo que tiene al lado.
   */
  cargando?: boolean;
  /** Ocupa todo el ancho disponible. */
  ancho?: boolean;
  /** Icono a la izquierda. Se oculta mientras `cargando`. */
  icono?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** Base común: geometría, tipografía, transición y foco. */
const BASE = cn(
  "inline-flex items-center justify-center gap-[var(--e-1)]",
  "rounded-boton border font-ui font-[var(--fw-ui-medium)] tracking-boton",
  "transition-colors duration-base ease-base",
  // Foco SIEMPRE visible: anillo de 2 px con 2 px de offset (DESIGN-SPEC §7).
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
  // Área táctil mínima en móvil.
  "min-h-[var(--tactil-min)] sm:min-h-0",
  "disabled:cursor-not-allowed",
);

const TAMANOS: Record<TamanoBoton, string> = {
  s: "h-8 px-[var(--e-2)] text-ui-s",
  m: "h-11 px-[var(--e-3)] text-ui",
  l: "h-12 px-[var(--e-4)] text-cuerpo-s",
};

/**
 * Variantes con sus ocho estados.
 *
 * `hover:` usa `borde-pan-de-oro` (ver `componentes.css`): un gradiente no cabe
 * en `border-color`, hace falta doble fondo.
 */
const VARIANTES: Record<VarianteBoton, string> = {
  primario: cn(
    "border-[var(--gold-400)] bg-[var(--slate-950)] text-[var(--gold-200)]",
    "hover:borde-pan-de-oro hover:text-[var(--gold-100)]",
    "active:bg-[var(--slate-700)]",
    "disabled:border-[var(--slate-600)] disabled:bg-[var(--slate-900)] disabled:text-[var(--ash-500)]",
  ),

  solido: cn(
    "border-transparent bg-[var(--gold-400)] text-[var(--void)]",
    "hover:bg-[var(--gold-300)]",
    "active:bg-[var(--gold-500)]",
    "disabled:bg-[var(--slate-700)] disabled:text-[var(--ash-500)]",
  ),

  secundario: cn(
    "border-[var(--slate-600)] bg-[var(--slate-900)] text-[var(--porcelain-100)]",
    "hover:border-[var(--slate-500,var(--slate-600))] hover:bg-[var(--slate-800)]",
    "active:bg-[var(--slate-700)]",
    "disabled:border-[var(--slate-700)] disabled:text-[var(--ash-500)]",
  ),

  destructivo: cn(
    "border-[var(--estado-abandonado-borde)] bg-[var(--slate-950)] text-[var(--estado-abandonado-texto)]",
    "hover:border-[var(--estado-abandonado)] hover:bg-[var(--estado-abandonado-wash)]",
    "active:bg-[var(--slate-700)]",
    "disabled:border-[var(--slate-600)] disabled:text-[var(--ash-500)]",
  ),

  fantasma: cn(
    "border-transparent bg-transparent text-[var(--porcelain-200)]",
    "hover:bg-[var(--slate-800)] hover:text-[var(--porcelain-100)]",
    "active:bg-[var(--slate-700)]",
    "disabled:text-[var(--ash-500)]",
  ),
};

export function Boton({
  variante = "primario",
  tamano = "m",
  cargando = false,
  ancho = false,
  icono,
  children,
  disabled,
  type = "button",
  className,
  ...resto
}: PropsBoton) {
  // Un botón cargando NO se puede pulsar: si no, el usuario envía dos veces.
  const bloqueado = disabled === true || cargando;

  return (
    <button
      type={type}
      disabled={bloqueado}
      // `aria-busy` es lo que anuncia el estado de carga a un lector de
      // pantalla: el spinner es puramente visual.
      aria-busy={cargando || undefined}
      {...resto}
      // `className` va el ÚLTIMO en `cn`: twMerge resuelve el conflicto en favor
      // de lo que pase quien llama, que es lo que espera al pasarlo.
      className={cn(BASE, TAMANOS[tamano], VARIANTES[variante], ancho && "w-full", className)}
    >
      {cargando ? (
        <span className="spinner-aro shrink-0" aria-hidden="true" />
      ) : (
        icono !== undefined && (
          <span className="shrink-0" aria-hidden="true">
            {icono}
          </span>
        )
      )}
      {children}
    </button>
  );
}
