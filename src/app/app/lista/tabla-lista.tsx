"use client";

import Link from "next/link";
import { ETIQUETA_UPPERCASE, TRANSICION_RAPIDA } from "@/lib/ui/clases";
import { useCallback, useState } from "react";

import { cn } from "@/lib/ui/cn";

import { COLUMNAS, claseDeVisibilidad } from "./columnas";
import { FilaLista } from "./fila-lista";
import { ariaSort } from "@/lib/validation/orden-lista";

import type { IdColumna } from "./columnas";
import type { CampoOrden, Orden } from "@/lib/validation/orden-lista";
import type { FilaVista } from "./tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA TABLA DE LA VISTA LISTA — DESIGN-SPEC §04.
 *
 * ── ES UNA `<table>` DE VERDAD, Y ESO NO ES PEDANTERÍA ────────────────────
 *
 * Una rejilla de `<div>` con `role="grid"` obliga a reimplementar a mano la
 * navegación por celdas y el anuncio de cabeceras, y se hace mal. Con una tabla
 * real, `<th scope="col">` y `<th scope="row">` dan gratis: «Título, columna 3
 * de 8», «Mushishi, Estado, Visto» al recorrer la fila, y el salto por celdas
 * del lector de pantalla.
 *
 * El precio es que §04 escribe los anchos en `fr` (sintaxis de Grid) y hay que
 * traducirlos a porcentajes. Está hecho una vez en `columnas.ts`.
 *
 * ── EL ORDEN SON ENLACES, NO BOTONES ──────────────────────────────────────
 *
 * Las cabeceras ordenables son `<Link>` a la misma ruta con `?orden=…&dir=…`.
 * Por eso funcionan el botón de atrás, la recarga y «copiar el enlace ya
 * ordenado» sin escribir una línea para ninguno de los tres. `aria-sort` en el
 * `<th>` anuncia el orden a quien no ve la flecha.
 *
 * ── LO ÚNICO QUE ES ESTADO DE CLIENTE ES LA SELECCIÓN ─────────────────────
 *
 * Marcar filas no cambia lo que se ve ni se comparte por enlace, así que no
 * tiene por qué vivir en la URL. Todo lo demás —orden y filtros— sí.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsTablaLista = {
  /** Ya filtradas y ordenadas por el servidor. */
  filas: readonly FilaVista[];
  orden: Orden;
  /** La URL que deja cada cabecera al pulsarse. La calcula el servidor. */
  enlacesDeOrden: Readonly<Record<CampoOrden, string>>;
};

/** Qué columnas ordenan, y por qué campo. Las demás no tienen orden útil. */
const CAMPO_DE_COLUMNA: Readonly<Partial<Record<IdColumna, CampoOrden>>> = {
  titulo: "titulo",
  estado: "estado",
  actualizado: "actualizado",
};

const ETIQUETA_ORDEN: Readonly<Record<CampoOrden, string>> = {
  titulo: "título",
  estado: "estado",
  actualizado: "fecha de actualización",
};

/** La flecha de la cabecera. `aria-hidden`: lo que se anuncia es `aria-sort`. */
function Indicador({ estado }: { estado: "ascending" | "descending" | "none" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "text-ui-s leading-solido",
        estado === "none" ? "text-[var(--ash-400)]" : "text-[var(--gold-400)]",
      )}
    >
      {estado === "ascending" ? "▲" : estado === "descending" ? "▼" : "↕"}
    </span>
  );
}

