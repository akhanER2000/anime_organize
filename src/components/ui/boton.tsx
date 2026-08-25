import { Enlace } from "@/components/ui/enlace";
import { cn } from "@/lib/ui/cn";

import type { PropsEnlace } from "@/components/ui/enlace";
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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * `href` DECIDE EL ELEMENTO. Con `href` es un `<a>`; sin él, un `<button>`.
 *
 * ── POR QUÉ ESTO ES UNA PROP Y NO DOS COMPONENTES ─────────────────────
 *
 * Porque ya fueron dos, y camino de tres. La landing escribió
 * `boton-enlace.tsx` y la ficha `aspecto-boton.ts`, cada una reconstruyendo la
 * apariencia del botón con sus propios mapas de clases, y **empezaron a
 * divergir de inmediato**: el relleno dorado de la landing salía en negrita y
 * el de la primitiva no; su secundario era transparente con hover dorado y el
 * de la primitiva es `--slate-900` con hover neutro; su CTA de nav medía 40 px,
 * que no está en la escala del sistema.
 *
 * Ninguna de las tres diferencias fue una decisión: son lo que pasa cuando dos
 * personas reconstruyen lo mismo por separado. Y ese es exactamente el trabajo
 * que una primitiva existe para hacer una sola vez.
 *
 * ── LO QUE NO SE PUEDE ESCRIBIR, Y ES A PROPÓSITO ────────────────────
 *
 * La unión discriminada hace que `<Boton href="/x" cargando>` **no compile**, y
 * tampoco `disabled` ni `type`. No es purismo: un ancla no se puede
 * deshabilitar en HTML. Lo que se hace en su lugar —`aria-disabled` con
 * `pointer-events: none`— es un botón que parece apagado y **sigue navegando
 * con el teclado**. Antes que ofrecer eso, el compilador dice que no.
 *
 * Un ancla tampoco lleva `type`, y `type="submit"` en un enlace no hace nada:
 * es la clase de prop que se copia de un sitio a otro y falla en silencio.
 * ════════════════════════════════════════════════════════════════════════════
 */
type PropsComunes = {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Ocupa todo el ancho disponible. */
  ancho?: boolean;
  /** Icono a la izquierda. Se oculta mientras `cargando`. */
  icono?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Sin `href`: un `<button>` de verdad, con todo lo que eso permite. */
export type PropsBotonPulsable = PropsComunes & {
  href?: undefined;
  /**
   * Bloquea el botón y pinta el spinner en el hueco del icono.
   * Implica `disabled` y `aria-busy`.
   */
  cargando?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/** Con `href`: un ancla con aspecto de botón. Navega de verdad. */
export type PropsBotonEnlace = PropsComunes & {
  href: string;
  /** Abre en pestaña nueva. Implica `rel="noopener noreferrer"`, sin opción. */
  externo?: boolean;
} & Omit<PropsEnlace, "href" | "className" | "children" | "desnudo" | "externo">;

export type PropsBoton = PropsBotonPulsable | PropsBotonEnlace;

/** Base común: geometría, tipografía, transición y foco. */
const BASE = cn(
  "inline-flex items-center justify-center gap-[var(--e-1)] no-underline",
  "rounded-boton border font-ui font-[var(--fw-ui-medium)] tracking-boton",
  "transition-colors duration-[var(--dur-base)] ease-base",
  // Foco SIEMPRE visible: anillo de 2 px con 2 px de offset (DESIGN-SPEC §7).
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]",
  // Área táctil mínima en móvil.
  "min-h-[var(--tactil-min)] tablet:min-h-0",
  "disabled:cursor-not-allowed",
);

const TAMANOS: Record<TamanoBoton, string> = {
  s: "h-[var(--e-4)] px-[var(--e-2)] text-ui-s",
  m: "h-[var(--tactil-min)] px-[var(--e-3)] text-ui",
  l: "h-[var(--e-6)] px-[var(--e-4)] text-cuerpo-s",
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
    "disabled:border-[var(--slate-600)] disabled:bg-[var(--slate-900)] disabled:text-[var(--ash-inactivo)]",
  ),

  solido: cn(
    "border-transparent bg-[var(--gold-400)] text-[var(--void)]",
    "hover:bg-[var(--gold-300)]",
    "active:bg-[var(--gold-500)]",
    "disabled:bg-[var(--slate-700)] disabled:text-[var(--ash-inactivo)]",
  ),

  secundario: cn(
    "border-[var(--slate-600)] bg-[var(--slate-900)] text-[var(--porcelain-100)]",
    // `--slate-500` no existe en el sistema. El hover del secundario aclara
    // la superficie, que es lo que la spec llama «borde aclarado».
    "hover:border-[var(--slate-600)] hover:bg-[var(--slate-800)]",
    "active:bg-[var(--slate-700)]",
    "disabled:border-[var(--slate-700)] disabled:text-[var(--ash-inactivo)]",
  ),

  destructivo: cn(
    "border-[var(--estado-abandonado-borde)] bg-[var(--slate-950)] text-[var(--estado-abandonado-texto)]",
    "hover:border-[var(--estado-abandonado)] hover:bg-[var(--estado-abandonado-wash)]",
    "active:bg-[var(--slate-700)]",
    "disabled:border-[var(--slate-600)] disabled:text-[var(--ash-inactivo)]",
  ),

  fantasma: cn(
    "border-transparent bg-transparent text-[var(--porcelain-200)]",
    "hover:bg-[var(--slate-800)] hover:text-[var(--porcelain-100)]",
    "active:bg-[var(--slate-700)]",
    "disabled:text-[var(--ash-inactivo)]",
  ),
};

