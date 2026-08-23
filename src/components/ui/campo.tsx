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

const CONTROL = cn(
  "w-full rounded-input border bg-[var(--slate-800)]",
  "px-[var(--e-2)] font-ui text-ui text-[var(--porcelain-100)]",
  "placeholder:text-[var(--ash-500)]",
  "transition-colors duration-base ease-base",
  // Foco: borde dorado + anillo suave con 2 px de offset.
  "focus-visible:border-[var(--gold-400)] focus-visible:outline-2",
  "focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-foco)]",
  "disabled:cursor-not-allowed disabled:bg-[var(--slate-900)] disabled:text-[var(--ash-500)]",
);

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
      {ayuda !== undefined && error === undefined && (
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
          aria-describedby={hayError ? idError : ayuda !== undefined ? idAyuda : undefined}
          className={cn(
            CONTROL,
            "h-11",
            adorno !== undefined && "pr-[var(--e-6)]",
            hayError
              ? "border-[var(--estado-abandonado)]"
              : "border-[var(--slate-600)] hover:border-[var(--slate-700)]",
          )}
          {...resto}
        />
        {adorno !== undefined && (
          <span className="absolute right-[var(--e-1_5,12px)] top-1/2 -translate-y-1/2">
            {adorno}
          </span>
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
        aria-describedby={hayError ? idError : ayuda !== undefined ? idAyuda : undefined}
        className={cn(
          CONTROL,
          "resize-y py-[var(--e-1_5,12px)] leading-cuerpo",
          hayError
            ? "border-[var(--estado-abandonado)]"
            : "border-[var(--slate-600)] hover:border-[var(--slate-700)]",
        )}
        {...resto}
      />

      <Mensajes idError={idError} idAyuda={idAyuda} error={error} ayuda={ayuda} />
    </div>
  );
}
