import { Card } from "@/components/ui/card";
import { Enlace } from "@/components/ui/enlace";

import { FormularioRegistro } from "./formulario";

import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «CREAR CUENTA» — la card CENTRAL del artboard 07.
 *
 * Server Component: aquí no hay estado ni eventos. Todo lo interactivo vive en
 * `formulario.tsx`, que es el único `"use client"` de la pantalla.
 *
 * ── LO QUE ESTA PANTALLA **NO** PINTA ─────────────────────────────────────
 * El fondo de laja, el velo radial, el marco dorado a 24 px y el logotipo los
 * pone `(auth)/layout.tsx`, común a las tres cards. Ese fichero es territorio
 * de nadie y no se toca desde aquí.
 *
 * Las etiquetas grises del PNG («estado 02 · alta») son anotaciones del tablero
 * de diseño. No son UI y no se implementan.
 *
 * ── SIN BORDE SUPERIOR DORADO, A PROPÓSITO ────────────────────────────────
 * DESIGN-SPEC §07: «Solo la card activa (Iniciar sesión) lleva borde superior
 * `--gold-400`». Por eso `Card` va SIN `acento`. Y es coherente con la regla
 * «nunca oro sobre oro»: dentro ya hay un botón con borde dorado.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const metadata: Metadata = {
  title: "Crear cuenta",
  description: "Crea tu vault de anime: tus series, tu progreso y tus enlaces, solo tuyos.",
  // Un formulario de alta no aporta nada a un buscador y sí atrae registros
  // automáticos. `security.md` no lo exige; el sentido común, sí.
  robots: { index: false, follow: true },
};

/**
 * ── EL ANCHO, DERIVADO Y NO INVENTADO ─────────────────────────────────────
 * DESIGN-SPEC §07 describe las tres cards como `repeat(3,1fr)` con gap 32
 * dentro del contenedor de la pantalla. Esta pantalla pinta **una sola**, así
 * que el ancho de esa columna se reconstruye a partir de los tokens que sí
 * existen, en vez de escribir el literal que se mide en el PNG (~414 px):
 *
 *     (contenedor − 2 gutters − 2 gaps) / 3
 *
 * No hay ningún token de ancho de card de auth en `globals.css` —y ese fichero
 * es de solo lectura para esta pantalla—, así que esta es la forma de no
 * inventarse un número.
 *
 * ── ESTE CÁLCULO SE QUEDA CORTO, Y YA SÉ POR QUÉ ──────────────────────────
 * Da 432 px; en el PNG las tres cards miden 414. Falta descontar el marco
 * dorado (`--marco-offset`, 24 px por lado), que **se suma** al gutter en vez
 * de solaparse:
 *
 *     (1440 − 2×24 − 2×40 − 2×32) / 3 = 416   ← el correcto
 *
 * La pantalla de `/login` ya deriva ese 416. **El integrador lo va a unificar
 * en un token compartido**, así que esta constante existe aislada en una línea
 * precisamente para que sustituirla sea un solo cambio. Ver SUPUESTOS.md §5 bis.
 */
/**
 * El ancho sale de `--ancho-card-auth`, que se calcula UNA vez en
 * `globals.css`. Cada pantalla lo derivaba por su cuenta y salían números
 * distintos: ver el comentario del token.
 */
const ANCHO_CARD = "max-w-[var(--ancho-card-auth)]";

export default function Registro() {
  return (
    <Card
      // Padding interno 32. El artboard pide 36 en vertical, y 36 no existe en
      // la escala de 8 px de `globals.css`. Ver SUPUESTOS.md §5.
      className={`w-full ${ANCHO_CARD} bg-[var(--slate-900)] p-[var(--e-4)] shadow-[var(--sombra-losa)]`}
    >
      <h1 className="font-display text-titulo-l font-[var(--fw-display-light)] leading-display tracking-display text-[var(--porcelain-050)]">
        Crear cuenta
      </h1>

      <p className="mt-[var(--e-1)] font-ui text-ui-s leading-ui text-[var(--ash-400)]">
        Tu vault empieza vacío. Se llena rápido.
      </p>

      <div className="mt-[var(--e-4)]">
        <FormularioRegistro />
      </div>

      {/* Pie del artboard. `--ash-400` y no `--ash-inactivo`: es texto ACTIVO y
       * el inactivo no llega a 4.5:1 sobre ninguna superficie del sistema
       * (design-tokens.md, «Contraste del texto gris»). */}
      <p className="mt-[var(--e-3)] text-center font-ui text-ui-xs leading-ui text-[var(--ash-400)]">
        Al continuar aceptas los{" "}
        <Enlace
          href="/terminos"
          className="text-[var(--ash-400)] decoration-[var(--slate-600)] hover:text-[var(--porcelain-200)]"
        >
          términos
        </Enlace>
      </p>
    </Card>
  );
}
