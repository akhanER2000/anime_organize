import { BadgeEstado, BadgeTipo } from "@/components/ui/badge";
import { Boton, type VarianteBoton } from "@/components/ui/boton";
import { AreaTexto, Campo } from "@/components/ui/campo";
import { Enlace } from "@/components/ui/enlace";
import { BarraProgreso, Card, Veta } from "@/components/ui/card";
import { Chip, ChipEspejo } from "@/components/ui/chip";
import { Skeleton, SkeletonRejilla } from "@/components/ui/skeleton";
import { ESTADOS } from "@/lib/domain/enums";

import {
  MuestraCargando,
  MuestraCasillas,
  MuestraMedidorPassword,
  MuestraModal,
  MuestraToasts,
} from "./muestras";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Primitivas",
  robots: { index: false, follow: false },
};

/**
 * GALERÍA DE PRIMITIVAS.
 *
 * Cada componente en CADA uno de sus estados, sobre el fondo real de la
 * aplicación. Sirve para tres cosas:
 *
 *   1. ver el sistema entero de un vistazo;
 *   2. que `ui-fidelity-checker` lo compare contra `design/screens/01` en UNA
 *      pasada en vez de doce;
 *   3. que un agente que dude de cómo se ve un estado **mire aquí en vez de
 *      inventárselo**.
 *
 * Solo existe en desarrollo: `src/app/dev/layout.tsx` devuelve 404 en producción.
 */

function Seccion({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[var(--e-3)]">
      <div className="flex flex-col gap-[var(--e-05)]">
        <h2 className="font-display text-display-xs font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]">
          {titulo}
        </h2>
        {nota !== undefined && (
          <p className="max-w-[640px] font-ui text-ui-s text-[var(--ash-400)]">{nota}</p>
        )}
      </div>
      <Veta />
      {children}
    </section>
  );
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-ui text-etiqueta font-[var(--fw-ui-bold)] uppercase tracking-etiqueta text-[var(--gold-300)]">
      {children}
    </span>
  );
}

/** Una muestra con su nombre de token o de estado debajo. */
function Muestra({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-[var(--e-1)]">
      {children}
      <span className="font-mono text-mono-s text-[var(--ash-400)]">{nombre}</span>
    </div>
  );
}

const VARIANTES: VarianteBoton[] = ["primario", "solido", "secundario", "destructivo", "fantasma"];

/** Los tokens de color, agrupados como en el artboard 01. */
const PALETA = [
  {
    grupo: "Superficies · obsidiana / laja",
    tokens: [
      "--void",
      "--slate-950",
      "--slate-900",
      "--slate-850",
      "--slate-800",
      "--slate-700",
      "--slate-600",
    ],
  },
  {
    grupo: "Texto · porcelana / ceniza",
    tokens: [
      "--ash-inactivo",
      "--ash-400",
      "--porcelain-200",
      "--porcelain-100",
      "--porcelain-050",
    ],
  },
  {
    grupo: "Oro · kintsugi",
    tokens: [
      "--gold-700",
      "--gold-600",
      "--gold-500",
      "--gold-400",
      "--gold-300",
      "--gold-200",
      "--gold-100",
    ],
  },
  {
    grupo: "Semánticos · estado",
    tokens: [
      "--estado-visto",
      "--estado-viendo",
      "--estado-espera",
      "--estado-abandonado",
      "--estado-favorito",
      "--estado-viendo-texto",
      "--estado-abandonado-texto",
    ],
  },
] as const;

/** La escala tipográfica completa. Cormorant nunca por debajo de 26 px. */
const ESCALA_DISPLAY = [
  { token: "--fs-hero", px: "84", texto: "Anime Vault" },
  { token: "--fs-display-l", px: "64", texto: "Título de ficha" },
  { token: "--fs-display-m", px: "56", texto: "H2 de sección" },
  { token: "--fs-display-s", px: "44", texto: "H2 de pantalla" },
  { token: "--fs-display-xs", px: "40", texto: "Tu biblioteca" },
  { token: "--fs-titulo-l", px: "34", texto: "Título de card" },
  { token: "--fs-titulo-m", px: "32", texto: "Título de modal" },
  { token: "--fs-titulo-xs", px: "26", texto: "Mínimo de Cormorant" },
] as const;

