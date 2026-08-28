import { Boton } from "@/components/ui/boton";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS VACÍOS DEL VAULT — DESIGN-SPEC §6 y §08.
 *
 * ── NO SON EL MISMO VACÍO, Y CONFUNDIRLOS ES EL FALLO CLÁSICO ─────────────
 *
 *   · **Vault sin animes** — no hay nada que enseñar. La persona acaba de
 *     entrar por primera vez y lo que necesita es saber qué va a pasar aquí.
 *   · **Filtro sin resultados** — hay animes, pero este filtro no deja ver
 *     ninguno. Lo que necesita es QUITARLO, y decírselo con «tu vault está
 *     vacío» sería mentirle: acaba de ver el contador diciendo 83.
 *
 * ── Y HABÍA DOS COMPONENTES QUE HACÍAN ESO DE DOS MANERAS ─────────────────
 *
 * La rejilla y la lista traían cada una su `Vacio`. La diferencia no era de
 * adorno:
 *
 * | | rejilla | lista |
 * |---|---|---|
 * | titular con filtro | «Ninguna serie coincide» | «Sin resultados» |
 * | ¿dice CUÁL es el filtro? | sí, con su descripción | no |
 * | salida para quitarlo | un botón | **ninguna** — «quita alguno de los chips de arriba» |
 *
 * La tercera fila es la que importa y es comportamiento, no estética: en la
 * vista lista, quien filtraba hasta el vacío se quedaba **sin salida** y con
 * una instrucción para que lo resolviera él. Con el conmutador de vista
 * encima, la misma situación ofrecía un botón o no según en qué vista
 * estuvieras.
 *
 * Gana la versión de la rejilla en las tres, porque en las tres dice más.
 *
 * ── LO ÚNICO QUE SÍ VARÍA, Y ESTÁ EN LA SPEC ──────────────────────────────
 *
 * El icono. §08 pide «icono de laja de 72 px» para la biblioteca; §6, para el
 * vacío de una tabla, pide solo «sin resultados» centrado. Es una variación
 * declarada del diseño, así que es una prop con su cita — no dos ficheros.
 *
 * ── EL ICONO ES LA LOSA DEL SISTEMA, NO UNA CARITA TRISTE ─────────────────
 * Hairline de 1 px: el contorno en `--slate-600` y la fractura en `--gold-400`,
 * que es literalmente la metáfora de la marca — la losa partida y reparada con
 * kintsugi. Va `aria-hidden`: lo que informa es el titular, no el dibujo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type PropsVacio = {
  /**
   * DESIGN-SPEC §08 (biblioteca) lo pide; §6 (tabla) no. Por defecto sí: el
   * caso con icono es el de la pantalla principal.
   */
  readonly conIcono?: boolean;
} & (
  | { readonly variante: "vault" }
  | {
      readonly variante: "filtro";
      /** El filtro puesto, en palabras: «Visto o Viendo · Favoritos». */
      readonly descripcion: string;
      /**
       * A dónde lleva «Quitar los filtros».
       *
       * Se recibe en vez de escribir `/app`: quitar el filtro tiene que dejar la
       * URL igual que el chip «Todos», y ese conserva el orden y cualquier otro
       * parámetro. Lo calcula `urlSinFacetas`, que es el dueño de esa decisión.
       */
      readonly hrefSinFiltros: string;
    }
);

/** Ancho máximo del párrafo de un estado vacío — DESIGN-SPEC §08: «380 px máx.». */
const ANCHO_PARRAFO = "max-w-[380px]";

export function Vacio(props: PropsVacio) {
  const esFiltro = props.variante === "filtro";
  const conIcono = props.conIcono ?? true;

  return (
    <div
      className="flex flex-col items-center gap-[var(--e-3)] py-[var(--e-12)] text-center"
      role="status"
    >
      {conIcono && <IconoLaja />}

      <h2 className="font-display text-titulo-l font-[var(--fw-display-light)] leading-titulo tracking-display text-[var(--porcelain-050)]">
        {esFiltro ? "Ninguna serie coincide" : "Tu vault está vacío"}
      </h2>

      <p
        className={`${ANCHO_PARRAFO} font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]`}
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
       * ausencia. Anotado como PARADA en `SUPUESTOS.md`.
       *
       * Es un `<a>` —`Boton` con `href`—, no un `<button>`: navega, así que se
       * abre con el clic central, se copia con «copiar dirección» y funciona con
       * JavaScript caído. Coherente con que el filtro viva en la URL, que es
       * toda la premisa de estas dos pantallas. */}
      {esFiltro && (
        <Boton href={props.hrefSinFiltros} variante="primario">
          Quitar los filtros
        </Boton>
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
