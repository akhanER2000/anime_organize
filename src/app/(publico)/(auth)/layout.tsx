import Link from "next/link";
import { MARCO_DORADO } from "@/lib/ui/clases";
import { Marca } from "@/components/ui/marca";

import type { ReactNode } from "react";

/**
 * MARCO DE AUTENTICACIÓN — artboard 07, común a las tres pantallas.
 *
 * ── POR QUÉ ESTÁ AQUÍ Y NO EN CADA PANTALLA ────────────────────────────────
 * El fondo, el marco dorado y el logotipo son idénticos en «Iniciar sesión»,
 * «Crear cuenta» y «Recuperar acceso». Repetirlos en tres ficheros garantiza
 * que dentro de un mes sean tres fondos ligeramente distintos.
 *
 * Las tres pantallas las escriben agentes en paralelo, y este layout es
 * **territorio de nadie**: nadie lo edita. Si una pantalla cree que necesita
 * cambiarlo, para y lo pregunta.
 *
 * DESIGN-SPEC §07: «Fondo `laja-marco.jpg` al 55 % + radial de `--void`.
 * Marco a 24 px.»
 */
export default function LayoutAuth({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[var(--slate-950)]">
      {/* Capa 1 · la laja fotográfica, al 55 %. `aria-hidden` porque no
       * comunica nada: es textura. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('/texturas/laja-marco.webp')] bg-cover bg-center opacity-[var(--opacidad-laja-auth)]"
      />
      {/* Capa 2 · el velo radial de --void que hunde los bordes y deja
       * respirar el centro. Sin él, la textura compite con el texto. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[image:var(--velo-auth)]"
      />

      {/* Capa 3 · el marco dorado a 24 px. Sin radio: «el marco dorado NUNCA
       * lleva radio» (design-tokens.md). */}
      <div
        aria-hidden="true"
        // El marco tiene UN dueño: se encogía y desaparecía igual en tres
        // ficheros, con el mismo comentario copiado. Ver `lib/ui/clases.ts`.
        className={MARCO_DORADO}
      />

      {/* Padding lateral de §3: 20 móvil · 24 tablet · 32 laptop · 40 desktop.
       * Estaba fijo en 32 px para los cuatro. */}
      <div className="relative flex min-h-screen flex-col items-center px-[var(--e-2-5)] py-[var(--e-6)] tablet:px-[var(--gutter-s)] laptop:px-[var(--gutter)] desktop:px-[var(--gutter-l)]">
        {/* El logotipo es el único enlace del marco: vuelve a la landing. */}
        <Link
          href="/"
          // El artboard pone el hexágono a la IZQUIERDA del bloque de dos
          // líneas (icono en x 622-646, texto en x 653-729), no encima.
          className="flex items-center gap-[var(--e-1)] rounded-boton focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gold-400)]"
        >
          {/* El logotipo tiene UN dueño. Este fichero dibujaba un hexágono
           * alargado que no existe en el diseño aprobado y partía la palabra en
           * dos líneas, que el diseño no hace ni una vez. Ver `ui/marca.tsx`. */}
          <Marca tamanoIcono={22} />
        </Link>

        <main className="flex w-full max-w-[var(--contenedor-max)] flex-1 items-start justify-center pt-[var(--e-6)]">
          {children}
        </main>
      </div>
    </div>
  );
}