export function Boton(props: PropsBoton) {
  const { variante = "primario", tamano = "m", ancho = false, icono, children, className } = props;

  const clases = cn(BASE, TAMANOS[tamano], VARIANTES[variante], ancho && "w-full", className);

  // ── LA RAMA DE ENLACE ────────────────────────────────────────
  //
  // Se compone sobre `Enlace`, no sobre un `<a>` a pelo. Así la guarda del
  // `href` —nada que no sea http(s) o una ruta propia; `javascript:` es XSS— y
  // la decisión `next/link` contra `<a>` siguen viviendo en UN sitio.
  if (props.href !== undefined) {
    const { href, externo = false } = props;

    return (
      <Enlace
        href={href}
        externo={externo}
        desnudo
        className={clases}
        {...sinPropsDeAspecto(props)}
      >
        <Adorno icono={icono} cargando={false} />
        {children}
      </Enlace>
    );
  }

  const { cargando = false, disabled, type = "button" } = props;
  const bloqueado = disabled === true || cargando;

  return (
    <button
      {...sinPropsDeAspecto(props)}
      type={type}
      disabled={bloqueado}
      aria-busy={cargando || undefined}
      className={clases}
    >
      <Adorno icono={icono} cargando={cargando} />
      {children}
    </button>
  );
}

/**
 * Quita las props de apariencia antes de derramar el resto en el elemento.
 *
 * Sin esto, `variante` y `tamano` acabarían como atributos HTML inválidos en el
 * DOM y React lo avisaría por consola en cada render.
 */
function sinPropsDeAspecto(props: PropsBoton): Record<string, unknown> {
  const {
    variante: _variante,
    tamano: _tamano,
    ancho: _ancho,
    icono: _icono,
    children: _children,
    className: _className,
    href: _href,
    externo: _externo,
    cargando: _cargando,
    disabled: _disabled,
    type: _type,
    ...limpias
  } = props as PropsComunes & {
    href?: string;
    externo?: boolean;
    cargando?: boolean;
    disabled?: boolean;
    type?: string;
  } & Record<string, unknown>;

  return limpias;
}

/**
 * ── EL BOTÓN NO CAMBIA DE ANCHO AL CARGAR ─────────────────────────
 *
 * El spinner ocupa el MISMO hueco de 14 px que el icono, así que empezar a
 * cargar no refluye la fila de botones. `aria-hidden` porque quien informa del
 * estado es `aria-busy` en el botón, no un dibujo que gira.
 */
function Adorno({ icono, cargando }: { icono: ReactNode; cargando: boolean }) {
  if (icono === undefined && !cargando) return null;

  return (
    <span className="grid size-[14px] shrink-0 place-items-center" aria-hidden="true">
      {cargando ? <span className="spinner-aro" /> : icono}
    </span>
  );
}
