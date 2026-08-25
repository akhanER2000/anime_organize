"use client";

// `useId` es un hook: en un Server Component lanza en runtime, no en el build,
// así que el fallo aparecería la primera vez que alguien abriera la pantalla.
// Se declara aquí, en la primitiva, y ninguna pantalla tiene que acordarse.

import { useId } from "react";

import { cn } from "@/lib/ui/cn";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/**
 * CAMPO — DESIGN-SPEC §6, fila «Input / textarea».
 *
 * Envuelve etiqueta, control, mensaje de error y ayuda, porque los cuatro tienen
 * que estar CONECTADOS por `aria-describedby` / `aria-errormessage` para que un
 * lector de pantalla los lea juntos. Dejarlo a criterio de cada pantalla es
 * garantizar que en la sexta se olvide.
 */

type Comunes = {
  etiqueta: string;
  /** Texto de ayuda bajo el campo. Se anuncia con `aria-describedby`. */
  ayuda?: string;
  /**
   * Mensaje de error. Su presencia pone el campo en estado de error.
   * Mono 12 px en `--estado-abandonado-texto`, con icono ⚠ (DESIGN-SPEC §6).
   */
  error?: string;
  /** Oculta la etiqueta visualmente pero la mantiene para lectores. */
  etiquetaOculta?: boolean;
};

export type PropsCampo = Comunes &
  Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
    /** Adorno a la derecha: un botón de «mostrar contraseña», un atajo… */
    adorno?: ReactNode;
  };

export type PropsAreaTexto = Comunes & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id">;

/**
 * ── UN HUECO DE LA SPEC, DICHO EN VOZ ALTA ─────────────────────────────────
 *
 * DESIGN-SPEC §6 pide que el input **aclare** su borde en hover:
 * «borde `--slate-500` ≈ `--slate-600` aclarado». **`--slate-500` no existe**
 * en `design/tokens.json`, y `design-tokens.md` prohíbe expresamente inventar
 * tonos intermedios de gris.
 *
 * Lo que había era peor que el hueco: `hover:border-[var(--slate-700)]`. En la
 * rampa de obsidiana el número BAJA según se aclara, así que `--slate-700` es
 * **más oscuro** que `--slate-600`: al pasar el ratón el campo se apagaba, que
 * es la señal de «deshabilitado». Exactamente lo contrario de lo que la spec
 * quiere comunicar.
 *
 * Resuelto sin inventar color: el hover aclara la **superficie**
 * (`--slate-800` → `--slate-700`), que es el uso documentado de ese token
 * —«hover, superficie activa»— y sí es un aclarado real sobre el fondo del
 * campo. El borde se queda en `--slate-600`.
 *
 * **Queda pendiente de tu decisión**: si prefieres el aclarado en el borde,
 * hay que añadir `--slate-500` a `design/tokens.json`, y eso lo decides tú.
 * ───────────────────────────────────────────────────────────────────────────
 */
const CONTROL = cn(
  "w-full rounded-input border bg-[var(--slate-800)]",
  "px-[var(--e-2)] font-ui text-ui text-[var(--porcelain-100)]",
  "placeholder:text-[var(--ash-inactivo)]",
  // DESIGN-SPEC §6, estado `active` del input: «cursor visible en --gold-400».
  // Faltaba: no había un solo `caret-color` en todo el proyecto, así que el
  // cursor salía del color del texto y el estado activo no se distinguía.
  "caret-[var(--gold-400)]",
  "transition-colors duration-[var(--dur-base)] ease-base",
  // Foco: borde dorado + anillo suave con 2 px de offset.
  "focus-visible:border-[var(--gold-400)] focus-visible:outline-2",
  "focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-foco)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--slate-900)] disabled:text-[var(--ash-inactivo)]",
);

/**
 * Enlaza el control con SUS DOS mensajes. Un `aria-describedby` solo admite una
 * lista de ids separados por espacios; devolver `undefined` cuando no hay
 * ninguno evita imprimir el atributo vacío.
 */