const ESCALA_UI = [
  { token: "--fs-cuerpo-l", px: "17" },
  { token: "--fs-cuerpo", px: "16" },
  { token: "--fs-cuerpo-s", px: "15" },
  { token: "--fs-ui", px: "14" },
  { token: "--fs-ui-s", px: "13" },
  { token: "--fs-ui-xs", px: "12" },
  { token: "--fs-etiqueta", px: "11" },
  { token: "--fs-etiqueta-xs", px: "10" },
] as const;

export default function GaleriaPrimitivas() {
  return (
    <main className="fondo-laja fondo-ruido min-h-screen">
      <div className="mx-auto flex max-w-[var(--contenedor-max)] flex-col gap-[var(--e-12)] px-[var(--gutter-l)] py-[var(--e-10)]">
        <header className="flex flex-col gap-[var(--e-2)]">
          <Etiqueta>Solo en desarrollo</Etiqueta>
          <h1 className="font-display text-display-l font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]">
            Primitivas del sistema
          </h1>
          <p className="max-w-[640px] font-ui text-cuerpo-l leading-cuerpo-l text-[var(--porcelain-200)]">
            Cada componente en cada uno de sus estados, sobre el fondo real de la aplicación. Si
            dudas de cómo se ve algo, está aquí: no lo inventes.
          </p>
          <p className="font-mono text-mono text-[var(--ash-400)]">
            Contrastado con design/screens/01-hoja-de-estilo.png · esta ruta devuelve 404 en
            producción · las medidas rotuladas se leen del token, no de una utilidad numérica
          </p>
        </header>

        {/* ── PALETA ─────────────────────────────────────────────────────── */}
        <Seccion
          titulo="Paleta"
          nota="El nombre del token va debajo de cada muestra. Ningún hex se escribe fuera de globals.css: estas muestras leen la variable."
        >
          <div className="flex flex-col gap-[var(--e-5)]">
            {PALETA.map(({ grupo, tokens }) => (
              <div key={grupo} className="flex flex-col gap-[var(--e-2)]">
                <Etiqueta>{grupo}</Etiqueta>
                <div className="grid grid-cols-4 gap-[var(--e-2)] tablet:grid-cols-7">
                  {tokens.map((token) => (
                    <Muestra key={token} nombre={token}>
                      <div
                        className="h-[88px] w-full rounded-card border border-[var(--slate-700)]"
                        style={{ backgroundColor: `var(${token})` }}
                      />
                    </Muestra>
                  ))}
                </div>
              </div>
            ))}

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Derivados del oro · los únicos permitidos</Etiqueta>
              <div className="grid grid-cols-4 gap-[var(--e-2)] tablet:grid-cols-7">
                {[
                  "--gold-wash",
                  "--gold-wash-fuerte",
                  "--gold-borde",
                  "--gold-halo",
                  "--gold-glow",
                  "--gold-shimmer",
                  "--gold-foco",
                ].map((token) => (
                  <Muestra key={token} nombre={token}>
                    <div
                      className="h-[56px] w-full rounded-card border border-[var(--slate-700)] bg-[var(--slate-900)]"
                      style={{ backgroundColor: `var(${token})` }}
                    />
                  </Muestra>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Pan de oro y veta</Etiqueta>
              <div className="grid grid-cols-1 gap-[var(--e-2)] tablet:grid-cols-3">
                <Muestra nombre="--gold-leaf">
                  <div
                    className="h-[56px] w-full rounded-card"
                    style={{ backgroundImage: "var(--gold-leaf)" }}
                  />
                </Muestra>
                <Muestra nombre="--veta-horizontal">
                  <div className="flex h-[56px] w-full items-center">
                    <Veta />
                  </div>
                </Muestra>
                <Muestra nombre="--veta-corta">
                  <div className="flex h-[56px] w-full items-center">
                    <Veta corta />
                  </div>
                </Muestra>
              </div>
            </div>
          </div>
        </Seccion>

        {/* ── TIPOGRAFÍA ─────────────────────────────────────────────────── */}
        <Seccion
          titulo="Tipografía"
          nota="Cormorant Garamond para display, Inter para interfaz, IBM Plex Mono para datos. Cormorant nunca por debajo de 26 px; mono nunca para texto corrido."
        >
          <div className="grid grid-cols-1 gap-[var(--e-6)] laptop:grid-cols-2">
            <div className="flex flex-col gap-[var(--e-3)]">
              <Etiqueta>Display · Cormorant Garamond 300</Etiqueta>
              {ESCALA_DISPLAY.map(({ token, px, texto }) => (
                <div key={token} className="flex items-baseline gap-[var(--e-3)]">
                  <span className="w-[120px] shrink-0 font-mono text-mono-s text-[var(--ash-400)]">
                    {px} px
                  </span>
                  <span
                    className="truncate font-display font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]"
                    style={{ fontSize: `var(${token})` }}
                  >
                    {texto}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-[var(--e-3)]">
              <Etiqueta>Interfaz · Inter</Etiqueta>
              {ESCALA_UI.map(({ token, px }) => (
                <div key={token} className="flex items-baseline gap-[var(--e-3)]">
                  <span className="w-[120px] shrink-0 font-mono text-mono-s text-[var(--ash-400)]">
                    {px} px
                  </span>
                  <span
                    className="font-ui text-[var(--porcelain-100)]"
                    style={{ fontSize: `var(${token})` }}
                  >
                    El oro es la reparación, no el relleno
                  </span>
                </div>
              ))}

              <Etiqueta>Datos · IBM Plex Mono</Etiqueta>
              {["--fs-mono-l", "--fs-mono", "--fs-mono-s"].map((token) => (
                <div key={token} className="flex items-baseline gap-[var(--e-3)]">
                  <span className="w-[120px] shrink-0 font-mono text-mono-s text-[var(--ash-400)]">
                    {token}
                  </span>
                  <span
                    className="font-mono text-[var(--ash-400)]"
                    style={{ fontSize: `var(${token})` }}
                  >
                    24 episodios · 2011 · 9.5
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Seccion>

        {/* ── BOTONES ────────────────────────────────────────────────────── */}
        <Seccion
          titulo="Botón"
          nota="Cinco variantes. Regla del oro nº 3: un solo botón sólido por pantalla, como máximo. Pasa el ratón por encima del primario para ver el borde de pan de oro, y tabula para ver el anillo de foco."
        >
          <div className="flex flex-col gap-[var(--e-5)]">
            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Variantes · estado por defecto</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                {VARIANTES.map((v) => (
                  <Muestra key={v} nombre={v}>
                    <Boton variante={v}>Entrar al Vault</Boton>
                  </Muestra>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Deshabilitado</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                {VARIANTES.map((v) => (
                  <Muestra key={v} nombre={`${v} · disabled`}>
                    <Boton variante={v} disabled>
                      Entrar al Vault
                    </Boton>
                  </Muestra>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Cargando · el ancho no cambia</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                {VARIANTES.map((v) => (
                  <Muestra key={v} nombre={`${v} · cargando`}>
                    <Boton variante={v} cargando>
                      Entrar al Vault
                    </Boton>
                  </Muestra>
                ))}
                <Muestra nombre="interactivo">
                  <MuestraCargando />
                </Muestra>
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Tamaños</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                <Muestra nombre="s · var(--e-4) = 32 px">
                  <Boton tamano="s">Pequeño</Boton>
                </Muestra>
                <Muestra nombre="m · var(--tactil-min) = 44 px">
                  <Boton tamano="m">Normal</Boton>
                </Muestra>
                <Muestra nombre="l · var(--e-6) = 48 px">
                  <Boton tamano="l">Grande</Boton>
                </Muestra>
                <Muestra nombre="ancho completo">
                  <div className="w-[220px]">
                    <Boton ancho>Ocupa todo</Boton>
                  </div>
                </Muestra>
              </div>
            </div>
          </div>
        </Seccion>

        {/* ── CAMPOS ─────────────────────────────────────────────────────── */}
        <Seccion
          titulo="Campo"
          nota="Etiqueta, control, ayuda y error van juntos y conectados por aria-describedby. El estado de error lo activa la presencia del mensaje, no una prop booleana aparte que se pueda desincronizar."
        >
          <div className="grid max-w-[840px] grid-cols-1 gap-[var(--e-4)] tablet:grid-cols-2">
            <Campo etiqueta="Correo" placeholder="tu@correo.test" />
            <Campo etiqueta="Correo" defaultValue="yo@ejemplo.test" ayuda="Con ayuda debajo." />
            <Campo
              etiqueta="Correo"
              defaultValue="esto-no-es-un-correo"
              error="Esto no parece un correo. Revisa que tenga una @ y un dominio."
            />
            <Campo etiqueta="Correo" defaultValue="bloqueado@ejemplo.test" disabled />
            <Campo etiqueta="Contraseña" type="password" defaultValue="una-contrasena" />
            <Campo etiqueta="Buscar" type="search" placeholder="Busca en tu vault" />
            <div className="tablet:col-span-2">
              <AreaTexto
                etiqueta="Notas"
                placeholder="Lo que quieras recordar de esta serie"
                ayuda="Es lo único que no se puede recuperar de ninguna otra parte."
              />
            </div>
          </div>
        </Seccion>

        {/* ── CHIPS Y BADGES ─────────────────────────────────────────────── */}
        <Seccion
          titulo="Chip y badge"
          nota="El estado nunca se comunica solo por color: cada badge lleva su etiqueta de texto, y no hay forma de pedir uno sin ella."
        >
          <div className="flex flex-col gap-[var(--e-5)]">
            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Badge de estado · los cinco</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                {ESTADOS.map((e) => (
                  <Muestra key={e} nombre={e}>
                    <BadgeEstado estado={e} />
                  </Muestra>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Badge de tipo</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                <Muestra nombre="normal">
                  <BadgeTipo>GRATIS</BadgeTipo>
                </Muestra>
                <Muestra nombre="destacado">
                  <BadgeTipo destacado>PAGO</BadgeTipo>
                </Muestra>
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Chip de filtro</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                <Muestra nombre="default">
                  <Chip recuento={83}>Visto</Chip>
                </Muestra>
                <Muestra nombre="activo">
                  <Chip activo recuento={12}>
                    Viendo
                  </Chip>
                </Muestra>
                <Muestra nombre="recuento 0">
                  <Chip recuento={0}>Abandonado</Chip>
                </Muestra>
                <Muestra nombre="disabled">
                  <Chip disabled recuento={4}>
                    En espera
                  </Chip>
                </Muestra>
                <Muestra nombre="sin recuento">
                  <Chip>Favoritos</Chip>
                </Muestra>
              </div>
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Chip de espejo · abre en pestaña nueva</Etiqueta>
              <div className="flex flex-wrap items-end gap-[var(--e-3)]">
                <Muestra nombre="default">
                  <ChipEspejo etiqueta="V1" url="https://ejemplo.test" />
                </Muestra>
                <Muestra nombre="activo">
                  <ChipEspejo etiqueta="V2" url="https://ejemplo.test" activo />
                </Muestra>
                <Muestra nombre="roto">
                  <ChipEspejo etiqueta="V3" url="https://ejemplo.test" roto />
                </Muestra>
              </div>
            </div>
          </div>
        </Seccion>

        {/* ── CARD, VETA, PROGRESO ───────────────────────────────────────── */}
        <Seccion
          titulo="Card, veta y barra de progreso"
          nota="La veta kintsugi tiene tres formas y solo tres: divisor de sección, borde izquierdo en hover, y veta decorativa SVG (esta última solo en el hero y el header)."
        >
          <div className="grid grid-cols-1 gap-[var(--e-3)] tablet:grid-cols-2 laptop:grid-cols-4">
            <Muestra nombre="Card">
              <Card>
                <div className="p-[var(--e-3)] font-ui text-ui-s text-[var(--porcelain-200)]">
                  Superficie base
                </div>
              </Card>
            </Muestra>
            <Muestra nombre="Card acento">
              <Card acento>
                <div className="p-[var(--e-3)] font-ui text-ui-s text-[var(--porcelain-200)]">
                  Borde superior dorado
                </div>
              </Card>
            </Muestra>
            <Muestra nombre="Card elevada">
              <Card elevada>
                <div className="p-[var(--e-3)] font-ui text-ui-s text-[var(--porcelain-200)]">
                  --slate-800
                </div>
              </Card>
            </Muestra>
            <Muestra nombre="veta en hover">
              <Card vetaEnHover>
                <div className="p-[var(--e-3)] font-ui text-ui-s text-[var(--porcelain-200)]">
                  Pasa el ratón
                </div>
              </Card>
            </Muestra>
          </div>

          <div className="flex max-w-[520px] flex-col gap-[var(--e-4)]">
            <Etiqueta>Barra de progreso</Etiqueta>
            {[
              { p: 100, g: "hairline" as const, a: false, e: "Completo" },
              { p: 45, g: "hairline" as const, a: false, e: "45 %" },
              { p: 30, g: "acento" as const, a: false, e: "Temporada 2 · episodio 7" },
              { p: 60, g: "hairline" as const, a: true, e: "Abandonado en el episodio 12" },
              { p: null, g: "hairline" as const, a: false, e: "En proceso" },
            ].map(({ p, g, a, e }, i) => (
              <div key={i} className="flex flex-col gap-[var(--e-1)]">
                <BarraProgreso porcentaje={p} grosor={g} abandonado={a} etiqueta={e} />
                <span className="font-mono text-mono-s text-[var(--ash-400)]">
                  {p === null ? "indeterminado" : `${p} %`} · {g}
                  {a ? " · abandonado (sin halo)" : ""} — «{e}»
                </span>
              </div>
            ))}
          </div>
        </Seccion>

        {/* ── SKELETON ───────────────────────────────────────────────────── */}
        <Seccion
          titulo="Skeleton"
          nota="Shimmer dorado de 2,6 s con desfase de 0 / .3 / .6 s por columna, para que no pulsen todos a la vez. Con prefers-reduced-motion la animación se detiene y el esqueleto sigue siendo visible."
        >
          <div className="flex flex-col gap-[var(--e-4)]">
            <div className="flex max-w-[520px] flex-col gap-[var(--e-2)]">
              <Skeleton alto="h-11" redondeo="input" />
              <Skeleton alto="h-4" ancho="w-3/4" columna={1} />
              <Skeleton alto="h-3" ancho="w-1/2" columna={2} />
            </div>
            <div className="max-w-[900px]">
              <SkeletonRejilla cuantos={5} />
            </div>
          </div>
        </Seccion>

        {/* ── MODAL Y TOAST ──────────────────────────────────────────────── */}
        <Seccion
          titulo="Modal y toast"
          nota="El modal usa el <dialog> nativo: atrapa el foco, cierra con Escape y marca el resto de la página como inerte, sin reimplementar nada. Los toasts de éxito usan role=status (no interrumpe); los de error, role=alert (sí)."
        >
          <div className="flex flex-col gap-[var(--e-5)]">
            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Modal</Etiqueta>
              <MuestraModal />
            </div>
            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Toast · éxito con deshacer, error, progreso</Etiqueta>
              <MuestraToasts />
            </div>
          </div>
        </Seccion>

        {/* ── CASILLA, MEDIDOR Y ENLACE ──────────────────────────────────── */}
        <Seccion
          titulo="Casilla, medidor y enlace"
          nota="La casilla es un <input type=checkbox> real con la caja pintada encima: conserva teclado, indeterminado y lector de pantalla. Mide 15 px porque lo manda el diseño, pero el área pulsable es la fila entera (44 px). El medidor se anuncia con palabras, no con oro. El enlace pone rel=noopener él solo y se niega a renderizar un esquema que no sea http(s)."
        >
          <div className="flex flex-col gap-[var(--e-5)]">
            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Casilla · faceta, recuento, indeterminado, deshabilitada</Etiqueta>
              <MuestraCasillas />
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Medidor de contraseña · cuatro segmentos de 2 px</Etiqueta>
              <MuestraMedidorPassword />
            </div>

            <div className="flex flex-col gap-[var(--e-2)]">
              <Etiqueta>Enlace · interno, externo y esquema rechazado</Etiqueta>
              <div className="flex flex-col gap-[var(--e-1)] font-ui text-ui">
                <Enlace href="/app">Volver al vault (interno, con prefetch)</Enlace>
                <Enlace href="https://anilist.co" externo>
                  Ver en AniList (abre pestaña nueva)
                </Enlace>
                <span>
                  Esquema peligroso:{" "}
                  <Enlace href="javascript:alert(1)">
                    esto se pinta como texto inerte, no como enlace
                  </Enlace>
                </span>
              </div>
            </div>
          </div>
        </Seccion>

        <footer className="pb-[var(--e-10)]">
          <Veta />
          <p className="pt-[var(--e-3)] font-mono text-mono text-[var(--ash-400)]">
            Si algo de esta página no coincide con design/screens/01-hoja-de-estilo.png, manda el
            PNG. Si algo no está aquí, no está decidido: pregunta antes de inventarlo.
          </p>
        </footer>
      </div>
    </main>
  );
}
