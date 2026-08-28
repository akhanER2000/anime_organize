import { notFound, redirect } from "next/navigation";
import { GestorEnlaces } from "@/components/anime/gestor-enlaces";

import type { EnlaceGuardado } from "@/components/anime/gestor-enlaces";
import { AccionesFicha } from "@/components/anime/acciones-ficha";
import { cache } from "react";

import { ErrorSesionInvalida, exigirSesionParaLeer } from "@/auth";
import { BadgeEstado } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Enlace } from "@/components/ui/enlace";
import { vaultDe } from "@/lib/db";
import { enriquecimientoDe } from "@/lib/db/enriquecimiento";
import { ESTADOS } from "@/lib/domain/enums";
import { cn } from "@/lib/ui/cn";
import { fechaCorta } from "@/lib/ui/fecha";

import { AccionContinuar } from "./accion-continuar";
import { BotonEnriquecer } from "./boton-enriquecer";
import { ChipGenero, type GeneroDeFicha } from "./chip-genero";
import {
  esIdentificadorDeAnime,
  metadatosDeFicha,
  titulosAlternativos,
  urlDePortada,
} from "./ficha";
import {
  COLUMNA_PORTADA,
  ETIQUETA_SECCION,
  PADDING_LATERAL,
  PADDING_VERTICAL,
  REJILLA_FICHA,
  TITULO_FICHA,
} from "./medidas";
import { Portada } from "./portada";
import { etiquetaDeProgreso, rellenoDeFila } from "@/lib/domain/progreso";

import type { EnlaceDeContinuacion } from "./accion-continuar";
import type { Vault } from "@/lib/db";
import type { Estado } from "@/lib/domain/enums";
import type { Metadata } from "next";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FICHA DE UN ANIME — artboard 05, ruta `/app/anime/<uuid>`.
 *
 * Server Component puro: aquí no hay estado ni eventos. Lo único que el
 * navegador necesita de esta pantalla es seguir un enlace, y para eso no hace
 * falta JavaScript.
 *
 * LA BARRA SUPERIOR NO ES DE ESTA PANTALLA: la pone `/app/layout.tsx`, que es
 * común a los artboards 03, 04, 05, 08, 09 y 10.
 *
 * ── 404 Y NUNCA 403 ───────────────────────────────────────────────────────
 * `vault.obtener()` devuelve `null` tanto si el anime **no existe** como si es
 * **de otra persona**, y los dos casos son indistinguibles a propósito. Los dos
 * responden 404 con `notFound()` (`security.md` §1): un 403 confirmaría que el
 * recurso existe y con eso se enumera el vault ajeno un uuid cada vez.
 *
 * ── LO QUE HOY SALE VACÍO, Y POR QUÉ NO SE RELLENA ───────────────────────
 * El artboard dibuja a Frieren con sus 28 episodios, sus géneros y sus tres
 * enlaces. **Esos datos son de ejemplo.** En la base de hoy hay 83 animes con
 * su título, su estado y su portada, y nada más: el enriquecimiento (AniList +
 * IA) y los enlaces de continuación son otras fases. Así que los géneros, la
 * sinopsis, los metadatos y la acción primaria salen con su estado vacío
 * honesto. Inventar un dato de un anime del usuario es la tercera regla que el
 * proyecto no rompe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Datos de un usuario: nunca cacheable entre peticiones (api-conventions.md). */
export const dynamic = "force-dynamic";

type AnimeDeLaFicha = NonNullable<Awaited<ReturnType<Vault["obtener"]>>>;

type Ficha = {
  anime: AnimeDeLaFicha;
  /** Oficiales de AniList y etiquetas de IA, ya filtrados por propiedad. */
  generos: readonly GeneroDeFicha[];
  /**
   * TODOS los enlaces, ya serializados y en su orden.
   *
   * `enlace` sigue siendo el primero de esta lista y no otra consulta: tener
   * dos lecturas para «el más reciente» y «todos» era pedir que un día dijeran
   * cosas distintas.
   */
  enlaces: readonly EnlaceGuardado[];
  /** Para la URL versionada de la portada. Los BYTES no viajan por aquí. */
  checksumPortada: string | null;
  /** La etiqueta que escribió el usuario. Nunca una reescrita por nosotros. */
  progresoEtiqueta: string | null;
  /**
   * El relleno de la barra, 0-100, o `null` si es indeterminado.
   *
   * Se calcula en `cargarFicha` y no en el componente porque es ahí donde está
   * la fila del listado con los campos de progreso. Antes esta línea era un
   * `rellenoDeBarra(null, anime)` con el `null` incrustado, y la barra de la
   * ficha salía siempre vacía.
   */
  relleno: number | null;
  enlace: EnlaceDeContinuacion | null;
};

