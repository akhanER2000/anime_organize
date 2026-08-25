import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ErrorSesionInvalida, exigirSesionParaLeer } from "@/auth";
import { rellenoDeFila } from "@/lib/domain/progreso";
import { textoContador } from "@/lib/ui/texto";
import { fechaCorta, fechaIso } from "@/lib/ui/fecha";
import { AnimeCard } from "@/components/anime/anime-card";
import { BarraFiltros } from "@/components/anime/barra-filtros";
import { vaultDe } from "@/lib/db";
import { cn } from "@/lib/ui/cn";

import {
  contarFavoritos,
  contarPorEstado,
  filtrarFilas,
  hayFiltro,
  parsearFiltros,
} from "@/lib/validation/biblioteca";
import { enlaceDeOrden, leerOrden, ordenar, siguienteOrden } from "@/lib/validation/orden-lista";
import { TablaLista } from "./tabla-lista";
import { Vacio } from "./vacio";

import type { ParametrosCrudos } from "@/lib/validation/biblioteca";
import type { CampoOrden } from "@/lib/validation/orden-lista";
import type { FilaVista } from "./tipos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VISTA LISTA — artboard 04. La misma biblioteca que la rejilla, en tabla.
 *
 * ── UNA CONSULTA PARA LAS 83 FILAS, NO 83 ─────────────────────────────────
 *
 * `vault.listar()` hace UN `SELECT` con sus `LEFT JOIN` a portada y progreso, y
 * **no trae los bytes de ninguna portada**: solo el `checksum`, que es lo que
 * necesita la URL versionada de `/api/covers`. Traer los binarios en un listado
 * son megabytes por fila para pintar miniaturas de 32 × 48.
 *
 * Filtrar y ordenar se hacen aquí, en memoria, sobre esas filas ya traídas: son
 * ≤500 y `listar()` no acepta ni filtro ni orden. Añadírselos significaría tocar
 * `src/lib/db/vault.ts`, que no es de esta pantalla. Lo que importaba —una
 * consulta, no 83— se respeta igual.
 *
 * ── EL FILTRO VIVE EN LA URL, Y POR ESO SE COMPARTE CON LA REJILLA ────────
 *
 * `BarraFiltros` es la misma de §03 y escribe `?estado=…&favorito=1`. Esta
 * pantalla los lee de ahí, así que pasar de una vista a otra conserva el filtro
 * sin que ninguna de las dos sepa de la existencia de la otra.
 *
 * ── EL MIDDLEWARE NO ES EL LÍMITE DE SEGURIDAD ────────────────────────────
 *
 * `/app/*` está en su matcher, pero eso es ENRUTADO: corre en Edge y no puede
 * consultar Postgres (`security.md` §1 bis). La comprobación real es
 * `exigirSesionParaLeer()`, que corre en Node y sí consulta. Y el filtro por
 * usuario no se pone a mano en ningún sitio: viene dado por `vaultDe(ctx)`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Datos de una persona concreta: nunca se cachea (`api-conventions.md`). */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Todas las series · Anime Vault",
};

const RUTA = "/app/lista";

/**
 * «12 mar 2026». Se formatea EN EL SERVIDOR, una sola vez por render.
 *
 * Formatearlo en el cliente daría una fecha distinta según el locale del
 * navegador y React lo cantaría como error de hidratación; además, un `Date` no
 * debe cruzar la frontera servidor→cliente sin serializar (`code-style.md`).
 */
// El formateo de fechas vive en `@/lib/ui/fecha`. Esta pantalla tenía su propia
// copia SIN `timeZone`, y por eso pintaba un día menos que la ficha para la
// misma marca de madrugada. Ver el comentario de ese módulo.

