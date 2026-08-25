import { Card } from "@/components/ui/card";
import { Enlace } from "@/components/ui/enlace";

import { FormularioRecuperar } from "./formulario";

import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECUPERAR ACCESO — artboard 07, la card de la DERECHA.
 *
 * Server Component: aquí no hay estado ni eventos. Lo único que necesita el
 * navegador es el formulario, y por eso el `"use client"` vive en
 * `./formulario.tsx` y no aquí (`code-style.md` § «Server / Client Components»).
 *
 * EL FONDO, EL MARCO DORADO Y EL LOGOTIPO NO SON DE ESTA PANTALLA: los pone
 * `(auth)/layout.tsx`, que es común a las tres y que nadie edita. Aquí se pinta
 * la card y nada más.
 *
 * Las etiquetas grises del PNG («estado 03 · correo enviado») son anotaciones
 * del tablero de diseño. No van en la interfaz.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const metadata: Metadata = {
  title: "Recuperar acceso",
  description: "Te mandamos un enlace de un solo uso para elegir una contraseña nueva.",
  // Una pantalla de recuperación no aporta nada a un buscador y sí invita a
  // rastreadores a disparar el formulario.
  robots: { index: false, follow: false },
};

/**
 * EL ANCHO DE LA CARD SALE DE LOS TOKENS, NO DE UN 416 PEGADO A MANO.
 *
 * DESIGN-SPEC §07: «Tres cards de igual ancho, `repeat(3,1fr)`, gap 32 px»
 * dentro del marco (24 px de offset) y con el gutter de 40. De ahí:
 *
 *     (1440 − 2·24 − 2·40 − 2·32) / 3 = 416 px
 *
 * que es exactamente lo que mide la card en el artboard. Es la misma expresión
 * que usa `login/page.tsx`: las tres cards del artboard tienen que medir lo
 * mismo, y si un día cambia el gutter deben seguir midiendo lo mismo.
 */
/**
 * El ancho sale de `--ancho-card-auth`, que se calcula UNA vez en
 * `globals.css`. Cada pantalla lo derivaba por su cuenta y salían números
 * distintos: ver el comentario del token.
 */
const ANCHO_CARD = "max-w-[var(--ancho-card-auth)]";

export default function PaginaRecuperar() {
  return (
    <Card
      // SIN `acento`. DESIGN-SPEC §07: «Solo la card activa (Iniciar sesión)
      // lleva borde superior --gold-400», y el sistema admite una sola card con
      // acento por pantalla. Esta no es esa.
      className={`w-full ${ANCHO_CARD} bg-[var(--slate-900)] p-[var(--e-4)]`}
    >
      <header className="flex flex-col gap-[var(--e-05)]">
        <h1 className="font-display text-titulo-l font-[var(--fw-display-light)] leading-titulo tracking-display text-[var(--porcelain-050)]">
          Recuperar acceso
        </h1>
        <p className="font-ui text-ui-s leading-ui text-[var(--ash-400)]">
          Te mandamos un enlace de un solo uso.
        </p>
      </header>

      <div className="mt-[var(--e-3)]">
        <FormularioRecuperar />
      </div>

      {/* El pie es el mismo en los dos estados del formulario, así que se queda
       * en el servidor: no hay motivo para que viaje al navegador. */}
      <p className="mt-[var(--e-2)] text-center font-ui text-ui-s text-[var(--ash-400)]">
        <Enlace href="/login" className="text-ui-s">
          <span aria-hidden="true">←</span> Volver a iniciar sesión
        </Enlace>
      </p>
    </Card>
  );
}