/**
 * ── `cache()` PARA NO CONSULTAR DOS VECES LO MISMO ────────────────────────
 * `generateMetadata` y el componente necesitan los mismos datos, y Next llama a
 * los dos en la misma petición. Sin memoizar serían dos rondas completas
 * —sesión incluida— para pintar una pantalla. `cache` es de React y su ámbito
 * es **la petición**: no hay riesgo de servirle a alguien la ficha de otro.
 */
const cargarFicha = cache(async (animeId: string): Promise<Ficha | null> => {
  // El id de la ruta se parsea ANTES de tocar la base. Ver `ficha.ts`.
  if (!esIdentificadorDeAnime(animeId)) return null;

  const { ctx } = await sesionDeLectura();
  const vault = vaultDe(ctx);

  const anime = await vault.obtener(animeId);
  // `null` = no existe **o no es suyo**. Indistinguible, y así se queda.
  if (anime === null) return null;

  /**
   * ── POR QUÉ SE PIDE EL LISTADO PARA PINTAR UNA FICHA ──────────────────
   * Porque el vault no tiene otra forma de conseguir el `checksum` de la
   * portada sin traerse los BYTES: `obtener()` devuelve la fila de `anime`
   * —que no lleva checksum— y `portada()` selecciona el binario entero, que
   * son cientos de KB que esta pantalla no necesita (la imagen la pide el
   * navegador aparte, a `/api/covers`).
   *
   * `listar()` es la única consulta que expone `checksum` y `progress.label`
   * sin los bytes, y va filtrada por usuario como todo lo demás. Es un
   * apaño, está medido —83 filas de columnas cortas— y **la solución de
   * verdad es un método `ficha(animeId)` en el vault**, que no me toca
   * escribir. Anotado en `SUPUESTOS.md` como parada.
   */
  // Los enlaces COMPLETOS, no solo el más reciente: la ficha ya no solo los
  // enseña, deja añadirlos, abrirlos y quitarlos.
  const [listado, enlaces, generos] = await Promise.all([
    vault.listar(),
    vault.enlaces(animeId),
    // Va en el mismo `Promise.all`: es una consulta más de la misma pantalla y
    // encadenarla añadiría una ida y vuelta entera al primer pintado.
    enriquecimientoDe(ctx).generosDeFicha(animeId),
  ]);
  const enlace = enlaces[0] ?? null;
  const enElListado = listado.find((fila) => fila.id === animeId) ?? null;

  return {
    anime,
    generos,
    checksumPortada: enElListado?.checksumPortada ?? null,
    progresoEtiqueta: enElListado?.progresoEtiqueta ?? null,
    relleno: enElListado === null ? null : rellenoDeFila(enElListado),
    enlace,
    // Se serializa AQUÍ, en el servidor: un `Date` no cruza la frontera
    // servidor→cliente sin convertir (`code-style.md` § Server/Client).
    enlaces: enlaces.map((uno) => ({
      id: uno.id,
      url: uno.url,
      etiqueta: uno.etiqueta,
      ultimoUso: uno.ultimoUso?.toISOString() ?? null,
    })),
  };
});

/**
 * La sesión, o el login.
 *
 * El middleware ya protege `/app/*`, pero **no es el límite de seguridad**
 * (`security.md` §1 bis): corre en Edge y no puede consultar Postgres, así que
 * no sabe si la cuenta sigue existiendo ni si las sesiones fueron revocadas.
 * La comprobación de verdad es esta, que corre en Node.
 *
 * Una sesión revocada aquí no es un 500: es alguien a quien hay que mandar al
 * login. Cualquier OTRO error —la base caída, por ejemplo— se relanza: un
 * fallo de infraestructura disfrazado de «vuelve a iniciar sesión» manda al
 * usuario a teclear su contraseña para nada.
 */
