"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Chip } from "@/components/ui/chip";
import { ESTADOS, ETIQUETA_ESTADO } from "@/lib/domain/enums";
import { parsearFiltrosDeUrl, urlSinFacetas } from "@/lib/validation/biblioteca";
import { cn } from "@/lib/ui/cn";

import type { Estado } from "@/lib/domain/enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BARRA DE FILTROS — DESIGN-SPEC §03, compartida con §04 y §08.
 *
 * ── EL ESTADO VIVE EN LA URL, NO EN REACT ─────────────────────────────────
 *
 * `api-conventions.md` § «Paginación y filtros»: «El estado de filtros vive en
 * la URL, no en el cliente: una vista se comparte pegando el enlace».
 *
 * Eso tiene tres consecuencias que se notan al usarlo: el botón de atrás
 * funciona, recargar no pierde el filtro, y se puede mandar a alguien la
 * biblioteca ya filtrada. Un `useState` daría lo contrario en las tres.
 *
 * Por eso los chips son **enlaces**, no botones: navegan. Y como son enlaces,
 * funcionan con el ratón, con el teclado, con «abrir en pestaña nueva» y con
 * los buscadores, sin escribir una línea para ninguno de esos casos.
 *
 * ── LAS FACETAS SE ACUMULAN ───────────────────────────────────────────────
 *
 * `?estado=VISTO&estado=VIENDO` es «visto O viendo», repitiendo el parámetro
 * como manda la convención. Pulsar un chip ya activo lo QUITA, que es lo que
 * espera cualquiera que haya usado un filtro alguna vez.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type RecuentosPorEstado = Partial<Record<Estado, number>>;

/**
 * ── SON `<Link>`, Y COSTÓ DOS INVESTIGACIONES LLEGAR A ESO ──────────────
 *
 * Durante un tiempo esto fueron `<a>` normales porque **pulsar un chip no hacía
 * nada**: ni cambiaba la URL, ni salía una petición RSC, ni aparecía un error.
 * Se documentó como «causa desconocida». Era un diagnóstico incompleto, y el
 * apaño costaba una **recarga completa de página con 83 portadas** en el control
 * que más se usa de la pantalla.
 *
 * La causa real no estaba en este fichero: era `loading.tsx` en el segmento de
 * la biblioteca. La historia completa —qué se midió y en qué orden— está en
 * `.claude/rules/testing.md` § «El `loading.tsx` que rompía dos cosas a la vez».
 *
 * Lo que hay que saber al leer este fichero es corto: **si alguien añade un
 * `loading.tsx` que cubra `/app`, estos chips dejan de navegar otra vez**. Lo
 * impide `src/app/app/sin-loading.test.ts`, que falla con ese mensaje.
 *
 * ── LA CAJA SÍ TIENE QUE SER `inline-flex` ───────────────────────────
 *
 * Esto sí era un problema real, y **es independiente del anterior**: un enlace
 * es `display: inline` por defecto, así que su caja es la línea de texto —19 px
 * medidos— mientras que el `Chip` de dentro es `inline-flex` de 32 px y además
 * extiende su área táctil a 44 px con un `::before` absoluto.
 *
 * O sea que el enlace era **más pequeño que su propio contenido**: la parte que
 * se ve no era la parte que se puede pulsar. Con `inline-flex`, la caja envuelve
 * al chip entero.
 *
 * Que los dos fallos se «arreglaran» a la vez fue lo que enturbió el
 * diagnóstico: se cambió el elemento Y la caja en el mismo commit, y se atribuyó
 * la mejora al cambio equivocado. El 2x2 que los separó —`<Link>`/`<a>` ×
 * inline/inline-flex— demostró que la geometría no tenía nada que ver con la
 * navegación: fallaban las dos variantes de `<Link>` y funcionaban las dos de
 * `<a>`, con 19 px y con 32 px por igual.
 */
