import type { TipoProgreso } from "./enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAPEO DEL PROGRESO — de lo que escribió el propietario a lo que guarda la base.
 *
 * El contrato completo está en `.claude/skills/anime-vault-domain/SKILL.md` §4 y
 * **no se improvisa**: está validado contra los 83 animes reales.
 *
 * ── SE CONSERVA LA ETIQUETA ORIGINAL, NO UNA REESCRITA ────────────────────
 *
 * `label` es lo que pinta la interfaz, y sale tal cual de `animes-seed.json`.
 * «Completo (Todo Visto)» se queda así, con sus paréntesis y sus mayúsculas,
 * porque lo escribió su dueño. Los demás campos —`kind`, `season`— son los que
 * permiten calcular la barra y los botones rápidos.
 *
 * Reescribir la etiqueta a un «Completo» más limpio sería inventar datos del
 * usuario, que es justo lo que el encargo prohíbe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los tres valores que trae el seed. Cualquier otro es un dato inesperado. */
export type ProgresoDelSeed = "COMPLETO" | "T1" | "EN_PROCESO";

export type ProgresoMapeado = {
  kind: TipoProgreso;
  season: number | null;
  label: string;
};

/**
 * Mapea una fila del seed. **Tabla fija, sin heurística.**
 *
 * | seed | → `kind` | → `season` |
 * |---|---|---|
 * | `COMPLETO` (69 filas) | `COMPLETO` | — |
 * | `T1` (4 filas) | `TEMPORADA` | 1 |
 * | `EN_PROCESO` (10 filas) | `CUSTOM` | — |
 *
 * `EN_PROCESO` va a `CUSTOM` y no a `EPISODIO` a propósito: el seed no dice por
 * qué episodio va, así que fingir un número sería inventarlo. `CUSTOM` pinta la
 * barra indeterminada, que es exactamente lo que se sabe: que está a medias.
 */
