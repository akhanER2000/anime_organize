"use client";

import { useId, useRef, useState } from "react";

import { cn } from "@/lib/ui/cn";

import { BarraProgreso } from "./card";

import type { DragEvent, ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ZONA DE ARRASTRE — DESIGN-SPEC §6, fila «Zona de arrastre», y §176.
 *
 * «Borde punteado `--slate-600`; hover borde `--gold-400`; con fichero encima
 * fondo `--gold-wash`; cargando, barra de progreso dorada; error, borde granate
 * con el motivo.»
 *
 * Dos usos en la app: la portada del artboard 06 (imagen) y la importación de
 * Ajustes (`.xlsx` / `.csv`).
 *
 * ── ARRASTRAR NO PUEDE SER LA ÚNICA FORMA DE SUBIR UN FICHERO ─────────────
 *
 * Es la regla que decide la estructura: **no existe arrastrar en un móvil**, ni
 * con un lector de pantalla, ni con el teclado. Una zona de arrastre que solo
 * escucha `drop` deja fuera a la mitad de la gente.
 *
 * Por eso el elemento de verdad es un `<input type="file">` con su `<label>`:
 * eso da gratis el diálogo del sistema, el foco, Enter y Espacio, el anuncio
 * «botón, Elegir fichero», y la cámara en el móvil. El arrastre se AÑADE encima
 * como atajo para quien tiene ratón.
 *
 * ── LOS CUATRO EVENTOS, Y POR QUÉ HACEN FALTA LOS CUATRO ──────────────────
 *
 * `dragOver` con `preventDefault()` es OBLIGATORIO: sin él el navegador aplica
 * su comportamiento por defecto, que es **abrir el fichero como página** y
 * perder lo que hubiera en pantalla. Es el fallo clásico de esta primitiva.
 *
 * `dragEnter`/`dragLeave` no bastan por sí solos para saber si el puntero sigue
 * dentro: al pasar sobre un hijo, el navegador emite `leave` del padre y `enter`
 * del hijo. Un booleano se apagaría al mover el ratón por dentro de la zona. Se
 * lleva un CONTADOR de profundidad, que es lo único que sobrevive a eso.
 *
 * ── LA VALIDACIÓN DE VERDAD NO ESTÁ AQUÍ ──────────────────────────────────
 *
 * `accept` y el filtro por extensión son comodidad, no seguridad: el navegador
 * los aplica y el usuario los esquiva. `security.md` §8: los ficheros se validan
 * **por magic bytes y tamaño en el servidor**, nunca por extensión. Esta
 * primitiva solo evita el viaje inútil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsZonaArrastre = {
  readonly etiqueta: string;
  /** Texto de ayuda: «PNG, JPG o WebP · hasta 8 MB». */
  readonly ayuda?: string;
  /** Filtro del diálogo del sistema: `"image/*"`, `".xlsx,.csv"`. */
  readonly accept?: string;
  readonly multiple?: boolean;
  readonly disabled?: boolean;
  /**
   * 0–100 mientras sube, `null` si es indeterminado, `undefined` si no está
   * subiendo. DESIGN-SPEC §6: «cargando → barra de progreso dorada».
   */
  readonly progreso?: number | null;
  /** Su presencia pone la zona en estado de error: borde granate y motivo. */
  readonly error?: string;
  /** Icono opcional a la izquierda del texto. */
  readonly icono?: ReactNode;
  readonly onFicheros: (ficheros: readonly File[]) => void;
  readonly className?: string;
};

export function ZonaArrastre({
  etiqueta,
  ayuda,
  accept,
  multiple = false,
  disabled = false,
  progreso,
  error,
  icono,
  onFicheros,
  className,
}: PropsZonaArrastre) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const [encima, setEncima] = useState(false);
  // Profundidad, no booleano: ver la cabecera.
  const anidamiento = useRef(0);

  const subiendo = progreso !== undefined;
  const hayError = error !== undefined;

  const entregar = (lista: FileList | null) => {
    if (lista === null || lista.length === 0) return;
    onFicheros(Array.from(lista));
  };

  const alSoltar = (evento: DragEvent<HTMLLabelElement>) => {
    evento.preventDefault();
    anidamiento.current = 0;
    setEncima(false);
    if (disabled) return;
    entregar(evento.dataTransfer.files);
  };

  return (
    <div className={className}>
      <label
        htmlFor={id}
        onDragEnter={(evento) => {
          evento.preventDefault();
          anidamiento.current += 1;
          if (!disabled) setEncima(true);
        }}
        onDragOver={(evento) => {
          // SIN ESTO el navegador abre el fichero como página. No es opcional.
          evento.preventDefault();
        }}
        onDragLeave={() => {
          anidamiento.current -= 1;
          if (anidamiento.current <= 0) {
            anidamiento.current = 0;
            setEncima(false);
          }
        }}
        onDrop={alSoltar}
        className={cn(
          "flex min-h-[128px] cursor-pointer flex-col items-center justify-center gap-[var(--e-1)]",
          "rounded-card border border-dashed p-[var(--e-3)] text-center",
          "transition-colors duration-[var(--dur-base)] ease-base",
          "border-[var(--slate-600)]",
          "hover:border-[var(--gold-400)]",
          // El foco vive en el input, que está `sr-only`: se refleja aquí con
          // `has-[:focus-visible]`, o el anillo no se vería en ninguna parte.
          "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
          "has-[:focus-visible]:outline-[var(--gold-400)]",
          encima && "border-[var(--gold-400)] bg-[var(--gold-wash)]",
          hayError && "border-[var(--estado-abandonado-borde)]",
          disabled && "cursor-not-allowed border-[var(--slate-700)]",
        )}
      >
        <input
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={cn(ayuda !== undefined && idAyuda, hayError && idError) || undefined}
          // Solo cuando hay error: `aria-invalid="false"` en todos los campos
          // del formulario es ruido que algunos lectores anuncian igualmente.
          aria-invalid={hayError ? true : undefined}
          // `sr-only` y no `hidden`: un input con `display:none` no recibe foco
          // y el lector de pantalla deja de verlo. Mismo motivo que en `Casilla`.
          className="sr-only"
          onChange={(evento) => {
            entregar(evento.target.files);
            // Se limpia para que elegir DOS VECES el mismo fichero vuelva a
            // disparar `change`: sin esto, reintentar tras un error no hace nada.
            evento.target.value = "";
          }}
        />

        {icono}

        <span
          className={cn(
            "font-ui text-cuerpo-s",
            disabled
              ? // lint-tokens-ok: es literalmente el estado deshabilitado
                "text-[var(--ash-inactivo)]"
              : "text-[var(--porcelain-100)]",
          )}
        >
          {etiqueta}
        </span>

        {ayuda !== undefined && (
          <span id={idAyuda} className="font-ui text-ui-xs text-[var(--ash-400)]">
            {ayuda}
          </span>
        )}

        {subiendo && (
          <span className="mt-[var(--e-1)] block w-full max-w-[240px]">
            <BarraProgreso
              porcentaje={progreso}
              grosor="acento"
              etiqueta={
                progreso === null ? "Subiendo el fichero" : `Subiendo el fichero: ${progreso} %`
              }
            />
          </span>
        )}
      </label>

      {hayError && (
        <p
          id={idError}
          // `alert` y no `status`: un fichero rechazado interrumpe lo que la
          // persona estaba haciendo y tiene que enterarse ya.
          role="alert"
          className="mt-[var(--e-1)] flex items-start gap-[var(--e-05)] font-mono text-mono text-[var(--estado-abandonado-texto)]"
        >
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      )}
    </div>
  );
}
