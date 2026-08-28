import { Enlace } from "@/components/ui/enlace";
import { Boton } from "@/components/ui/boton";
import { cn } from "@/lib/ui/cn";

import { CTA_NAV, CTA_PRINCIPAL, CTA_SECUNDARIO, ENLACES_NAV } from "./enlaces";
import { Marca } from "./marca";
import { CONTENEDOR, ETIQUETA_SECCION, MARCO_DORADO, PADDING_LATERAL } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HERO — artboard 02, los primeros 900 px.
 *
 * Cuatro capas, de abajo arriba, y ninguna de más:
 *
 *   1. `laja-hero.webp` al 50 % (`--textura-foto-opacidad`).
 *   2. Velo diagonal de `--void`. El artboard lo dibuja a .96 / .55 / .86;
 *      `design-tokens.md` exige que la laja fotográfica vaya **siempre bajo un
 *      velo de --void al 86–97 %**, así que el tramo del 55 % sube a 86. Gana
 *      la regla, y queda anotado en `SUPUESTOS.md`.
 *   3. La veta kintsugi en SVG: 1 px de trazo más un segundo trazo de 5 px al
 *      14 % como halo. Es una de las TRES formas permitidas de la veta, y la
 *      decorativa solo puede aparecer aquí y en el header del dashboard.
 *   4. El marco dorado de sección.
 *
 * El velo va en `style` y no en una utilidad arbitraria porque un
 * `linear-gradient` con tres `color-mix()` dentro de un `bg-[...]` obliga a
 * escribir cada espacio como guion bajo y se vuelve ilegible. Y el alfa se
 * consigue con `color-mix`, no con un color literal con canal alfa: el valor
 * tiene que salir del token, y `lint:tokens` rechaza esa notación en todo el
 * proyecto — con razón, porque un literal ahí se desincronizaría de la paleta.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** 105deg, de `--void` al 96 % a `--void` al 86 %. Ver la cabecera. */
const VELO_HERO = [
  "linear-gradient(105deg,",
  "color-mix(in srgb, var(--void) 96%, transparent) 34%,",
  "color-mix(in srgb, var(--void) 86%, transparent) 62%,",
  "color-mix(in srgb, var(--void) 88%, transparent) 100%)",
].join(" ");

/** El panel de arte respira sobre un fondo de `--void` al 40 %, como el artboard. */
const FONDO_PANEL_ARTE = "color-mix(in srgb, var(--void) 40%, transparent)";

/**
 * ── AQUÍ HABÍA TRES CIFRAS Y LAS TRES ERAN MENTIRA ───────────────────────
 *
 * «2 480 series catalogadas», «18 sitios enlazados» y «0 € para empezar»,
 * pintadas en Cormorant 34 px como si fueran datos. Ninguna lo era: el vault
 * tiene 83 animes, `streaming_site` tiene **cero** filas, y esto no es un
 * producto de pago.
 *
 * ── POR QUÉ SE QUITAN EN VEZ DE CONSULTARLAS ──────────────────────────────
 *
 * Se consideró leerlas de la base, que es lo que pedía la regla. Pero de las
 * tres, dos no dicen nada al ser ciertas: «83 series catalogadas» en la landing
 * de un vault personal es un dato sobre su dueño, no sobre el producto, y
 * «0 sitios enlazados» es peor que no poner nada. La tercera no tiene versión
 * cierta: no hay precio porque no hay producto que vender.
 *
 * Y hay una razón de robustez: la landing es la ÚNICA página pública, y atarla
 * a la base significa que se cae cuando se cae Neon. Una portada que no depende
 * de nada es lo que se quiere el día que algo va mal.
 *
 * El artboard §02 pinta tres KPIs. Se documenta la desviación en `SUPUESTOS.md`
 * porque el diseño manda — salvo cuando lo que manda es inventarse un dato.
 *
 * Si algún día hay cifras que decir de verdad, vuelven: el hueco es un `<ul>`
 * bajo los CTA y el rol tipográfico está en DESIGN-SPEC §2.
 */

