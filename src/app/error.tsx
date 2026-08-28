"use client";

import { useEffect } from "react";

import { Boton } from "@/components/ui/boton";
import { Marca } from "@/components/ui/marca";
import { PANTALLA_SUELTA, PARRAFO_DE_ESTADO } from "@/lib/ui/clases";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA PANTALLA DE ERROR — artboard 11, la familia de «estados del sistema».
 *
 * ── QUÉ HABÍA ANTES ─────────────────────────────────────────────────────
 *
 * Nada. Un fallo inesperado en cualquier pantalla caía en la página de error
 * por defecto de Next: fondo blanco, tipografía del sistema y un texto en
 * inglés. En una aplicación que se sirve entera en obsidiana y español, eso no
 * se lee como «algo ha fallado»: se lee como «esto no es mi aplicación».
 *
 * ── POR QUÉ NO SE ENSEÑA EL ERROR ───────────────────────────────────────
 *
 * `api-conventions.md` § «Registro de errores»: al cliente **nunca** le llega
 * un stack, un SQL ni un hostname interno. Next ya lo aplica en producción —el
 * mensaje viene vacío y en su lugar hay un `digest`—, y aquí se enseña ese
 * `digest` a propósito: es el identificador con el que el dueño puede decir
 * «me salió éste» sin que le enseñemos las tripas, y con el que se encuentra la
 * traza en los logs del servidor.
 *
 * ── «REINTENTAR» ES DE VERDAD ───────────────────────────────────────────
 *
 * `reset()` vuelve a renderizar el segmento que falló, sin recargar la página.
 * Para un fallo transitorio —la base tardó de más, un despliegue a mitad— es lo
 * que hace falta. Y debajo va la salida a la biblioteca, porque un botón que
 * puede volver a fallar no puede ser la única opción.
 *
 * ── NO CUBRE EL LAYOUT RAÍZ ─────────────────────────────────────────────
 *
 * Un `error.tsx` captura los errores de sus segmentos hijos, no los del layout
 * que lo envuelve. Si fallara el layout raíz haría falta un `global-error.tsx`,
 * que reemplaza el `<html>` entero. No se añade hoy: ese layout no consulta
 * nada y no tiene por dónde fallar, y un fichero para un caso imposible es un
 * fichero que nadie mantiene.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function ErrorDeLaPantalla({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    // Al log del navegador, que es donde puede mirarlo quien depura. En
    // producción `message` viene vacío por decisión de Next; el `digest` es lo
    // que empareja esto con la traza del servidor.
    console.error("[pantalla] fallo no controlado", error.digest ?? error.message);
  }, [error]);

  return (
    <main className={PANTALLA_SUELTA}>
      <div className="py-[var(--e-4)]">
        <Marca />
      </div>

      <div className="flex grow flex-col items-center justify-center py-[var(--e-10)] text-center">
        <h1 className="font-display text-titulo-l font-[var(--fw-display-light)] leading-titulo tracking-display text-[var(--porcelain-050)] tablet:text-display-xs">
          Algo se ha roto por dentro
        </h1>

        <p className={PARRAFO_DE_ESTADO}>
          No es culpa tuya y tus datos no se han tocado. Puedes volver a intentarlo; si sigue
          pasando, el código de abajo es lo que hace falta para encontrarlo.
        </p>

        {error.digest !== undefined && (
          <p className="mt-[var(--e-2)] font-mono text-mono text-[var(--ash-400)]">
            {error.digest}
          </p>
        )}

        <div className="mt-[var(--e-4)] flex flex-wrap items-center justify-center gap-[var(--e-2)]">
          <Boton variante="primario" onClick={reset}>
            Volver a intentarlo
          </Boton>
          {/* La salida, porque «reintentar» puede volver a fallar y entonces
           * esta pantalla sería un callejón. */}
          <Boton href="/app" variante="fantasma">
            Ir a la biblioteca
          </Boton>
        </div>
      </div>
    </main>
  );
}