async function sesionDeLectura() {
  try {
    return await exigirSesionParaLeer();
  } catch (error) {
    if (error instanceof ErrorSesionInvalida) redirect("/login");
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ficha = await cargarFicha(id);

  // Sin ficha, un título genérico: el de la pestaña no puede decir si el anime
  // existe y es de otro. Misma indistinguibilidad que el 404.
  //
  // Y aquí NO se llama a `notFound()`: se probó, y no sirve. Ver la nota del
  // cuerpo de la página —quien decide el estado es la ausencia de `loading.tsx`,
  // no el sitio desde el que se lance.
  if (ficha === null) return { title: "No encontrado" };

  return { title: ficha.anime.title };
}

export default async function PaginaFichaAnime({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await cargarFicha(id);

  // ── UN 404 DE VERDAD — Y ESTA RUTA NO PUEDE TENER `loading.tsx` ─────────
  //
  // `notFound()`, no un `return null` ni un mensaje dentro de una respuesta
  // 200: el navegador, los buscadores y el propio `fetch` tienen que ver el
  // código de estado.
  //
  // Y para que lo vean hay una condición que no está escrita en esta línea:
  // **ningún `loading.tsx` puede cubrir esta ruta**. Un `loading.tsx` es un
  // `<Suspense>`, y un `<Suspense>` autoriza a Next a **vaciar la cabecera de
  // la respuesta con 200** y mandar el esqueleto mientras la página sigue
  // resolviéndose. Cuando el `notFound()` se lanza, las cabeceras ya viajaron.
  //
  // Medido, no supuesto —cuatro builds, cada una cambiando UNA cosa—:
  //
  //   notFound() en una página suelta de (publico)          → 404
  //   la misma página bajo /app, con src/app/app/loading.tsx → 200
  //   la misma, quitando ese loading.tsx                     → 404
  //   la ficha con su propio [id]/loading.tsx                → 200
  //
  // O sea que **cualquiera de los dos boundaries basta** para romperlo, y da
  // igual desde dónde se lance el `notFound()`: probarlo en `generateMetadata`
  // —que corre antes— también devolvió 200. No era el middleware, no era el
  // layout de /app y no era el `not-found.tsx` del segmento: los tres se
  // descartaron midiendo.
  //
  // Por eso la biblioteca vive ahora en el grupo `(biblioteca)`: así conserva
  // su esqueleto de carga —que es el que la spec pide, sobre una consulta de 83
  // filas— sin extender el `<Suspense>` a esta ruta. Y esta ficha se quedó sin
  // `loading.tsx` a propósito: es UNA consulta, el esqueleto compraba muy poco,
  // y costaba el código de estado.
  //
  // Lo que está en juego no es estético: `security.md` §1 responde 404 y nunca
  // 403 precisamente para que no se distinga «no existe» de «no es tuyo». Si el
  // servidor contesta 200 a las dos, quien enumera no necesita leer el cuerpo.
  //
  // Lo cazó `e2e/ficha-anime.spec.ts` mirando `response.status()`. Ningún test
  // que comprobara el HTML podía verlo: el HTML era el correcto.
  if (ficha === null) notFound();

  const { anime, checksumPortada, progresoEtiqueta, relleno, enlace, enlaces } = ficha;

  /**
   * `anime.status` es `text` + `CHECK` en la base, así que Drizzle lo infiere
   * como `string`. Se estrecha aquí contra la lista canónica en vez de
   * castear: si algún día llega un valor fuera del dominio, la ficha se pinta
   * sin badge en lugar de reventar al indexar un `Record`.
   */
  const estado: Estado | undefined = ESTADOS.find((valor) => valor === anime.status);

  const alternativos = titulosAlternativos(anime);
  const metadatos = metadatosDeFicha(anime);

  /**
   * ── EL PROGRESO NO ES ALCANZABLE TODAVÍA, Y SE DICE EN VEZ DE FINGIRLO ──
   *
   * `rellenoDeBarra` implementa la tabla completa de `anime-vault-domain` §4 y
   * está testeada caso por caso. Lo que no existe es la puerta para leer la
   * fila de `progress`: el vault expone `progress.label` (dentro de `listar`)
   * y **ni `kind`, ni `season`, ni `episode`, ni `percent`**.
   *
   * Con `null` la barra queda INDETERMINADA —pista sola, sin relleno—, que es
   * exactamente lo que se sabe. Poner 0 diría «no ha visto nada» y poner 100
   * diría lo contrario; las dos serían mentira.
   *
   * El día que el vault tenga `progreso(animeId)`, esta línea es lo único que
   * cambia. Anotado en `SUPUESTOS.md`.
   */

  const textoDeProgreso = etiquetaDeProgreso(progresoEtiqueta, relleno);

  /**
   * ── LOS GÉNEROS YA SALEN DE LA BASE (lote C1) ───────────────────────────
   * Los oficiales los trae AniList y las etiquetas `✦` las propone Claude.
   * `generosDeFicha` filtra por propiedad con el mismo `EXISTS` que el resto
   * del módulo: para un anime ajeno devuelve `[]`, no un 403.
   *
   * Sigue sin inventarse nada: si nadie ha pulsado «Enriquecer», la lista está
   * vacía y la sección pinta su estado vacío honesto.
   */
  const generos: readonly GeneroDeFicha[] = ficha.generos;

  const tieneSinopsis = anime.synopsis !== null && anime.synopsis.trim().length > 0;

  return (
    <article className={cn(PADDING_LATERAL, PADDING_VERTICAL)}>
      <nav
        aria-label="Ruta"
        className="pb-[var(--e-2)] pt-[var(--e-2)] font-mono text-mono text-[var(--ash-400)] tablet:pt-0"
      >
        <ol className="flex flex-wrap items-center gap-[var(--e-05)]">
          <li>
            <Enlace href="/app" className="font-mono text-mono">
              Biblioteca
            </Enlace>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="min-w-0 truncate text-[var(--porcelain-200)]">
            {anime.title}
          </li>
        </ol>
      </nav>

      <div className={REJILLA_FICHA}>
        {/* ── COLUMNA IZQUIERDA ────────────────────────────────────────────
         * `contents` hasta laptop: los hijos se convierten en celdas de la
         * rejilla de una columna y `order-*` los intercala con los de la
         * derecha para dar el orden de lectura de móvil (portada → título →
         * acción → progreso → …). Desde laptop la columna vuelve a existir
         * como caja y el orden lo da el DOM, que ya es el del artboard.
         *
         * Es la alternativa a duplicar los bloques y ocultar uno con `hidden`,
         * que dejaría dos copias del mismo texto en el árbol de accesibilidad
         * y dos veces el mismo contenido en el HTML. */}
        <div className="contents laptop:flex laptop:flex-col laptop:gap-[var(--e-3)]">
          <div className={cn("order-1 laptop:order-none", COLUMNA_PORTADA)}>
            <Portada src={urlDePortada(anime.id, checksumPortada)} />
          </div>

          <div className={cn("order-3 laptop:order-none", COLUMNA_PORTADA)}>
            <AccionContinuar enlace={enlace} />

            <div className="mt-[var(--e-2)]">
              <GestorEnlaces animeId={anime.id} enlaces={enlaces} />
            </div>
          </div>

          <section className={cn("order-7 laptop:order-none", COLUMNA_PORTADA)}>
            <h2 className={ETIQUETA_SECCION}>Datos</h2>

            {metadatos.length === 0 ? (
              <p className="mt-[var(--e-1)] font-mono text-mono text-[var(--ash-400)]">
                Sin datos todavía: formato, año y episodios llegan con el enriquecimiento.
              </p>
            ) : (
              <dl className="mt-[var(--e-1)] flex flex-col gap-[var(--e-1)]">
                {metadatos.map((fila) => (
                  <div
                    key={fila.etiqueta}
                    className="flex items-baseline justify-between gap-[var(--e-2)]"
                  >
                    <dt className="font-mono text-mono text-[var(--ash-400)]">{fila.etiqueta}</dt>
                    <dd className="m-0 text-right font-mono text-mono text-[var(--porcelain-200)]">
                      {fila.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>

        {/* ── COLUMNA DERECHA ──────────────────────────────────────────── */}
        <div className="contents laptop:flex laptop:flex-col laptop:gap-[var(--e-3)]">
          <header className="order-2 laptop:order-none">
            <div className="flex flex-wrap items-center gap-[var(--e-1-5)]">
              {estado !== undefined && <BadgeEstado estado={estado} />}

              {anime.isFavorite && (
                <span className="font-ui text-ui-s text-[var(--estado-favorito)]">
                  <span aria-hidden="true">★ </span>
                  Favorito
                </span>
              )}

              <p className="font-mono text-mono text-[var(--ash-400)]">
                añadido el {fechaCorta(anime.createdAt)}
              </p>
            </div>

            <h1 className={cn(TITULO_FICHA, "mt-[var(--e-1-5)] break-words")}>{anime.title}</h1>

            {alternativos.length > 0 && (
              <ul className="mt-[var(--e-1)] flex flex-col gap-[var(--e-05)]">
                {alternativos.map((titulo) => (
                  <li key={titulo} className="font-mono text-mono text-[var(--ash-400)]">
                    {titulo}
                  </li>
                ))}
              </ul>
            )}
          </header>

          <section className="order-5 laptop:order-none" aria-labelledby="ficha-generos">
            <h2 id="ficha-generos" className={ETIQUETA_SECCION}>
              Géneros y etiquetas
            </h2>

            <div className="mt-[var(--e-1-5)]">
              <BotonEnriquecer animeId={anime.id} yaEnriquecido={anime.anilistId !== null} />
            </div>

            {generos.length === 0 ? (
              <p className="mt-[var(--e-1)] max-w-[60ch] font-ui text-ui-s leading-ui text-[var(--porcelain-200)]">
                Todavía no hay ninguna. Los géneros oficiales llegan de AniList y las etiquetas
                marcadas con <span aria-hidden="true">✦</span> las propone la IA; ninguna de las dos
                cosas ha pasado aún con este anime.
              </p>
            ) : (
              <ul className="mt-[var(--e-1)] flex flex-wrap gap-[var(--e-1)]">
                {generos.map((genero) => (
                  <ChipGenero key={genero.id} genero={genero} />
                ))}
              </ul>
            )}
          </section>

          <section className="order-6 laptop:order-none" aria-labelledby="ficha-sinopsis">
            <h2 id="ficha-sinopsis" className={ETIQUETA_SECCION}>
              Sinopsis
            </h2>

            {tieneSinopsis ? (
              /* Texto plano, escapado por React. Nada de
               * `dangerouslySetInnerHTML`: la descripción de AniList llega con
               * HTML y se sanitiza en el servidor (`security.md` §9). */
              <p className="mt-[var(--e-1)] max-w-[70ch] whitespace-pre-line font-ui text-cuerpo-l leading-cuerpo-l text-[var(--porcelain-200)]">
                {anime.synopsis}
              </p>
            ) : (
              <p className="mt-[var(--e-1)] font-mono text-mono text-[var(--ash-400)]">
                Sin sinopsis todavía.
              </p>
            )}
          </section>

          {/* ── BLOQUE DE PROGRESO — §05: card `--slate-850`, borde superior
           * `--gold-400`, padding 28/32, número 56 px Cormorant, barra de 2 px.
           *
           * Es la ÚNICA card con `acento` de la pantalla, como manda el
           * sistema (§6: «solo una por pantalla»). Y como el único relleno
           * dorado sólido es la acción de continuar, no hay oro sobre oro. */}
          <Card
            acento
            className="order-4 p-[var(--e-3-5)] laptop:order-none laptop:px-[var(--e-4)]"
          >
            <h2 className={ETIQUETA_SECCION}>Progreso</h2>

            <div className="mt-[var(--e-2)] flex flex-wrap items-baseline gap-[var(--e-1-5)]">
              {relleno !== null && (
                <p className="font-display text-display-m font-[var(--fw-display-light)] leading-[var(--lh-solido)] text-[var(--porcelain-050)]">
                  {relleno}
                  <span className="text-titulo-s"> %</span>
                </p>
              )}

              <p className="font-mono text-mono text-[var(--ash-400)]">{textoDeProgreso}</p>
            </div>

            <div className="mt-[var(--e-3)]">
              {/* La barra dejó de ser de solo lectura: `AccionesFicha` la pinta
               * con la MISMA primitiva —`grosor="acento"`, los 2 px de §05— y
               * además la deja mover, con los tres botones rápidos de la skill
               * §4 y el borrado con su cuenta atrás. */}
              <AccionesFicha
                animeId={anime.id}
                titulo={anime.title}
                // `estado` puede ser `undefined` si la base trajera un valor
                // fuera del dominio. Las acciones necesitan uno concreto, y
                // `PENDIENTE` es el que el resto de la pantalla ya usa como
                // caída para ese caso imposible.
                estado={estado ?? "PENDIENTE"}
                esFavorito={anime.isFavorite}
                notas={anime.notes}
                porcentaje={relleno}
                etiquetaProgreso={textoDeProgreso}
              />
            </div>
          </Card>
        </div>
      </div>
    </article>
  );
}
