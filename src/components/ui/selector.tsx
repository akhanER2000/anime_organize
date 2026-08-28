"use client";

// `useId` es un hook: en un Server Component lanza en runtime, no en el build,
// así que el fallo aparecería la primera vez que alguien abriera la pantalla.
// Se declara aquí, en la primitiva, y ninguna pantalla tiene que acordarse.

import { useId } from "react";

import { cn } from "@/lib/ui/cn";

import type { SelectHTMLAttributes } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SELECTOR — DESIGN-SPEC §6, fila «Input / textarea».
 *
 * La spec no le da fila propia porque visualmente ES un input: mismo fondo
 * `--slate-800`, mismo borde `--slate-600`, mismo anillo dorado al enfocar y la
 * misma altura táctil. Lo único suyo es la punta de flecha.
 *
 * ── POR QUÉ UN `<select>` NATIVO Y NO UN DESPLEGABLE PROPIO ────────────────
 *
 * Un desplegable hecho a mano tiene que reimplementar, y casi siempre mal:
 * abrir con Enter/Espacio/flechas, cerrar con Escape, mover el foco con las
 * flechas sin perderlo, **saltar a la opción escribiendo sus primeras letras**,
 * anunciar «opción 3 de 7» al lector de pantalla, y —la que nadie hace— la hoja
 * nativa a pantalla completa que los móviles dan gratis y que es mucho mejor
 * que cualquier lista flotante en 390 px.
 *
 * Todo eso se conserva usando el elemento. Lo que se pierde es poder pintar el
 * interior de la lista desplegada, y eso es lo que se cambia a cambio.
 *
 * ── LA FLECHA VA EN CSS, NO EN UN `<svg>` HERMANO ─────────────────────────
 *
 * `appearance-none` quita la flecha del sistema; hace falta una propia. Un
 * `<svg>` colocado encima con `absolute` se come el clic salvo que se le ponga
 * `pointer-events-none`, y ese detalle se olvida. Como fondo del propio
 * `<select>` no puede taparlo, porque no es un elemento.
 *
 * Y un SVG en `data:` obliga a escribir el `stroke` como hex dentro de la URL,
 * que es un color literal fuera de `globals.css` — lo que `lint:tokens` prohíbe,
 * y con razón: cambiar el token no cambiaría la flecha. Se resuelve con
 * `mask-image`, donde la máscara aporta solo la FORMA y el color lo pone
 * `background-color`, que sí es un token. Ver `componentes.css`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type OpcionSelector = {
  readonly valor: string;
  readonly etiqueta: string;
  readonly deshabilitada?: boolean;
};

export type PropsSelector = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> & {
  etiqueta: string;
  opciones: readonly OpcionSelector[];
  /** Oculta la etiqueta visualmente pero la mantiene para lectores. */
  etiquetaOculta?: boolean;
  /** Texto de ayuda bajo el control. Se anuncia con `aria-describedby`. */
  ayuda?: string;
  /**
   * Primera opción vacía, del tipo «Cualquier estado».
   *
   * Es una opción de verdad con `value=""` y no un `placeholder`: un `<select>`
   * no tiene placeholder, y fingirlo con una opción `disabled` deja al usuario
   * sin forma de **volver** a «ninguno» después de elegir.
   */
  vacia?: string;
};

const CONTROL = cn(
  "w-full appearance-none rounded-input border bg-[var(--slate-800)]",
  "h-[var(--tactil-min)] px-[var(--e-2)] pr-[var(--e-5)]",
  "font-ui text-ui text-[var(--porcelain-100)]",
  "border-[var(--slate-600)]",
  "transition-colors duration-[var(--dur-base)] ease-base",
  // El hover ACLARA la superficie, no el borde: `--slate-500` no existe y en la
  // rampa de obsidiana el número baja al aclarar, así que `--slate-700` como
  // borde apagaría el campo. Mismo razonamiento que en `campo.tsx`.
  "hover:bg-[var(--slate-700)]",
  "focus-visible:border-[var(--gold-400)] focus-visible:outline-2",
  "focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-foco)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--slate-900)]",
  // lint-tokens-ok: `--ash-inactivo` es exactamente el token de deshabilitado
  "disabled:text-[var(--ash-inactivo)]",
);

export function Selector({
  etiqueta,
  opciones,
  etiquetaOculta = false,
  ayuda,
  vacia,
  className,
  ...resto
}: PropsSelector) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;

  return (
    <div className={cn("flex flex-col gap-[var(--e-1)]", className)}>
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
        <select
          id={id}
          aria-describedby={ayuda !== undefined ? idAyuda : undefined}
          className={CONTROL}
          {...resto}
        >
          {vacia !== undefined && <option value="">{vacia}</option>}
          {opciones.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor} disabled={opcion.deshabilitada}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>

        {/* `pointer-events-none` es obligatorio: sin él, la punta se traga el
         * clic en el tercio derecho del control y el desplegable no abre. */}
        <span
          aria-hidden="true"
          className={cn(
            "punta-selector pointer-events-none absolute top-1/2 right-[var(--e-2)]",
            "size-[10px] -translate-y-1/2 bg-[var(--ash-400)]",
          )}
        />
      </div>

      {ayuda !== undefined && (
        <p id={idAyuda} className="font-ui text-ui-xs text-[var(--ash-400)]">
          {ayuda}
        </p>
      )}
    </div>
  );
}
