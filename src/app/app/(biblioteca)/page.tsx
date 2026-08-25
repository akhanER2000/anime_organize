import { Suspense } from "react";

import { redirect } from "next/navigation";

import { ErrorSesionInvalida, exigirSesionParaLeer } from "@/auth";
import { BarraFiltros } from "@/components/anime/barra-filtros";

import { vaultDe } from "@/lib/db";

import { textoContador } from "@/lib/ui/texto";
import { filtrarFilas, hayFiltro, parsearFiltros } from "@/lib/validation/biblioteca";

import { describirFiltros } from "./filtros";
import { PADDING_LATERAL, PADDING_VERTICAL } from "./medidas";
import { Rejilla } from "./rejilla";
import { Vacio } from "./vacio";

import type { AnimeEnListado as AnimeDelListado } from "@/lib/db";
import type { FiltrosBiblioteca, ParametrosCrudos } from "@/lib/validation/biblioteca";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA BIBLIOTECA EN REJILLA — artboard 03. La pantalla principal del vault.
 *
 * ── UNA CONSULTA. NO 83 ───────────────────────────────────────────────────
 * `vault.listar()` trae los animes con su portada y su progreso en un solo
 * `JOIN`, y **sin los bytes de la portada**: solo el `checksum`, que es lo que
 * necesita la URL versionada de `/api/covers`. Pintar 83 cards es una consulta.
 *
 * ── EL FILTRADO ES EN MEMORIA, Y ES DELIBERADO ────────────────────────────
 * Con el vault entero ya en la mano, filtrar en SQL sería una SEGUNDA consulta
 * para descartar filas que ya están aquí. Y los recuentos de los chips son del
 * vault ENTERO —«Abandonado 1» sigue diciendo 1 mientras miras los favoritos—,
 * así que hacen falta todas las filas de todos modos.
 *
 * El día que un vault crezca hasta donde esto duela, la respuesta no es filtrar
 * aquí mejor: es añadir el filtro y el `count` agrupado AL VAULT, con keyset
 * (`api-conventions.md`), y pasar a paginar. Está anotado en `SUPUESTOS.md`.
 *
 * ── EL FILTRO VIVE EN LA URL ──────────────────────────────────────────────
 * Los chips de `BarraFiltros` son enlaces, así que el botón de atrás funciona,
 * recargar no pierde nada y la vista filtrada se comparte pegando la dirección.
 * Aquí solo se PARSEA lo que llegue, con Zod y sin fiarse: ver `filtros.ts`.
 *
 * ── EL MIDDLEWARE NO ES EL LÍMITE ─────────────────────────────────────────
 * `/app` está en su matcher, pero eso es ENRUTADO: corre en Edge y no puede
 * consultar Postgres (`security.md` §1 bis). Quien comprueba de verdad es
 * `exigirSesionParaLeer()`, aquí abajo, en Node.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Datos de una persona concreta: nunca se cachean (`api-conventions.md`). */
export const dynamic = "force-dynamic";

/**
 * El tope de `listar()`. Con 83 animes sobra; queda escrito para que se vea que
 * la pantalla NO pagina todavía y que el día que un vault pase de aquí hay que
 * pasar a keyset en vez de subir el número.
 */
const LIMITE_LISTADO = 500;

