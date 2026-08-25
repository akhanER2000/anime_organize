import Link from "next/link";

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
        className={[
          // ── EL MARCO SE ENCOGE Y DESAPARECE, SEGÚN DESIGN-SPEC §3 ────────
          // «Marco dorado de sección: 24 px en desktop y laptop · 16 px en
          //  tablet · se retira en móvil». Estaba fijo a 24 px en los cuatro
          //  tamaños: en una pantalla de 390 px, un marco de 24 px por lado se
          //  come 48 px de los 390 y aprieta la card contra sí misma.
          "pointer-events-none absolute border border-[var(--gold-700)]",
          "hidden tablet:block",
          "inset-[var(--e-2)] laptop:inset-[var(--marco-offset)]",
        ].join(" ")}
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
          <span aria-hidden="true" className="text-[var(--gold-400)]">
            {/* 25 × 42 medidos en el artboard; el SVG era de 18 × 20. */}
            <svg width="25" height="42" viewBox="0 0 25 42" fill="none" stroke="currentColor">
              <path d="M12.5 3 22 9.5v23L12.5 39 3 32.5v-23L12.5 3Z" strokeWidth="1" />
              <path d="M12.5 14v14" strokeWidth="1" />
            </svg>
          </span>
          {/* 19 px medidos en el artboard (DESIGN-SPEC §2 fija 15–19 para el
           * logotipo) y peso 400, no 300. `text-titulo-xs` son 26 px: era un
           * 37 % más grande de lo que dibuja el diseño. */}
          <span className="font-display text-marca font-[var(--fw-display)] uppercase leading-titulo tracking-marca text-[var(--porcelain-100)]">
            Anime
            <br />
            Vault
          </span>
        </Link>

        <main className="flex w-full max-w-[var(--contenedor-max)] flex-1 items-start justify-center pt-[var(--e-6)]">
          {children}
        </main>
      </div>
    </div>
  );
}
