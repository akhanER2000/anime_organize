import Link from "next/link";
import { FOCO_DORADO, HOVER_DORADO, TRANSICION } from "@/lib/ui/clases";
import { Enlace } from "@/components/ui/enlace";
import { Marca } from "@/components/ui/marca";

import { Boton } from "@/components/ui/boton";
import { cn } from "@/lib/ui/cn";

import type { ReactNode } from "react";

/**
 * BARRA SUPERIOR DEL VAULT — DESIGN-SPEC §03.
 *
 * «Barra superior 76 px, fondo `--slate-900`, veta dorada de 1 px en el borde
 * inferior + veta decorativa SVG en la esquina derecha. Buscador de 520 px,
 * alto 44 px, con atajo `⌘K` en mono 11.»
 *
 * ── ES COMPARTIDA, ASÍ QUE NO ES DE NINGUNA PANTALLA ──────────────────────
 * La usan la biblioteca (03), la vista lista (04), la ficha (05), el buscador
 * (08), el hub (09) y los ajustes (10). Vive en el layout de `/app` para que
 * ninguna pantalla tenga que acordarse de pintarla — y para que nadie la pinte
 * ligeramente distinta.
 *
 * El buscador entra como `children` en vez de estar aquí dentro: en la
 * biblioteca es un campo, en el buscador (§08) está en foco ocupando el ancho
 * restante, y en móvil colapsa a un icono. Componer gana a configurar.
 */
export function BarraSuperior({
  buscador,
  accion,
}: {
  /** El buscador, que cambia de forma según la pantalla. */
  buscador?: ReactNode;
  /** La acción primaria de la derecha. En la biblioteca, «Añadir anime». */
  accion?: ReactNode;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 h-[var(--e-9)] bg-[var(--slate-900)]",
        // La veta dorada del borde inferior: 1 px con halo, no un borde plano.
        "border-b border-[var(--gold-700)]",
      )}
    >
      {/* La veta decorativa de la esquina derecha. `aria-hidden` porque no
       * comunica nada: es el kintsugi de la losa. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-full w-[380px] opacity-70"
        viewBox="0 0 380 76"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 46 L96 46 L150 8 L268 8 L380 34"
          stroke="var(--gold-400)"
          strokeWidth="1"
          opacity="0.55"
        />
        <path
          d="M0 46 L96 46 L150 8 L268 8 L380 34"
          stroke="var(--gold-400)"
          strokeWidth="5"
          opacity="0.09"
        />
      </svg>

      <div className="relative mx-auto flex h-full max-w-[var(--contenedor-max)] items-center gap-[var(--e-3)] px-[var(--e-2-5)] tablet:px-[var(--gutter-s)] laptop:px-[var(--gutter)] desktop:px-[var(--gutter-l)]">
        <Link
          href="/app"
          className="flex shrink-0 items-center gap-[var(--e-1)] rounded-boton focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--gold-400)]"
        >
          {/* 20 px: es lo que dibuja el artboard 03 para la barra del vault.
           * La palabra se oculta en móvil, no se parte: el diseño la escribe en
           * una línea las doce veces que aparece. Ver `ui/marca.tsx`. */}
          <Marca tamanoIcono={20} palabraDesdeTablet />
        </Link>

        {/* El buscador va centrado y con su ancho de 520 px cuando cabe. */}
        <div className="flex min-w-0 flex-1 justify-center">{buscador}</div>

        <div className="flex shrink-0 items-center gap-[var(--e-2)]">{accion}</div>
      </div>
    </header>
  );
}

/**
 * La acción primaria de la biblioteca.
 *
 * **Es el ÚNICO botón de relleno dorado sólido de la pantalla**, y por eso está
 * aquí y no suelto: la regla del oro nº 3 permite uno por pantalla, y tenerlo en
 * un solo sitio hace difícil que aparezca un segundo por descuido.
 */
export function AccionAnadir({ onClick }: { onClick?: () => void }) {
  // ── SIN DESTINO, EL BOTÓN SE DESHABILITA Y LO DICE ──────────────────────
  //
  // El alta de un anime es el modal del artboard 06 y todavía no existe. Un
  // botón que no hace nada enseña que la interfaz miente; uno que no está deja
  // a quien mira preguntándose si la aplicación sabe hacerlo.
  //
  // Deshabilitado y con el motivo en su nombre accesible dice la verdad: la
  // función está prevista y hoy no se puede usar. De paso deja de ser dorado
  // —la variante `solido` deshabilitada pinta `--slate-700`—, así que esta
  // pantalla sigue sin gastar su único botón de relleno dorado.
  if (onClick === undefined) {
    return (
      <Boton variante="solido" tamano="m" disabled title="Todavía no disponible">
        Añadir anime
        <span className="sr-only"> — próximamente</span>
      </Boton>
    );
  }

  return (
    <Boton variante="solido" tamano="m" onClick={onClick}>
      Añadir anime
    </Boton>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL AVATAR — DESIGN-SPEC §03: círculo de 36 px con la inicial en Cormorant.
 *
 * ── ES UN ENLACE, Y ESO ARREGLA UNA PANTALLA INALCANZABLE ─────────────────
 *
 * `/app/ajustes` existía y **nada llevaba a ella**. Es el problema simétrico
 * del enlace muerto: un enlace muerto va a ninguna parte, y una pantalla sin
 * enlace es una parte a la que no se va. La segunda es peor de detectar,
 * porque no hay nada roto que mirar.
 *
 * En el artboard el avatar abre un menú con «Ajustes» y «Salir». El menú es del
 * lote D; mientras no exista, el avatar **lleva directo a Ajustes** en vez de
 * abrir un desplegable vacío. Su nombre accesible dice a dónde va: «Ajustes de
 * la cuenta», no «avatar», que no le diría nada a quien no lo ve.
 *
 * ── LA INICIAL SE SACA DEL CORREO, NO SE INVENTA ──────────────────────────
 *
 * `display_name` puede estar vacío —el registro lo deja opcional a propósito—,
 * así que la inicial sale del correo, que siempre existe. Va `aria-hidden`: lo
 * que informa es el nombre accesible del enlace, no la letra.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function AvatarDeCuenta({ email, nombre }: { email: string; nombre?: string | null }) {
  const fuente = nombre !== null && nombre !== undefined && nombre.trim() !== "" ? nombre : email;
  const inicial = fuente.trim().charAt(0).toUpperCase();

  return (
    <Enlace
      href="/app/ajustes"
      desnudo
      aria-label="Ajustes de la cuenta"
      className={cn(
        "grid size-[36px] shrink-0 place-items-center rounded-[50%]",
        "border border-[var(--slate-600)] bg-[var(--slate-700)]",
        "font-display text-cuerpo-s text-[var(--gold-300)]",
        TRANSICION,
        HOVER_DORADO,
        FOCO_DORADO,
      )}
    >
      <span aria-hidden="true">{inicial}</span>
    </Enlace>
  );
}