function describedBy(
  hayError: boolean,
  idError: string,
  hayAyuda: boolean,
  idAyuda: string,
): string | undefined {
  const ids = [hayError ? idError : null, hayAyuda ? idAyuda : null].filter(
    (x): x is string => x !== null,
  );
  return ids.length > 0 ? ids.join(" ") : undefined;
}

const ETIQUETA = cn(
  "font-ui text-etiqueta font-[var(--fw-ui-bold)] uppercase tracking-etiqueta",
  // Las etiquetas UPPERCASE van en --gold-300, NUNCA en --gold-400 (satura).
  "text-[var(--gold-300)]",
);

function Mensajes({
  idError,
  idAyuda,
  error,
  ayuda,
}: {
  idError: string;
  idAyuda: string;
  error?: string | undefined;
  ayuda?: string | undefined;
}) {
  return (
    <>
      {error !== undefined && (
        // `role="alert"` lo anuncia en cuanto aparece, sin esperar al foco.
        <p
          id={idError}
          role="alert"
          className="flex items-start gap-[var(--e-05)] font-mono text-mono text-[var(--estado-abandonado-texto)]"
        >
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}
      {/* LA AYUDA NO DESAPARECE AL FALLAR.
       * Antes se ocultaba cuando había error, que es justo cuando hace falta:
       * «mínimo 12 caracteres» se esfumaba en el momento en que el usuario se
       * equivocaba, y quedaba solo «contraseña no válida». El error dice QUÉ
       * pasa; la ayuda dice qué HACER. Van juntos.
       *
       * `aria-describedby` los enlaza a los dos, en ese orden. */}
      {ayuda !== undefined && (
        <p id={idAyuda} className="font-mono text-mono text-[var(--ash-400)]">
          {ayuda}
        </p>
      )}
    </>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  error,
  etiquetaOculta = false,
  adorno,
  ...resto
}: PropsCampo) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const hayError = error !== undefined;

  return (
    <div className="flex flex-col gap-[var(--e-1)]">
      <label htmlFor={id} className={cn(ETIQUETA, etiquetaOculta && "sr-only")}>
        {etiqueta}
      </label>

      <div className="relative">
        <input
          id={id}
          // `aria-invalid` es lo que un lector anuncia como «campo con error».
          aria-invalid={hayError || undefined}
          aria-describedby={describedBy(hayError, idError, ayuda !== undefined, idAyuda)}
          className={cn(
            CONTROL,
            "h-[var(--tactil-min)]",
            adorno !== undefined && "pr-[var(--e-6)]",
            hayError
              ? "border-[var(--estado-abandonado)]"
              : "border-[var(--slate-600)] hover:bg-[var(--slate-700)]",
          )}
          {...resto}
        />
        {adorno !== undefined && (
          <span className="absolute right-[var(--e-1-5)] top-1/2 -translate-y-1/2">{adorno}</span>
        )}
      </div>

      <Mensajes idError={idError} idAyuda={idAyuda} error={error} ayuda={ayuda} />
    </div>
  );
}

export function AreaTexto({
  etiqueta,
  ayuda,
  error,
  etiquetaOculta = false,
  rows = 4,
  ...resto
}: PropsAreaTexto) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const hayError = error !== undefined;

  return (
    <div className="flex flex-col gap-[var(--e-1)]">
      <label htmlFor={id} className={cn(ETIQUETA, etiquetaOculta && "sr-only")}>
        {etiqueta}
      </label>

      <textarea
        id={id}
        rows={rows}
        aria-invalid={hayError || undefined}
        aria-describedby={describedBy(hayError, idError, ayuda !== undefined, idAyuda)}
        className={cn(
          CONTROL,
          "resize-y py-[var(--e-1-5)] leading-cuerpo",
          hayError
            ? "border-[var(--estado-abandonado)]"
            : "border-[var(--slate-600)] hover:bg-[var(--slate-700)]",
        )}
        {...resto}
      />

      <Mensajes idError={idError} idAyuda={idAyuda} error={error} ayuda={ayuda} />
    </div>
  );
}