export default async function PaginaBiblioteca({
  searchParams,
}: {
  searchParams: Promise<ParametrosCrudos>;
}) {
  const sesion = await exigirSesionParaLeer().catch((error: unknown) => {
    // Solo la sesión inválida se traduce a «vuelve a entrar». Un fallo de red
    // contra Neon NO se disfraza de logout: se deja subir y se ve como error.
    if (error instanceof ErrorSesionInvalida) return null;
    throw error;
  });

  if (sesion === null) {
    redirect("/login");
  }

  const vault = vaultDe(sesion.ctx);

  // ── DOS CONSULTAS, LANZADAS A LA VEZ ────────────────────────────────────
  //
  // Sin `await`: se lanzan las dos y corren en paralelo. El coste en reloj es
  // el de la más lenta, no la suma. Si se awaitara la primera, la segunda no
  // empezaría hasta que volviera, y sobre Neon por HTTP eso son dos idas y
  // vueltas encadenadas.
  //
  // ── Y POR QUÉ SON DOS Y NO UNA ─────────────────────────────────────────
  //
  // Los recuentos se calculaban en JavaScript sobre las filas que `listar()`
  // ya había traído. Gratis… y **mal en cuanto el vault crezca**: `listar()`
  // trae como mucho `LIMITE_LISTADO` filas, así que a partir de ahí los chips
  // contarían las 500 primeras y no el vault. Con 83 animes no se nota; el día
  // que se note, el chip diría un número falso sin avisar.
  //
  // `recuentos()` cuenta con un `GROUP BY` sobre el vault entero, sin traerse
  // ninguna fila. Es la consulta barata de las dos.
  const promesaRecuentos = vault.recuentos();
  const promesaLista = vault.listar({ limite: LIMITE_LISTADO });

  const filtros = parsearFiltros(await searchParams);

  const recuentos = await promesaRecuentos;

  return (
    <>
      {/* ── EL `<Suspense>` DE LA BARRA NO ES DECORATIVO ──────────────────
       * `BarraFiltros` lee la URL con `useSearchParams()`, y Next exige una
       * frontera de suspensión alrededor de cualquier cliente que lo haga: sin
       * ella, el build FALLA en cuanto alguien intente prerenderizar esta
       * ruta. Hoy no puede pasar —`force-dynamic` la deja siempre dinámica—,
       * pero eso es una línea de este fichero, y el día que se quite el error
       * aparecería lejos de aquí y sin relación aparente.
       *
       * El respaldo reserva el alto exacto de la barra (32 px de chip + 16 de
       * padding arriba y abajo) para que la rejilla no dé un salto si llegara
       * a verse. */}
      <Suspense fallback={<div className="h-[var(--e-8)] border-b border-[var(--slate-800)]" />}>
        <BarraFiltros
          recuentos={recuentos.porEstado}
          total={recuentos.total}
          favoritos={recuentos.favoritos}
        />
      </Suspense>

      <div className={`${PADDING_LATERAL} ${PADDING_VERTICAL}`}>
        <header className="flex flex-wrap items-baseline justify-between gap-x-[var(--e-3)] gap-y-[var(--e-1)] pb-[var(--e-4)]">
          <div className="flex flex-wrap items-baseline gap-x-[var(--e-3)] gap-y-[var(--e-05)]">
            {/* El artboard lo rotula «H2 40 px», que es el ROL tipográfico de
             * DESIGN-SPEC §2 (`display-xs`). El nivel del documento es otra
             * cosa: es el único titular de la pantalla, así que es `<h1>` o
             * la página se queda sin encabezado principal. */}
            <h1 className="font-display text-display-xs font-[var(--fw-display-light)] leading-display tracking-display text-[var(--porcelain-050)]">
              Tu biblioteca
            </h1>

            {/* El contador es REAL. El «10 de 10» del artboard son sus diez
             * animes de ejemplo; el artboard fija la forma, no la cifra. */}
            <Contador promesa={promesaLista} filtros={filtros} total={recuentos.total} />
          </div>

          {/* No es un control: es la descripción del orden que aplica
           * `listar()` (`updated_at DESC`). Pintarlo como un desplegable que
           * no despliega nada sería prometer algo que la pantalla no hace.
           * Anotado en `SUPUESTOS.md`. */}
          <p className="font-mono text-mono text-[var(--ash-400)]">
            Ordenar por · última actualización
          </p>
        </header>

        {/* ── AQUÍ NO PUEDE HABER `<Suspense>`. NI SIQUIERA INTERNO ────────
         *
         * Esta pantalla NO tiene esqueleto de carga, y no es un olvido: es un
         * trade que se intentó deshacer dos veces y se midió las dos.
         *
         * PRIMER INTENTO — `loading.tsx` de segmento. Es lo que había, y rompía
         * DOS cosas a la vez: el `notFound()` de la ficha pasaba a responder
         * **200** (y con eso se enumera el vault ajeno), y `router.push()` al
         * mismo pathname con distinta query dejaba de sincronizar la URL, o sea
         * que **los chips no navegaban**. Está contado entero en
         * `src/app/app/sin-loading.test.ts`.
         *
         * SEGUNDO INTENTO — un `<Suspense>` INTERNO aquí, envolviendo solo la
         * rejilla. La hipótesis era razonable: una frontera de ruta y un límite
         * interno son cosas distintas aunque las dos usen Suspense. Y la primera
         * medición la respaldaba: con el Suspense aquí, `router.push` sí
         * sincronizaba la URL y el esqueleto llegaba antes que la rejilla.
         *
         * Pero esa medición probaba UN clic. Con DOS clics seguidos:
         *
         *     CON <Suspense> interno   1er="?estado=VIENDO"  2do="?estado=VIENDO"   (3/3)
         *     SIN <Suspense> interno   1er="?estado=VIENDO"  2do="?estado=VIENDO&estado=VISTO"  (3/3)
         *
         * El segundo clic **no hace nada**, con 3 segundos de margen entre uno y
         * otro. O sea que el límite interno reproduce el mismo fallo, solo que
         * no en la primera navegación. Y filtrar por dos estados seguidos es un
         * gesto normal, no un caso límite.
         *
         * CONCLUSIÓN: la pantalla se queda sin esqueleto de ruta, a cambio de
         * que los filtros funcionen. Lo protege `e2e/biblioteca.spec.ts`
         * § «DOS CLICS SEGUIDOS», que es lo único que lo vio.
         *
         * Si algún día quieres recuperar el esqueleto, la vía NO es volver a
         * poner un Suspense aquí: es un esqueleto de COMPONENTE —el que ya
         * describe `DESIGN-SPEC` §262, dentro de la card y de la fila— o una
         * transición optimista en cliente. Los dos caminos están sin explorar. */}
        <ContenidoRejilla promesa={promesaLista} filtros={filtros} />
      </div>
    </>
  );
}