export function BarraFiltros({
  recuentos,
  total,
  favoritos,
}: {
  /** Cuántos animes hay de cada estado. Se pinta en el chip. */
  recuentos: RecuentosPorEstado;
  /** El total, para el chip «Todos». */
  total: number;
  /** Cuántos favoritos, para su chip. */
  favoritos: number;
}) {
  const parametros = useSearchParams();
  const ruta = usePathname();

  // ── LO QUE PINTA LA BARRA SALE DEL MISMO PARSEADOR QUE FILTRA LA PÁGINA ──
  //
  // Antes esto releía la URL por su cuenta —`getAll("estado")` y
  // `get("favorito") === "1"`— y era el TERCER parseador de las mismas dos
  // facetas. Divergía: `get()` devuelve solo el primer valor, así que con
  // `?favorito=0&favorito=1` la rejilla filtraba a favoritos y este chip salía
  // APAGADO, con «Todos» encendido. El control decía una cosa y la pantalla
  // hacía otra.
  const filtros = parsearFiltrosDeUrl(parametros);
  const activos = new Set<Estado>(filtros.estados);
  const soloFavoritos = filtros.soloFavoritos;

  /** La URL que resulta de alternar un estado, conservando lo demás. */
  const urlAlternando = (estado: Estado): string => {
    const siguiente = new URLSearchParams(parametros.toString());
    const yaEstaba = activos.has(estado);

    siguiente.delete("estado");
    for (const e of activos) {
      if (e !== estado) siguiente.append("estado", e);
    }
    if (!yaEstaba) siguiente.append("estado", estado);

    const cadena = siguiente.toString();
    return cadena === "" ? ruta : `${ruta}?${cadena}`;
  };

  // Vive en `validation/biblioteca.ts` porque la comparte con la salida del
  // vacío sin resultados, que hacía otra cosa. Ver el comentario de allí.
  const urlSinFiltros = (): string => urlSinFacetas(ruta, parametros);

  const urlFavoritos = (): string => {
    const siguiente = new URLSearchParams(parametros.toString());
    if (soloFavoritos) siguiente.delete("favorito");
    else siguiente.set("favorito", "1");
    const cadena = siguiente.toString();
    return cadena === "" ? ruta : `${ruta}?${cadena}`;
  };

  const sinFiltrar = activos.size === 0 && !soloFavoritos;

  return (
    <nav
      aria-label="Filtros de la biblioteca"
      className={cn(
        "border-b border-[var(--slate-800)]",
        "px-[var(--e-2-5)] py-[var(--e-2)] tablet:px-[var(--gutter-s)]",
        "laptop:px-[var(--gutter)] desktop:px-[var(--gutter-l)]",
      )}
    >
      {/* En móvil los chips van en fila con scroll horizontal (§3), no
       * apilados: apilarlos empujaría la rejilla fuera de la pantalla. */}
      {/* Chips a la izquierda, conmutador a la derecha (§136). El `min-w-0`
       * es lo que deja al `<ul>` encogerse y hacer scroll en vez de empujar
       * al conmutador fuera de la pantalla en móvil. */}
      <div className="flex items-center gap-[var(--e-2)]">
        <ul className="flex min-w-0 flex-wrap items-center gap-[var(--e-1)] tablet:flex-nowrap tablet:overflow-x-auto">
          <li>
            <Link
              href={urlSinFiltros()}
              className="inline-flex rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]"
            >
              <Chip como="span" activo={sinFiltrar} recuento={total}>
                Todos
              </Chip>
            </Link>
          </li>

          {ESTADOS.map((estado) => (
            <li key={estado}>
              <Link
                href={urlAlternando(estado)}
                className="inline-flex rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]"
              >
                {/* `aria-current` es lo que anuncia «este filtro está puesto».
                 * El color no comunica solo. */}
                <Chip
                  como="span"
                  activo={activos.has(estado)}
                  recuento={recuentos[estado] ?? 0}
                  estado={estado}
                >
                  {ETIQUETA_ESTADO[estado]}
                </Chip>
              </Link>
            </li>
          ))}

          <li>
            <Link
              href={urlFavoritos()}
              className="inline-flex rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold-400)]"
            >
              <Chip como="span" activo={soloFavoritos} recuento={favoritos}>
                ★ Favoritos
              </Chip>
            </Link>
          </li>
        </ul>

        <ConmutadorDeVista parametros={parametros} ruta={ruta} />
      </div>
    </nav>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL CONMUTADOR DE VISTA — DESIGN-SPEC §281 y §136.
 *
 * ── HASTA AHORA NO HABÍA CAMINO A LA VISTA LISTA ──────────────────────────
 *
 * La pantalla existía, estaba terminada y **solo se llegaba escribiendo la URL
 * a mano**. Una pantalla a la que la interfaz no lleva es una pantalla que no
 * está entregada, por muy bien que se pinte.
 *
 * ── CONSERVA LOS `searchParams`, Y ESO NO ES UN DETALLE ───────────────────
 *
 * Cambiar de rejilla a lista **mantiene el filtro puesto**. Es gratis porque el
 * estado vive en la URL —`api-conventions.md` § «Paginación y filtros»— y es
 * justo el dividendo de esa decisión: si el filtro viviera en `useState`, saltar
 * de vista lo perdería y habría que reconstruirlo a mano.
 *
 * Ojo con lo que NO se conserva: el orden (`?orden=`, `?dir=`) es de la lista y
 * no significa nada en la rejilla, pero se lleva igualmente. Es inofensivo —la
 * rejilla lo ignora— y al volver sigue puesto, que es lo que espera cualquiera
 * que haya cambiado de vista y vuelto.
 *
 * ── SON DOS ENLACES, NO UN BOTÓN CON ESTADO ───────────────────────────────
 *
 * Mismo razonamiento que los chips: son navegaciones. Así funcionan el botón de
 * atrás, «abrir en pestaña nueva» y el teclado sin escribir una línea. Y el que
 * está activo lleva `aria-current="page"`, porque el color no comunica solo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
function ConmutadorDeVista({ parametros, ruta }: { parametros: URLSearchParams; ruta: string }) {
  const cola = parametros.toString();
  const con = (destino: string) => (cola === "" ? destino : `${destino}?${cola}`);

  const VISTAS = [
    { destino: "/app", etiqueta: "Rejilla", icono: <IconoRejilla /> },
    { destino: "/app/lista", etiqueta: "Lista", icono: <IconoLista /> },
  ] as const;

  return (
    <div
      role="group"
      aria-label="Cómo se ven las series"
      className="flex shrink-0 items-center gap-[var(--e-05)]"
    >
      {VISTAS.map((vista) => {
        const activa = ruta === vista.destino;

        return (
          <Link
            key={vista.destino}
            href={con(vista.destino)}
            aria-current={activa ? "page" : undefined}
            title={vista.etiqueta}
            className={cn(
              "inline-flex size-[var(--e-4)] items-center justify-center rounded-chip",
              "transition-colors duration-[var(--dur-rapida)] ease-base",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              "focus-visible:outline-[var(--gold-400)]",
              activa
                ? // §281: activo = wash dorado fuerte + subrayado dorado.
                  "bg-[var(--gold-wash-fuerte)] text-[var(--gold-200)] shadow-[inset_0_-1px_0_0_var(--gold-400)]"
                : "text-[var(--porcelain-200)] hover:bg-[var(--slate-700)]",
            )}
          >
            {vista.icono}
            <span className="sr-only">{vista.etiqueta}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Cuatro cuadros. Hairline de 1 px, como todo el sistema. */
function IconoRejilla() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <rect x="1.5" y="1.5" width="5.5" height="5.5" />
      <rect x="9" y="1.5" width="5.5" height="5.5" />
      <rect x="1.5" y="9" width="5.5" height="5.5" />
      <rect x="9" y="9" width="5.5" height="5.5" />
    </svg>
  );
}

/** Tres filas. */
function IconoLista() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <path d="M1.5 3.5h13M1.5 8h13M1.5 12.5h13" />
    </svg>
  );
}
