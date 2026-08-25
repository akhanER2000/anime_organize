import Link from "next/link";

import { ANCHO_PARRAFO_VACIO, BOTON_BORDE_DORADO } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS VACÍOS DE LA BIBLIOTECA — DESIGN-SPEC §6 y §08.
 *
 * ── NO SON EL MISMO VACÍO, Y CONFUNDIRLOS ES EL FALLO CLÁSICO ─────────────
 *
 *   · **Vault sin animes** — no hay nada que enseñar. La persona acaba de
 *     entrar por primera vez y lo que necesita es saber qué va a pasar aquí.
 *   · **Filtro sin resultados** — hay animes, pero este filtro no deja ver
 *     ninguno. Lo que necesita es QUITARLO, y decírselo con «tu vault está
 *     vacío» sería mentirle: acaba de ver el contador diciendo 83.
 *
 * Un único componente que dijera lo mismo en los dos casos es la razón por la
 * que tanta gente cree haber perdido sus datos al filtrar.
 *
 * ── EL ICONO ES LA LOSA DEL SISTEMA, NO UNA CARITA TRISTE ─────────────────
 * §08: «icono de laja de 72 px». Hairline de 1 px: el contorno en `--slate-600`
 * y la fractura en `--gold-400`, que es literalmente la metáfora de la marca —
 * la losa partida y reparada con kintsugi. Va `aria-hidden`: lo que informa es
 * el titular, no el dibujo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsVacio =
  | { variante: "vault" }
  /** `descripcion` es el filtro puesto, en palabras: «Visto o Viendo · Favoritos». */
  | { variante: "filtro"; descripcion: string };

export function Vacio(props: PropsVacio) {
  const esFiltro = props.variante === "filtro";

  return (
    <div className="flex flex-col items-center gap-[var(--e-3)] py-[var(--e-12)] text-center">
      <IconoLaja />

      <h2 className="font-display text-titulo-l font-[var(--fw-display-light)] leading-titulo tracking-display text-[var(--porcelain-050)]">
        {esFiltro ? "Ninguna serie coincide" : "Tu vault está vacío"}
      </h2>

      <p
        className={`${ANCHO_PARRAFO_VACIO} font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]`}
      >
        {esFiltro ? (
          <>
            El filtro <strong className="font-[var(--fw-ui-medium)]">{props.descripcion}</strong> no
            deja ninguna serie a la vista. Tus animes siguen ahí: prueba con otro estado o quita el
            filtro.
          </>
        ) : (
          <>
            Todavía no hay ninguna serie guardada. Cuando añadas la primera aparecerá aquí con su
            portada, su estado y su progreso.
          </>
        )}
      </p>

      {/* Solo el vacío del filtro tiene una acción que de verdad existe hoy: el
       * alta de un anime es el modal del artboard 06, que todavía no está
       * escrito, y un botón que no lleva a ningún sitio es peor que su
       * ausencia. Anotado como PARADA en `SUPUESTOS.md`. */}
      {/* Es un `<Link>`: navegación de cliente, sin recargar 83 portadas. Lo que
        * rompía esto era `loading.tsx`, no el elemento —ver el comentario largo de
        * `src/components/anime/barra-filtros.tsx`—. */}
      {esFiltro && (
        <Link href="/app" className={`inline-flex ${BOTON_BORDE_DORADO}`}>
          Quitar los filtros
        </Link>
      )}
    </div>
  );
}

/** La losa partida, 72 px, hairline. DESIGN-SPEC §08. */
function IconoLaja() {
  return (
    <svg
      aria-hidden="true"
      width="72"
      height="72"
      viewBox="0 0 72 72"
      fill="none"
      strokeWidth="1"
      strokeLinejoin="round"
    >
      <path d="M14 8 58 8 64 30 50 64 22 64 8 30 Z" stroke="var(--slate-600)" />
      {/* La veta: el oro es la reparación, no el relleno. */}
      <path d="M30 8 34 27 26 40 40 48 44 64" stroke="var(--gold-400)" />
      <path d="M34 27 52 22" stroke="var(--gold-400)" opacity="0.55" />
    </svg>
  );
}