export function TablaLista({ filas, orden, enlacesDeOrden }: PropsTablaLista) {
  const [seleccionadas, setSeleccionadas] = useState<ReadonlySet<string>>(() => new Set<string>());

  const alternar = useCallback((id: string) => {
    setSeleccionadas((actuales) => {
      const siguiente = new Set(actuales);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }, []);

  return (
    <>
      {/* Región viva SIEMPRE presente, aunque esté vacía: un `role="status"` que
       * aparece y desaparece del DOM no siempre se anuncia. */}
      <p role="status" className="h-[var(--e-3)] font-mono text-mono-s text-[var(--ash-400)]">
        {seleccionadas.size > 0
          ? `${String(seleccionadas.size)} de ${String(filas.length)} seleccionadas`
          : ""}
      </p>

      {/* §3: por debajo de 768 px la lista SE SUSTITUYE por cards, así que aquí
       * no se estrecha la tabla: desaparece entera. Las cards las pinta la
       * página con `AnimeCard`, que es la misma de la rejilla.
       * `overflow-x-auto` acota cualquier desbordamiento a este contenedor: el
       * `<body>` nunca debe hacer scroll horizontal. */}
      <div className="hidden overflow-x-auto tablet:block">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            {`Tus series, ordenadas por ${ETIQUETA_ORDEN[orden.campo]} ${
              orden.direccion === "asc" ? "ascendente" : "descendente"
            }. ${String(filas.length)} filas.`}
          </caption>

          <thead>
            {/* §04: «Cabecera --slate-850 con etiquetas de 11 px en --gold-300». */}
            <tr className="h-[var(--e-5)] bg-[var(--slate-850)]">
              {COLUMNAS.map((columna, indice) => {
                const campo = CAMPO_DE_COLUMNA[columna.id];
                const orientacion = campo === undefined ? "none" : ariaSort(orden, campo);

                return (
                  <th
                    key={columna.id}
                    scope="col"
                    aria-sort={campo === undefined ? undefined : orientacion}
                    className={cn(
                      "text-left align-middle",
                      ETIQUETA_UPPERCASE,
                      "text-[var(--gold-300)]",
                      indice === 0
                        ? "pl-[var(--e-2-5)] pr-[9px]"
                        : indice === COLUMNAS.length - 1
                          ? "pl-[9px] pr-[var(--e-2-5)] text-right"
                          : "px-[9px]",
                      columna.ancho,
                      claseDeVisibilidad(columna),
                    )}
                  >
                    {columna.etiquetaOculta ? (
                      <span className="sr-only">{columna.etiqueta}</span>
                    ) : campo === undefined ? (
                      columna.etiqueta
                    ) : (
                      // `<a>` y no `<Link>`, por el mismo motivo medido que en
                      // `BarraFiltros`: una navegación al MISMO pathname
                      // cambiando solo la query no llegaba a ocurrir con
                      // `<Link>` —ni URL, ni petición, ni error—, y con un
                      // ancla normal funciona. Ver la cabecera de
                      // Vuelve a ser `<Link>`: la causa de que no navegara era
                      // `loading.tsx`, no el elemento. Ver el comentario largo de
                      // `src/components/anime/barra-filtros.tsx`.
                      <Link
                        href={enlacesDeOrden[campo]}
                        className={cn(
                          "inline-flex items-center gap-[var(--e-05)] rounded-chip",
                          TRANSICION_RAPIDA,
                          "hover:text-[var(--gold-200)]",
                          "focus-visible:outline-2 focus-visible:outline-offset-2",
                          "focus-visible:outline-[var(--gold-400)]",
                        )}
                      >
                        {columna.etiqueta}
                        <Indicador estado={orientacion} />
                        <span className="sr-only">
                          {orientacion === "ascending"
                            ? " (ordenando de menor a mayor; pulsa para invertir)"
                            : orientacion === "descending"
                              ? " (ordenando de mayor a menor; pulsa para invertir)"
                              : " (pulsa para ordenar por esta columna)"}
                        </span>
                      </Link>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody
            className={cn(
              // §6, fila de tabla · foco: «anillo dorado interior». Va en el
              // cuerpo con `focus-within` para que se vea al tabular por la
              // casilla o por el enlace de la fila.
              "[&_tr:focus-within]:outline-2 [&_tr:focus-within]:-outline-offset-2",
              "[&_tr:focus-within]:outline-[var(--gold-400)]",
            )}
          >
            {filas.map((fila, indice) => (
              <FilaLista
                key={fila.id}
                fila={fila}
                indice={indice}
                seleccionada={seleccionadas.has(fila.id)}
                alAlternar={alternar}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