export function mapearProgresoDelSeed(
  tipo: string,
  etiqueta: string,
): ProgresoMapeado | { desconocido: true; tipo: string } {
  switch (tipo) {
    case "COMPLETO":
      return { kind: "COMPLETO", season: null, label: etiqueta };
    case "T1":
      return { kind: "TEMPORADA", season: 1, label: etiqueta };
    case "EN_PROCESO":
      return { kind: "CUSTOM", season: null, label: etiqueta };
    default:
      // No se cae a un valor por defecto: un tipo que no conocemos es un dato
      // que hay que mirar, no uno que hay que adivinar. Quien llama lo pone en
      // el informe de la importación.
      return { desconocido: true, tipo };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL RELLENO DE LA BARRA — la tabla de la skill §4, en un solo sitio.
 *
 * ── ESTO VIVÍA EN LA CARPETA DE LA FICHA, Y LAS BARRAS SALÍAN VACÍAS ──────
 *
 * La implementación era correcta y estaba testeada. Lo que fallaba es que
 * **ninguna de las tres pantallas la usaba con datos de verdad**: la rejilla y
 * la vista lista pasaban `porcentaje={null}` a mano, y la ficha llamaba a
 * `rellenoDeBarra(null, anime)` con un `null` incrustado.
 *
 * Y no era por falta de datos: `progress` tiene **83 filas** —69 `COMPLETO`, 4
 * `TEMPORADA`, 10 `CUSTOM`— y `vault.listar()` ya devuelve los seis campos que
 * hacen falta. O sea que 69 de 83 barras tenían que estar llenas y estaban
 * vacías, en las tres pantallas a la vez.
 *
 * Pasó porque la regla vivía en la carpeta de UNA pantalla: las otras dos no
 * podían importarla sin cruzar carpetas, así que pasaron `null` y siguieron.
 * Es exactamente el patrón que describe `code-style.md` § «Conceptos con un
 * solo dueño», y por eso ahora vive aquí.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ProgresoDeFicha = {
  kind: TipoProgreso;
  season: number | null;
  episode: number | null;
  percent: number | null;
};

/** Los totales del anime. Se conocen solo si alguien los enriqueció. */
export type TotalesDelAnime = {
  totalEpisodes: number | null;
  totalSeasons: number | null;
};

/**
 * Relleno de la barra, en porcentaje entero, o `null` si es indeterminada.
 *
 * ── SE REDONDEA A ENTERO, Y ES DELIBERADO ─────────────────────────────────
 * El valor viaja a dos sitios: el `width` en CSS y el `aria-valuenow` de la
 * barra. En el ancho, la diferencia entre 33,333 % y 33 % es medio píxel en una
 * barra de 2 px de alto; en el anuncio del lector de pantalla, «treinta y tres
 * coma tres tres tres por ciento» es ruido. Se redondea una vez, aquí, en vez
 * de que cada consumidor decida por su cuenta.
 */
export function rellenoDeBarra(
  progreso: ProgresoDeFicha | null,
  totales: TotalesDelAnime,
): number | null {
  // Sin fila de progreso no hay nada que afirmar. Pista sola.
  if (progreso === null) return null;

  switch (progreso.kind) {
    case "COMPLETO":
      return 100;

    case "PORCENTAJE":
      return progreso.percent === null ? null : acotar(progreso.percent);

    case "EPISODIO":
      return fraccion(progreso.episode, totales.totalEpisodes);

    case "TEMPORADA":
      return fraccion(progreso.season, totales.totalSeasons);

    case "CUSTOM":
      // Texto libre: no hay forma de convertirlo en un número sin inventarlo.
      return null;
  }
}

/**
 * Texto que acompaña SIEMPRE a la barra.
 *
 * DESIGN-SPEC §7: «el estado nunca se comunica solo por color». Una barra es
 * color y geometría, así que necesita su etiqueta escrita al lado y su
 * `aria-label`. Esta función decide cuál, con la misma regla de siempre: se
 * prefiere **lo que escribió el usuario** (`progress.label`) y solo se compone
 * un texto propio cuando no hay ninguno.
 */
export function etiquetaDeProgreso(
  etiquetaDelUsuario: string | null,
  relleno: number | null,
): string {
  const limpia = etiquetaDelUsuario?.trim() ?? "";
  if (limpia.length > 0) return limpia;

  // Sin etiqueta del usuario y sin número: se dice lo que hay, que es nada.
  // Nunca «0 %» — eso afirmaría que no ha visto ni un episodio.
  if (relleno === null) return "Sin progreso registrado";

  return `${String(relleno)} %`;
}

/**
 * `parte / total` en porcentaje, o `null` si alguno de los dos no se conoce.
 *
 * Un total de `0` —o negativo, que la base impide pero un JSON de importación
 * no— devuelve `null` en vez de dividir: `1/0` es `Infinity` y un `width:
 * Infinity%` deja la barra llena mintiendo.
 */
function fraccion(parte: number | null, total: number | null): number | null {
  if (parte === null || total === null) return null;
  if (!Number.isFinite(parte) || !Number.isFinite(total)) return null;
  if (total <= 0) return null;

  return acotar((parte / total) * 100);
}

/** Entero dentro de `[0, 100]`. Un episodio 30 de 28 es 100 %, no 107 %. */
function acotar(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(100, Math.max(0, Math.round(valor)));
}

/**
 * El relleno a partir de una fila del listado, que es lo que tienen las tres
 * pantallas.
 *
 * ── POR QUÉ EL TIPO ES ESTRUCTURAL Y NO `AnimeEnListado` ──────────────────
 *
 * `domain/` no puede importar nada de `db/` —regla de dependencias de
 * `CLAUDE.md`—, así que se declara la FORMA que hace falta. `AnimeEnListado` la
 * cumple, y si algún día dejara de cumplirla el error saldría en la llamada, en
 * tiempo de compilación, no en una barra vacía.
 */
export type FilaConProgreso = {
  progresoTipo: TipoProgreso | null;
  progresoTemporada: number | null;
  progresoEpisodio: number | null;
  progresoPorcentaje: number | null;
  totalEpisodios: number | null;
  totalTemporadas: number | null;
};

export function rellenoDeFila(fila: FilaConProgreso): number | null {
  if (fila.progresoTipo === null) return null;

  return rellenoDeBarra(
    {
      kind: fila.progresoTipo,
      season: fila.progresoTemporada,
      episode: fila.progresoEpisodio,
      percent: fila.progresoPorcentaje,
    },
    { totalEpisodes: fila.totalEpisodios, totalSeasons: fila.totalTemporadas },
  );
}