export function Hero() {
  return (
    <header className="relative isolate overflow-hidden bg-[var(--void)] laptop:min-h-[900px]">
      {/* 1 · la laja fotográfica. `aria-hidden`: es textura, no comunica nada. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[url('/texturas/laja-hero.webp')] bg-cover bg-center opacity-[var(--textura-foto-opacidad)]"
      />

      {/* 2 · el velo diagonal de --void, que es lo que deja leer el titular. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: VELO_HERO }}
      />

      {/* 3 · la veta kintsugi, de la esquina inferior izquierda a la superior
       * derecha. `slice` en vez del ajuste por defecto para que la grieta cruce
       * el hero entero también cuando la ventana no mide 1440 × 900. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 h-full w-full"
        fill="none"
      >
        <path
          d="M-40 700 L360 470 L560 520 L980 210 L1200 250 L1480 60"
          strokeWidth="5"
          opacity=".14"
          style={{ stroke: "var(--gold-400)" }}
        />
        <path
          d="M-40 700 L360 470 L560 520 L980 210 L1200 250 L1480 60"
          strokeWidth="1"
          opacity=".85"
          style={{ stroke: "var(--gold-400)" }}
        />
        <path
          d="M560 520 L640 660 L600 820"
          strokeWidth="1"
          opacity=".5"
          style={{ stroke: "var(--gold-500)" }}
        />
        <path
          d="M980 210 L1040 90"
          strokeWidth="1"
          opacity=".4"
          style={{ stroke: "var(--gold-500)" }}
        />
      </svg>

      {/* 4 · el marco dorado de sección. */}
      <div aria-hidden="true" className={MARCO_DORADO} />

      <div
        className={cn(
          CONTENEDOR,
          PADDING_LATERAL,
          "relative flex flex-col pb-[var(--e-10)] pt-[var(--e-7)] laptop:min-h-[900px]",
        )}
      >
        <nav
          aria-label="Principal"
          className="flex flex-wrap items-center justify-between gap-[var(--e-3)]"
        >
          {/* El logotipo apunta a la propia landing: es el ancla de vuelta desde
           * cualquier scroll y desde las pantallas de autenticación. */}
          <Enlace href="/" desnudo aria-label="Anime Vault, inicio" className="rounded-boton">
            <Marca tamanoIcono={22} />
          </Enlace>

          <div className="flex flex-wrap items-center gap-[var(--e-3)] laptop:gap-[var(--e-4)]">
            <ul className="flex flex-wrap items-center gap-[var(--e-3)] laptop:gap-[var(--e-4)]">
              {ENLACES_NAV.map((enlace) => (
                <li key={enlace.href}>
                  <Enlace
                    href={enlace.href}
                    desnudo
                    className={cn(
                      "inline-flex min-h-[var(--tactil-min)] items-center rounded-boton tablet:min-h-0",
                      "font-ui text-ui text-[var(--porcelain-200)]",
                      "transition-colors duration-[var(--dur-rapida)] ease-base",
                      "hover:text-[var(--porcelain-050)]",
                    )}
                  >
                    {enlace.etiqueta}
                  </Enlace>
                </li>
              ))}
            </ul>

            <Boton href={CTA_NAV.href} variante={CTA_NAV.variante} tamano="m">
              {CTA_NAV.etiqueta}
            </Boton>
          </div>
        </nav>

        <div className="flex flex-1 flex-col items-start justify-center gap-[var(--e-10)] pt-[var(--e-10)] laptop:flex-row laptop:items-center laptop:gap-[var(--e-12)] laptop:pt-0">
          {/* Columna de texto: 640 px en el artboard. */}
          <div className="w-full laptop:max-w-[640px]">
            <p className={ETIQUETA_SECCION}>Biblioteca personal de anime</p>

            <h1
              className={cn(
                "mt-[var(--e-3)] font-display font-[var(--fw-display-light)]",
                "tracking-display text-[var(--porcelain-050)]",
                "text-display-s leading-titulo",
                "tablet:text-display-l tablet:leading-display",
                "laptop:text-hero laptop:leading-hero",
              )}
            >
              Lo que viste,
              <br />
              guardado en piedra.
            </h1>

            {/* 520 px de ancho de párrafo en el artboard: el titular ocupa 640 y
             * el cuerpo se recoge para que la línea no se alargue. */}
            <p className="mt-[var(--e-3)] max-w-[520px] font-ui text-cuerpo-l leading-cuerpo text-[var(--porcelain-200)]">
              Cada serie que empiezas deja una grieta. Anime Vault la rellena con oro: episodio,
              temporada, dónde lo dejaste y en qué sitio seguirlo.
            </p>

            <div className="mt-[var(--e-5)] flex flex-wrap items-center gap-[var(--e-2)]">
              <Boton href={CTA_PRINCIPAL.href} variante={CTA_PRINCIPAL.variante} tamano="l">
                {CTA_PRINCIPAL.etiqueta}
              </Boton>
              <Boton href={CTA_SECUNDARIO.href} variante={CTA_SECUNDARIO.variante} tamano="l">
                {CTA_SECUNDARIO.etiqueta}
              </Boton>
            </div>
          </div>

          {/* Panel de arte: 404 × 560 con marco de 1 px `--gold-700` y 10 px de
           * aire (DESIGN-SPEC §02). Es uno de los «paneles de arte explícitos»
           * donde el sistema permite las piezas kintsugi. */}
          <figure className="m-0 w-full max-w-[404px] border border-[var(--gold-700)] p-[var(--e-1)] laptop:shrink-0">
            <div
              role="img"
              aria-label="Ilustración: una figura de piedra alada, reparada con vetas de oro"
              className="aspect-[404/560] w-full bg-[url('/texturas/kintsugi-angel.webp')] bg-cover bg-center saturate-[.9]"
              style={{ backgroundColor: FONDO_PANEL_ARTE }}
            />
          </figure>
        </div>
      </div>
    </header>
  );
}
