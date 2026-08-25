import { Card } from "@/components/ui/card";
import { Enlace } from "@/components/ui/enlace";
import { cn } from "@/lib/ui/cn";

import { FormularioLogin } from "./formulario";

import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INICIAR SESIÓN — artboard 07, la card de la IZQUIERDA.
 *
 * Server Component: aquí no hay estado ni eventos. Lo único que necesita el
 * navegador es el formulario, y por eso el `"use client"` vive en
 * `./formulario.tsx` y no aquí (`code-style.md` § «Server / Client Components»).
 *
 * EL FONDO, EL MARCO DORADO Y EL LOGOTIPO NO SON DE ESTA PANTALLA: los pone
 * `(auth)/layout.tsx`, que es común a las tres y que nadie edita. Aquí se pinta
 * la card y nada más.
 *
 * Las etiquetas grises del PNG («estado 01 · con error de validación») son
 * anotaciones del tablero de diseño. No van en la interfaz.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Entra en tu vault: tus series, tu progreso y tus enlaces para continuar.",
};

/**
 * EL ANCHO DE LA CARD SALE DE LOS TOKENS, NO DE UN 416 PEGADO A MANO.
 *
 * DESIGN-SPEC §07: «Tres cards de igual ancho, `repeat(3,1fr)`, gap 32 px»
 * dentro del marco (24 px de offset) y con el gutter de 40. De ahí:
 *
 *     (1440 − 2·24 − 2·40 − 2·32) / 3 = 416 px
 *
 * que es exactamente lo que mide la card en el artboard. Escrito así, si
 * mañana cambia el gutter o el contenedor, la card sigue siendo la del diseño;
 * escrito como `max-w-[416px]`, se queda en el valor viejo en silencio.
 */
/**
 * El ancho sale de `--ancho-card-auth`, que se calcula UNA vez en
 * `globals.css`. Cada pantalla lo derivaba por su cuenta y salían números
 * distintos: ver el comentario del token.
 */
const ANCHO_CARD = "max-w-[var(--ancho-card-auth)]";

export default function PaginaLogin() {
  return (
    <Card
      // BORDE SUPERIOR DORADO: DESIGN-SPEC §07 dice que **solo** lo lleva la
      // card activa, y en esta pantalla la activa es esta. Es también la única
      // card `acento` de la vista, como manda el sistema.
      acento
      className={cn("w-full bg-[var(--slate-900)] p-[var(--e-4)]", ANCHO_CARD)}
    >
      <header className="flex flex-col gap-[var(--e-05)]">
        <h1 className="font-display text-titulo-l font-[var(--fw-display-light)] leading-titulo tracking-display text-[var(--porcelain-050)]">
          Iniciar sesión
        </h1>
        <p className="font-ui text-ui-s leading-ui text-[var(--ash-400)]">
          Vuelve a donde lo dejaste.
        </p>
      </header>

      <div className="mt-[var(--e-3)]">
        <FormularioLogin />
      </div>

      <p className="mt-[var(--e-2)] text-center font-ui text-ui-s text-[var(--ash-400)]">
        ¿Sin cuenta?{" "}
        <Enlace href="/registro" className="text-ui-s">
          Crear una
        </Enlace>
      </p>
    </Card>
  );
}