/**
 * El contador «N de M series».
 *
 * Recibe la PROMESA, no el array: así el componente de arriba no tiene que
 * esperarla para poder devolver su JSX, que es lo que permite que la barra de
 * filtros salga antes.
 */
async function Contador({
  promesa,
  filtros,
  total,
}: {
  promesa: Promise<AnimeDelListado[]>;
  filtros: FiltrosBiblioteca;
  total: number;
}) {
  const visibles = filtrarFilas(await promesa, filtros);

  // El contador es REAL. El «10 de 10» del artboard son sus diez animes de
  // ejemplo; el artboard fija la forma, no la cifra.
  return (
    <p className="font-mono text-mono text-[var(--ash-400)]">
      {textoContador(visibles.length, total)}
    </p>
  );
}

/** La rejilla, o el vacío que corresponda. Es lo que suspende. */
async function ContenidoRejilla({
  promesa,
  filtros,
}: {
  promesa: Promise<AnimeDelListado[]>;
  filtros: FiltrosBiblioteca;
}) {
  const mios = await promesa;
  const visibles = filtrarFilas(mios, filtros);
  const descripcion = describirFiltros(filtros);

  if (visibles.length > 0) return <Rejilla animes={visibles} />;

  // Los dos vacíos NO son el mismo, y confundirlos es el fallo clásico: decir
  // «tu vault está vacío» a quien acaba de ver el contador diciendo 83 es
  // mentirle. `hayFiltro` es lo que los distingue.
  if (hayFiltro(filtros) && descripcion !== null) {
    return <Vacio variante="filtro" descripcion={descripcion} />;
  }

  return <Vacio variante="vault" />;
}
