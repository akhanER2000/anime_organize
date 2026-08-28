import NextLink from "next/link";
import { FOCO_DORADO, TRANSICION_RAPIDA } from "@/lib/ui/clases";

import { cn } from "@/lib/ui/cn";
import { esHrefSeguro, esInterno } from "@/lib/ui/href";

import type { ComponentProps, ReactNode } from "react";

/**
 * ENLACE — `--gold-300` («etiquetas UPPERCASE, enlaces», design-tokens.md).
 *
 * ── POR QUÉ ES UNA PRIMITIVA Y NO UN `<a>` SUELTO ──────────────────────────
 * Porque hay tres cosas que se olvidan una y otra vez, y aquí se olvidan una
 * sola vez o ninguna:
 *
 * 1. **`rel="noopener noreferrer"` en todo `target="_blank"`.** Sin `noopener`,
 *    la página destino recibe un `window.opener` con el que puede redirigir la
 *    pestaña de origen a una copia del login. Aquí no se puede olvidar: lo pone
 *    el componente, no quien lo usa.
 * 2. **`http`/`https` únicamente.** Un `href="javascript:…"` guardado en un
 *    `continue_link` es XSS almacenado, y los enlaces de continuación son
 *    literalmente URLs que pega el usuario (security.md §8). Un esquema que no
 *    sea http(s) NO se renderiza como enlace: se pinta como texto inerte.
 * 3. **El aviso de «se abre en otra pestaña»** para quien no ve el icono.
 *
 * Interno vs externo se decide solo: `next/link` para las rutas propias
 * —prefetch y navegación de cliente— y `<a>` para lo de fuera.
 */

/**
 * Las props salen de `next/link`, NO de `AnchorHTMLAttributes`.
 *
 * Con `exactOptionalPropertyTypes: true`, `AnchorHTMLAttributes` declara
 * `onMouseEnter?: Handler` y `LinkProps` lo declara sin `| undefined`, así que
 * volcar unas dentro de otro no compila. Tipar desde el componente destino
 * elimina la incompatibilidad de raíz, sin un solo `as`.
 *
 * Las ramas que renderizan un `<a>` desechan las props que solo entiende Next
 * (`prefetch`, `replace`, `scroll`…): en un ancla suelta serían atributos
 * desconocidos y React lo avisaría por consola.
 */
export type PropsEnlace = Omit<ComponentProps<typeof NextLink>, "href" | "target" | "rel"> & {
  href: string;
  children: ReactNode;
  /**
   * Abre en pestaña nueva. Implica `rel="noopener noreferrer"`, sin opción.
   *
   * `target` y `rel` están fuera del tipo A PROPÓSITO —son el punto 1 de la
   * cabecera— y por eso no se pueden pasar. Si necesitas una pestaña nueva
   * hacia una ruta PROPIA, `externo` también sirve: renderiza un `<a>` con
   * las dos garantías puestas.
   */
  externo?: boolean;
  /** Sin subrayado ni color dorado: para envolver una card entera. */
  desnudo?: boolean;
};

const BASE = cn(
  "rounded-boton font-ui text-[var(--gold-300)] underline underline-offset-4",
  "decoration-[var(--gold-borde)]",
  TRANSICION_RAPIDA,
  "hover:text-[var(--gold-200)] hover:decoration-[var(--gold-400)]",
  FOCO_DORADO,
);

export function Enlace({
  href,
  children,
  externo = false,
  desnudo = false,
  className,
  ...resto
}: PropsEnlace) {
  if (!esHrefSeguro(href)) {
    // Texto inerte, no un enlace roto: si el esquema no es seguro, la acción
    // no debe existir. Se conserva el texto para no perder información.
    return (
      <span className={cn("text-[var(--ash-400)]", className)} title="Enlace no válido">
        {children}
      </span>
    );
  }

  const clases = cn(desnudo ? "focus-visible:outline-2" : BASE, className);

  // Props que solo existen en `next/link`: fuera antes de tocar un `<a>`.
  const { prefetch, replace, scroll, ...propsAncla } = resto;

  if (externo) {
    return (
      <a
        // ── EL SPREAD VA PRIMERO, Y ESO ES LA PROTECCIÓN ──────────────────
        // JSX aplica los atributos EN ORDEN, y el último gana ENTERO. Con el
        // spread aquí abajo, un `rel=""` del llamador sustituía al
        // `noopener noreferrer` de la línea siguiente y la página destino
        // recibía un `window.opener` vivo con el que redirigir la pestaña del
        // vault a una copia del login. El comentario decía «no es configurable»
        // y era configurable: lo encontró un barrido, no un test.
        //
        // Y es alcanzable: los dos llamadores de `externo` —el gestor de
        // enlaces y el botón de continuar— pintan URLs QUE PEGA EL USUARIO.
        {...propsAncla}
        href={href}
        target="_blank"
        // No es configurable A PROPÓSITO. Ver el punto 1 de la cabecera.
        rel="noopener noreferrer"
        className={clases}
      >
        {children}
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    );
  }

  if (esInterno(href)) {
    return (
      // El spread delante, igual que en la rama externa: `href` y las clases
      // del sistema son de la primitiva.
      <NextLink {...resto} href={href} className={clases}>
        {children}
      </NextLink>
    );
  }

  return (
    <a {...propsAncla} href={href} className={clases}>
      {children}
    </a>
  );
}