export default async function PaginaVistaLista({
  searchParams,
}: {
  searchParams: Promise<ParametrosCrudos>;
}) {
  const sesion = await exigirSesionParaLeer().catch((error: unknown) => {
    // Solo la sesión inválida manda al login. Un fallo de la base no es un
    // «vuelve a entrar»: se propaga y lo pinta el límite de error de Next.
    if (error instanceof ErrorSesionInvalida) return null;
    throw error;
  });

  if (sesion === null) redirect("/login");

  const parametros = await searchParams;

  const todos = await vaultDe(sesion.ctx).listar({ limite: 500 });

  const filtros = parsearFiltros(parametros);
  const orden = leerOrden(parametros);

  const filas: FilaVista[] = ordenar(filtrarFilas(todos, filtros), orden).map((anime) => ({
    id: anime.id,
    titulo: anime.titulo,
    estado: anime.estado,
    esFavorito: anime.esFavorito,
    anio: anime.anio,
    progresoEtiqueta: anime.progresoEtiqueta,
    // El relleno se calcula aquí, donde está la fila entera: `FilaVista` es lo
    // que cruza a la tabla y antes no llevaba con qué calcularlo.
    relleno: rellenoDeFila(anime),
    checksumPortada: anime.checksumPortada,
    actualizadoTexto: fechaCorta(anime.actualizadoEn),
    actualizadoIso: fechaIso(anime.actualizadoEn),
  }));

  // La URL que deja cada cabecera al pulsarse. Se calcula aquí porque una
  // función no puede cruzar la frontera servidor→cliente.
  const enlacesDeOrden: Record<CampoOrden, string> = {
    titulo: enlaceDeOrden(RUTA, parametros, siguienteOrden(orden, "titulo")),
    estado: enlaceDeOrden(RUTA, parametros, siguienteOrden(orden, "estado")),
    actualizado: enlaceDeOrden(RUTA, parametros, siguienteOrden(orden, "actualizado")),
  };

  const recuento =
    filas.length === todos.length
      ? textoContador(todos.length, todos.length)
      : textoContador(filas.length, todos.length);

  return (
    <>
      {/* `BarraFiltros` lee `useSearchParams`, que exige un límite de suspense
       * cuando Next intenta prerenderizar. La página es dinámica, pero el
       * límite se pone igualmente: cuesta nada y evita que un cambio futuro de
       * estrategia rompa el build. */}
      <Suspense fallback={null}>
        <BarraFiltros
          recuentos={contarPorEstado(todos)}
          total={todos.length}
          favoritos={contarFavoritos(todos)}
        />
      </Suspense>

      {/* §04: «padding de contenido 32/40/48», con el lateral que manda §3 en
       * cada breakpoint (40 desktop · 32 laptop · 24 tablet · 20 móvil). */}
      <div
        className={cn(
          "px-[var(--e-2-5)] pb-[var(--e-6)] pt-[var(--e-4)]",
          "tablet:px-[var(--gutter-s)] laptop:px-[var(--gutter)] desktop:px-[var(--gutter-l)]",
        )}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-[var(--e-2)]">
          {/* El artboard lo rotula como «H2 de pantalla» por TAMAÑO (44 px), no
           * por nivel: en el documento es el único encabezado, así que es `h1`.
           * Un `h2` sin `h1` deja la página sin título para el lector. */}
          <h1 className="font-display text-display-s font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]">
            Todas las series
          </h1>

          <p className="font-mono text-mono text-[var(--ash-400)]">{recuento}</p>
        </div>

        <div className="mt-[var(--e-3)]">
          {filas.length === 0 ? (
            <Vacio conFiltros={hayFiltro(filtros)} />
          ) : (
            <>
              <TablaLista filas={filas} orden={orden} enlacesDeOrden={enlacesDeOrden} />

              {/* §3: en móvil «la vista lista SE SUSTITUYE por cards». No es una
               * tabla estrecha con scroll: son las cards de la rejilla, la misma
               * `AnimeCard` de §03, a dos columnas. */}
              <div className="grid grid-cols-2 gap-x-[var(--gutter-s)] gap-y-[var(--e-3-5)] tablet:hidden">
                {filas.map((fila) => (
                  <AnimeCard key={fila.id} anime={fila} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
