import "server-only";

import { and, desc, eq, or, sql } from "drizzle-orm";

import { ESTADOS } from "@/lib/domain/enums";
import type { Estado, Formato, TipoProgreso } from "@/lib/domain/enums";
import { normalizarParaBusqueda, normalizarTitulo } from "@/lib/domain/normalizar";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { conTransaccion, dbInterna, type ClienteInterno } from "./interno";
import { anime, animeCover, continueLink, progress } from "./schema";

/**
 * El umbral de similitud trigram. **0.55, y no se toca sin actualizar los
 * tests** (skill de dominio §2c).
 *
 * Se declara aquí y no se importa de `domain/duplicados.ts` a propósito: este
 * módulo va a Postgres y `domain/` no puede importar nada de `db/`, así que la
 * dependencia iría al revés. `src/lib/domain/duplicados.test.ts` comprueba que
 * las dos constantes coinciden — si divergen, la política pura y la consulta
 * dejarían de hablar del mismo umbral y nadie se enteraría.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS COLUMNAS DE UN LISTADO — **una sola vez**.
 *
 * `listar()` y `buscar()` tienen que devolver EXACTAMENTE la misma forma: la
 * rejilla y la tabla las pintan sin saber de cuál vienen. Escribirlas dos veces
 * es garantizar que un día una traiga `totalEpisodios` y la otra no, y que la
 * barra de progreso salga vacía solo cuando se busca — un fallo que aparece en
 * la mitad de los casos, que es la peor forma de aparecer.
 *
 * Y `anime_cover.bytes` NO está aquí, en ninguna de las dos: son megabytes por
 * fila. Solo viaja el `checksum`, que es lo que necesita la URL versionada de
 * `/api/covers`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const COLUMNAS_DEL_LISTADO = {
  id: anime.id,
  titulo: anime.title,
  // La columna es `text` + `CHECK` (ver db-conventions.md): Drizzle la infiere
  // como `string`, así que se estrecha aquí, en el ÚNICO sitio que lee esa
  // columna para un listado. El `CHECK` garantiza que el valor está en la
  // lista; el tipo lo declara.
  estado: sql<Estado>`${anime.status}`,
  esFavorito: anime.isFavorite,
  anio: anime.year,
  actualizadoEn: anime.updatedAt,
  checksumPortada: animeCover.checksum,
  progresoEtiqueta: progress.label,
  progresoTipo: sql<TipoProgreso | null>`${progress.kind}`,
  progresoTemporada: progress.season,
  progresoEpisodio: progress.episode,
  progresoPorcentaje: progress.percent,
  totalEpisodios: anime.totalEpisodes,
  totalTemporadas: anime.totalSeasons,
} as const;

/**
 * El tope de un listado.
 *
 * **Ningún recuento sale de aquí**: los agregados van por `GROUP BY` en
 * `recuentos()`. Contar el resultado de una consulta acotada devuelve el tope
 * disfrazado de cuenta, y con 83 filas eso no se nota — con 600 sí.
 */
const LIMITE_LISTADO = 500;

const UMBRAL_SIMILITUD = 0.55;

/** Hasta tres candidatos en el aviso de duplicado (skill §2c). */
const LIMITE_SIMILARES = 3;

/** ¿Es este texto uno de los cinco estados del dominio? */
function esEstado(valor: string): valor is Estado {
  return (ESTADOS as readonly string[]).includes(valor);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL VAULT — la única puerta a los datos de un usuario.
 *
 * **No hay forma de llegar a las tablas sin pasar por aquí**, y no hay forma de
 * entrar aquí sin un `ContextoUsuario`, que a su vez no se puede falsificar.
 * Ver `contexto.ts` para las cuatro capas y dónde está el hueco.
 *
 * REGLA INTERNA DE ESTE FICHERO, y es la única que hay que sostener a mano:
 * **toda consulta usa `mias()` o `mio(id)` en su `WHERE`.** No se escribe
 * `eq(anime.id, ...)` suelto en ningún sitio. Son cuatro líneas de vigilancia
 * en un solo archivo, en vez de cuarenta repartidas por la aplicación.
 *
 * Cada consulta tiene su test de mutación en `vault.integracion.test.ts`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ── `Estado` Y `Formato`, NO `string` ──────────────────────────────────────
 * Estaban tipados como `string`, y eso convertía en válido en tiempo de
 * compilación cualquier cosa: un `"visto"` en minúsculas, un `"COMPLETADO"`
 * traído de una importación, un `""`. La barrera era el `CHECK` de Postgres,
 * o sea un 500 en producción en vez de un error en el editor.
 *
 * Importa especialmente ahora: cada pantalla que cree o edite un anime pasa por
 * aquí, y un contrato laxo se copia en todas. Los literales salen de
 * `src/lib/domain/enums.ts`, que es la única lista y la misma que consumen Zod,
 * el `CHECK` de la base y la UI.
 */
export type DatosCrearAnime = {
  titulo: string;
  estado: Estado;
  formato?: Formato | null;
  anio?: number | null;
  notas?: string | null;
  esFavorito?: boolean;
  anilistId?: number | null;
};

export type DatosEditarAnime = Partial<Omit<DatosCrearAnime, "titulo">> & {
  titulo?: string;
};

/**
 * El progreso de un anime.
 *
 * `label` **siempre** se rellena: es lo que pinta la interfaz, y sale tal cual
 * de lo que escribió el usuario. Los demás campos son los que permiten calcular
 * la barra y los botones rápidos. Ver la skill de dominio §4.
 */
export type DatosProgreso = {
  kind: TipoProgreso;
  label: string;
  temporada?: number | null;
  episodio?: number | null;
  porcentaje?: number | null;
};

/**
 * Un enlace para continuar viendo: la URL EXACTA del capítulo.
 *
 * `siteId` es opcional a propósito (skill de dominio §7): se puede pegar un
 * enlace suelto sin asociarlo a ningún sitio, que es lo que la gente hace la
 * primera vez.
 */
export type DatosEnlace = {
  url: string;
  /** Legible: «AnimeFLV V2 · Ep 7». */
  etiqueta?: string | null;
  temporada?: number | null;
  episodio?: number | null;
  siteId?: string | null;
};

/** Lo que se guarda de una portada ya procesada. */
export type DatosPortada = {
  bytes: Buffer;
  miniatura: Buffer;
  mime: string;
  ancho: number;
  alto: number;
  checksum: string;
  /** Solo referencia histórica. Nada de la aplicación lee de aquí. */
  urlOrigen?: string | null;
};

/** Lo que devuelve un listado. **Nunca incluye los bytes de la portada.** */
/** Una celda del cruce estado × favorito que devuelve `recuentos()`. */
export type CeldaDeRecuento = {
  readonly estado: Estado;
  readonly favorito: boolean;
  readonly n: number;
};

export type AnimeEnListado = {
  id: string;
  titulo: string;
  estado: Estado;
  esFavorito: boolean;
  anio: number | null;
  actualizadoEn: Date;
  /** Para construir la URL versionada. Los BYTES no viajan aquí. */
  checksumPortada: string | null;
  progresoEtiqueta: string | null;

  /**
   * ── LO QUE LA BARRA DE PROGRESO NECESITA PARA TENER RELLENO ──────────────
   *
   * Antes solo viajaba `progresoEtiqueta`, y con una etiqueta no se puede
   * calcular un porcentaje: la pantalla no tenía más remedio que pintar la
   * pista sola. Lo señaló el agente de la biblioteca, y tenía razón — «la barra
   * no puede llevar relleno» no era una decisión de diseño, era una consulta
   * incompleta.
   *
   * Con estos cuatro campos, la regla de la skill §4 se puede aplicar entera:
   * `COMPLETO` → 100 %, `PORCENTAJE` → su valor, `EPISODIO` → `episodio/total`
   * si se conoce el total, `TEMPORADA` → `temporada/total`, `CUSTOM` →
   * indeterminada. **Siguen sin viajar los bytes de la portada.**
   */
  progresoTipo: TipoProgreso | null;
  progresoTemporada: number | null;
  progresoEpisodio: number | null;
  progresoPorcentaje: number | null;
  totalEpisodios: number | null;
  totalTemporadas: number | null;
};

/**
 * El contrato del vault, escrito explícitamente.
 *
 * No se deriva con `ReturnType<typeof vaultDe>` a propósito: un tipo derivado no
 * se puede leer, y esta interfaz ES la documentación de qué se puede hacer con
 * los datos de un usuario. Si una operación no está aquí, no existe.
 */
export interface Vault {
  /**
   * NO hay `userId` aquí, y es deliberado.
   *
   * Un `{ ...vault, userId: otroId }` copiaría los métodos —que son closures
   * sobre el contexto real y siguen filtrando bien— pero dejaría una etiqueta
   * MENTIROSA que acabaría en un log culpando al usuario equivocado.
   *
   * Quien tiene el contexto ya tiene el `userId`. Se elimina la superficie en
   * vez de vigilarla.
   */

  // Lectura
  listar(opciones?: { limite?: number }): Promise<AnimeEnListado[]>;
  obtener(animeId: string): Promise<typeof anime.$inferSelect | null>;
  contar(): Promise<number>;
  /**
   * Los recuentos de los chips en UNA consulta, sin traerse las filas.
   *
   * ── POR QUÉ EXISTE, SI YA ESTABAN CALCULÁNDOSE ──────────────────────────
   *
   * Se calculaban en JavaScript, recorriendo las 83 filas que `listar()` ya
   * había traído. Correcto y gratis… mientras la barra de filtros y la rejilla
   * salgan del mismo `await`.
   *
   * Dejan de salir del mismo `await` en cuanto la rejilla vive dentro de un
   * `<Suspense>`: la barra tiene que poder pintarse ANTES de que lleguen las
   * filas, o el esqueleto no sirve de nada porque igualmente se espera a todo.
   *
   * Y es la consulta barata de las dos: cinco filas agregadas contra
   * `idx_anime_user_status`, sin JOIN y sin tocar `anime_cover`. Las dos se
   * lanzan a la vez desde la página, así que el coste en reloj es el de la más
   * lenta, no la suma.
   */
  recuentos(): Promise<{
    porEstado: Record<Estado, number>;
    total: number;
    favoritos: number;
    /**
     * El cruce estado × favorito, diez celdas como mucho.
     *
     * Con esto se responde cuántos coinciden con CUALQUIER combinación de las
     * dos facetas sin traerse una sola fila de anime — que es lo que hacía
     * falta para que el contador «N de M» deje de contar sobre un listado con
     * tope. Ver `contarCoincidentes` en `validation/biblioteca.ts`.
     */
    matriz: CeldaDeRecuento[];
  }>;
  portada(
    animeId: string,
    tamano: "full" | "thumb",
  ): Promise<{ bytes: Buffer | null; mime: string; checksum: string } | null>;
  enlaceMasReciente(
    animeId: string,
  ): Promise<{ id: string; url: string; etiqueta: string | null } | null>;
  /**
   * Los animes PROPIOS parecidos a un título, para el aviso de duplicado.
   *
   * ── ESTO NO BLOQUEA NADA. PREGUNTA ──────────────────────────────────────
   *
   * La skill de dominio §2 es explícita: la coincidencia exacta y el
   * `anilist_id` bloquean; la similitud **pregunta**. Devuelve como mucho tres
   * candidatos y la decisión es del usuario, no nuestra.
   *
   * Por qué importa aquí y no es teoría: `higurashi no naku koro ni` y
   * `higurashi no naku koro ni 2020` pasan de 0.55, y **las dos series están en
   * el vault de verdad, a propósito**. Un umbral que bloqueara tiraría una de
   * las dos. Lo mismo con `White Album` y `White Album 2`.
   *
   * ── Y LOS PROCESOS POR LOTES NO LLAMAN A ESTO ───────────────────────────
   *
   * El seed y la importación de Excel bloquean solo por exacto y por
   * `anilist_id`. Si el seed filtrara por similitud, perdería los tres
   * Higurashi en silencio. Esta consulta es del flujo interactivo, donde hay
   * una persona mirando.
   */
  similares(
    tituloNormalizado: string,
    limite?: number,
  ): Promise<
    {
      id: string;
      titulo: string;
      tituloNormalizado: string;
      anilistId: number | null;
      similitud: number;
    }[]
  >;
  /** El anime propio con ese `anilist_id`, si lo hay. Bloquea el alta duplicada. */
  /**
   * El anime con ESE `title_normalized` exacto, si lo hay.
   *
   * Es la comprobación (a) de la skill §2, la que BLOQUEA. Existe como método
   * propio y no como `similares(…, 1)` porque son preguntas distintas: ésta es
   * igualdad y la otra es parecido, y el `UNIQUE (user_id, title_normalized)`
   * responde a ésta.
   */
  /**
   * Buscador global — artboard 07.
   *
   * Devuelve las MISMAS filas que `listar()`, para que la rejilla y la tabla las
   * pinten sin saber si vienen de un listado o de una búsqueda.
   */
  buscar(consulta: string, opciones?: { limite?: number }): Promise<AnimeEnListado[]>;
  /**
   * Cuántos casan con la búsqueda, **sin tope**.
   *
   * Contar el resultado de `buscar()` devolvería el tope disfrazado de cuenta,
   * que es el fallo que ya se arregló en los contadores de las dos pantallas.
   */
  contarBusqueda(consulta: string): Promise<number>;
  porTituloNormalizado(tituloNormalizado: string): Promise<{ id: string; titulo: string } | null>;
  /**
   * El progreso guardado de un anime PROPIO, o `null`.
   *
   * `obtener()` devuelve la fila de `anime` y **no** su progreso: son dos
   * tablas y `progress` no se necesita en la mayoría de las lecturas. Los
   * botones rápidos sí lo necesitan, y lo leen del servidor en vez de recibirlo
   * — «+1 episodio» sobre un número que mandó el cliente sería incrementar lo
   * que el cliente diga.
   */
  progresoDe(animeId: string): Promise<{
    tipo: TipoProgreso | null;
    etiqueta: string | null;
    temporada: number | null;
    episodio: number | null;
    porcentaje: number | null;
  } | null>;
  porAnilistId(anilistId: number): Promise<{ id: string; titulo: string } | null>;

  // Escritura
  crear(datos: DatosCrearAnime): Promise<{ id: string } | null>;
  /**
   * Guarda o reemplaza la portada de un anime PROPIO.
   *
   * Devuelve `null` si el anime no existe o no es suyo — indistinguible, como
   * todo lo demás aquí. La comprobación de propiedad va DENTRO de la escritura,
   * no antes: comprobar y luego escribir deja una ventana entre las dos.
   */
  guardarPortada(animeId: string, datos: DatosPortada): Promise<{ animeId: string } | null>;
  /**
   * Guarda o reemplaza el progreso de un anime PROPIO.
   *
   * `progress.anime_id` es a la vez PK y FK: **como mucho una fila por anime**.
   * Por eso es «guardar» y no «añadir».
   */
  guardarProgreso(animeId: string, datos: DatosProgreso): Promise<{ animeId: string } | null>;
  /**
   * Todos los enlaces de un anime PROPIO, el más reciente primero.
   *
   * `NULLS LAST` explícito: en Postgres, `DESC` pone los `NULL` **primero**, así
   * que un enlace recién pegado —`last_used_at` a `null` hasta que se usa— se
   * colaría por delante del que la persona abrió hace diez minutos. Es la
   * versión de este orden que se ve mal solo cuando ya hay dos enlaces.
   */
  enlaces(animeId: string): Promise<
    {
      id: string;
      url: string;
      etiqueta: string | null;
      temporada: number | null;
      episodio: number | null;
      ultimoUso: Date | null;
    }[]
  >;
  /** Añade un enlace a un anime PROPIO. `null` si no existe o no es suyo. */
  guardarEnlace(animeId: string, datos: DatosEnlace): Promise<{ id: string } | null>;
  /**
   * Marca un enlace como usado AHORA. Es lo que decide cuál es el más reciente.
   *
   * Devuelve la URL para que quien llama pueda abrirla sin una segunda consulta
   * —y sin fiarse de una que le hayan pasado por parámetro—.
   */
  marcarEnlaceUsado(enlaceId: string): Promise<{ url: string } | null>;
  borrarEnlace(enlaceId: string): Promise<{ id: string } | null>;
  editar(animeId: string, datos: DatosEditarAnime): Promise<{ id: string } | null>;
  borrar(animeId: string): Promise<{ id: string } | null>;
}

/**
 * Abre el vault de un usuario.
 *
 * Es imposible llamar a esto sin un `ContextoUsuario`, y es imposible fabricar
 * uno fuera de `src/auth.ts`. Ese es todo el mecanismo.
 *
 * @param ctx contexto de una sesión ya verificada contra la base
 * @param cliente cliente de base de datos; los tests de integración inyectan el
 *        suyo. Por defecto, el de la aplicación.
 */
export function vaultDe(ctx: ContextoUsuario, cliente: ClienteInterno = dbInterna()): Vault {
  // LA GARANTÍA DE VERDAD, y está en runtime. Los tipos bloquean el literal y
  // el `new`, pero un `any` —de `JSON.parse` o `Object.create`— se cuela sin
  // `as`. Aquí no: un contexto sin la marca privada no abre nada.
  // Ver `ContextoUsuario.esAutentico`.
  if (!ContextoUsuario.esAutentico(ctx)) {
    throw new ErrorContextoFalsificado();
  }

  /**
   * Condición de propiedad. **Todo `WHERE` de este fichero empieza por aquí.**
   */
  const mias = () => eq(anime.userId, ctx.userId);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * EL `WHERE` DE LA BÚSQUEDA — escrito UNA vez.
   *
   * Lo usan `buscar()` y `contarBusqueda()`. Escribirlo dos veces sería
   * garantizar que un día se cuente una cosa y se enseñe otra, y que nadie lo
   * note hasta que los dos números se miren juntos.
   *
   * Devuelve `null` para una consulta vacía: con `LIKE %%` casaría todo, y el
   * buscador enseñaría el vault entero al enfocar el campo — que se lee como
   * «he buscado y esto es lo que hay» en vez de «no has buscado nada».
   *
   * ── DOS CAMINOS, Y NINGUNO SOBRA ────────────────────────────────────────
   *
   * 1. **`title_normalized LIKE …`** con el término pasado por
   *    `normalizarParaBusqueda`: insensible a puntuación, así que `fate zero`
   *    encuentra `Fate/Zero`. Y es el que podrá usar `idx_anime_title_norm_trgm`
   *    el día que haya filas suficientes.
   * 2. **`unaccent(…) ILIKE`** sobre `title`, los alternativos, los sinónimos y
   *    las notas. Cubre lo que el primero no puede: `normalizarParaBusqueda`
   *    descarta lo que no sea `[0-9a-z]`, así que un término en japonés se le
   *    queda en vacío. Está fijado con un test que solo esa rama resuelve.
   *
   * ── SIN ÍNDICE PROPIO, Y ES UNA DECISIÓN ───────────────────────────────
   *
   * `db-conventions.md` prevé `idx_anime_search_trgm` sobre `unaccent(title)`.
   * No se crea todavía, por dos motivos comprobables: el vault tiene 83 filas
   * —y la misma regla dice «ni antes, que cuesta escrituras, ni después de que
   * duela»—, y `unaccent()` es `STABLE`, no `IMMUTABLE`, así que **Postgres
   * rechaza indexarla**. Haría falta una función envoltorio marcada
   * `IMMUTABLE`, y marcarlo mal corrompe el índice en silencio.
   *
   * Escrito aquí para que dentro de un año no se tome por olvido.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const condicionDeBusqueda = (consulta: string) => {
    const crudo = consulta.trim();
    if (crudo === "") return null;

    const normalizada = normalizarParaBusqueda(crudo);
    // Los patrones viajan como PARÁMETRO, nunca interpolados: `sql.raw` con un
    // dato del usuario está prohibido (`security.md` §9), y esto lo es.
    const patron = `%${crudo}%`;
    const patronNormalizado = `%${normalizada}%`;

    return {
      normalizada,
      condicion: and(
        mias(),
        or(
          normalizada === "" ? undefined : sql`${anime.titleNormalized} like ${patronNormalizado}`,
          sql`unaccent(${anime.title}) ilike unaccent(${patron})`,
          sql`unaccent(coalesce(${anime.titleEnglish}, '')) ilike unaccent(${patron})`,
          // El nativo va en japonés: `unaccent` no aporta nada y el `ilike` ya
          // es insensible a mayúsculas donde eso significa algo.
          sql`coalesce(${anime.titleNative}, '') ilike ${patron}`,
          // Los sinónimos son `text[]`: se aplanan para poder buscarlos.
          sql`unaccent(array_to_string(coalesce(${anime.synonyms}, '{}'), ' ')) ilike unaccent(${patron})`,
          sql`unaccent(coalesce(${anime.notes}, '')) ilike unaccent(${patron})`,
        ),
      ),
    };
  };

  /** Un anime concreto, pero solo si es suyo. Las DOS condiciones, siempre. */
  const mio = (animeId: string) => and(eq(anime.id, animeId), mias());

  return {
    // ─────────────────────────────────────────────────────────────────────
    // LECTURA
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Listado de la biblioteca.
     *
     * `anime_cover.bytes` NO se selecciona: son megabytes por fila. Solo viaja
     * el `checksum`, que es lo que necesita la URL versionada de `/api/covers`.
     */
    async listar(opciones: { limite?: number } = {}): Promise<AnimeEnListado[]> {
      return (
        cliente
          .select(COLUMNAS_DEL_LISTADO)
          .from(anime)
          // Las tablas hijas se alcanzan por JOIN contra `anime` YA filtrado,
          // nunca con un `WHERE anime_id = ?` suelto.
          .leftJoin(animeCover, eq(animeCover.animeId, anime.id))
          .leftJoin(progress, eq(progress.animeId, anime.id))
          .where(mias())
          .orderBy(desc(anime.updatedAt))
          .limit(opciones.limite ?? LIMITE_LISTADO)
      );
    },

    /**
     * ═════════════════════════════════════════════════════════════════════
     * BUSCADOR GLOBAL — artboard 07.
     *
     * ── DOS CAMINOS, Y NINGUNO SOBRA ─────────────────────────────────────
     *
     * 1. **`title_normalized LIKE …`** con el término pasado por
     *    `normalizarParaBusqueda`. Es el camino insensible a puntuación:
     *    escribir `fate zero` encuentra `Fate/Zero`. Y es el que podrá usar
     *    `idx_anime_title_norm_trgm` el día que haya filas suficientes.
     *
     * 2. **`unaccent(…) ILIKE`** sobre `title`, `title_english`,
     *    `title_native`, los sinónimos y las notas. Cubre lo que el primero no
     *    puede: `normalizarParaBusqueda` descarta todo lo que no sea
     *    `[0-9a-z]`, así que un término en japonés se le queda en vacío.
     *    Buscar `君の名は` solo funciona por aquí.
     *
     * ── SIN ÍNDICE PROPIO, Y ES UNA DECISIÓN ─────────────────────────────
     *
     * `db-conventions.md` prevé `idx_anime_search_trgm` sobre `unaccent(title)`.
     * **No se crea todavía**, por dos motivos comprobables:
     *
     *   · el vault tiene 83 filas, y la misma regla dice «se crea cuando hay un
     *     `WHERE` que lo usa; ni antes, que cuesta escrituras, ni después de que
     *     duela». A 83 filas el recorrido secuencial es instantáneo;
     *   · `unaccent()` es `STABLE`, no `IMMUTABLE`, así que **Postgres rechaza
     *     indexarla**. Haría falta una función envoltorio marcada `IMMUTABLE`,
     *     que es una migración con su propia decisión detrás — y de las que se
     *     hacen mal fácil, porque marcar `IMMUTABLE` algo que no lo es corrompe
     *     el índice en silencio.
     *
     * Escribirlo aquí es lo que impide que dentro de un año se tome por olvido.
     *
     * ── LA CONSULTA VACÍA DEVUELVE VACÍO ─────────────────────────────────
     *
     * Con `LIKE '%%'` casaría todo, y el buscador enseñaría los 83 al enfocar el
     * campo — que se lee como «he buscado y esto es lo que hay» en vez de «no
     * has buscado nada».
     * ═════════════════════════════════════════════════════════════════════
     */
    async buscar(consulta: string, opciones: { limite?: number } = {}) {
      const donde = condicionDeBusqueda(consulta);
      if (donde === null) return [];

      return (
        cliente
          .select(COLUMNAS_DEL_LISTADO)
          .from(anime)
          .leftJoin(animeCover, eq(animeCover.animeId, anime.id))
          .leftJoin(progress, eq(progress.animeId, anime.id))
          .where(donde.condicion)
          // El más parecido primero, y a igualdad el más reciente. Sin un orden
          // explícito lo decide Postgres, que es decir «cualquiera» — y con la
          // misma consulta dos veces podría no ser el mismo.
          .orderBy(
            sql`similarity(${anime.titleNormalized}, ${donde.normalizada}) desc`,
            desc(anime.updatedAt),
          )
          .limit(opciones.limite ?? LIMITE_LISTADO)
      );
    },

    /**
     * Cuántos casan con la búsqueda. **Sin tope.**
     *
     * ── POR QUÉ NO SE CUENTA EL RESULTADO DE `buscar()` ──────────────────
     *
     * Porque `buscar()` tiene tope, y contar el resultado de una consulta
     * acotada devuelve el tope disfrazado de cuenta. Es exactamente el fallo
     * que ya se arregló en los contadores de las dos pantallas: con 83 filas no
     * se nota, y con 600 el contador diría «500 de 600» sobre una búsqueda que
     * encontró 540.
     *
     * El `WHERE` es **el mismo objeto** que usa `buscar`, no una copia: dos
     * condiciones escritas aparte acabarían contando una cosa y enseñando otra.
     */
    async contarBusqueda(consulta: string) {
      const donde = condicionDeBusqueda(consulta);
      if (donde === null) return 0;

      const [fila] = await cliente
        .select({ n: sql<number>`count(*)::int` })
        .from(anime)
        .where(donde.condicion);

      return fila?.n ?? 0;
    },

    /** Un anime por id. `null` si no existe **o no es suyo** (indistinguible). */
    async obtener(animeId: string) {
      const [fila] = await cliente.select().from(anime).where(mio(animeId)).limit(1);
      return fila ?? null;
    },

    /** ¿Cuántos animes tiene? */
    async contar(): Promise<number> {
      const [fila] = await cliente
        .select({ n: sql<number>`count(*)::int` })
        .from(anime)
        .where(mias());
      return fila?.n ?? 0;
    },

    /**
     * ── UNA CONSULTA, NO SEIS ────────────────────────────────────────────
     *
     * `count(*) FILTER (WHERE …)` es SQL estándar y hace el favorito en la
     * misma pasada que el agrupado por estado. La alternativa —una consulta por
     * chip— serían seis idas y vueltas a Neon para pintar una barra.
     *
     * El `Record<Estado, number>` sale COMPLETO, con ceros incluidos: si mañana
     * se añade un sexto estado a `ESTADOS`, el objeto de abajo deja de compilar
     * y el chip nuevo no puede nacer con un recuento fantasma. Es la misma
     * razón por la que `contarPorEstado` de `validation/biblioteca.ts` tampoco
     * devuelve un `Partial`.
     */
    async recuentos() {
      // ── SE AGRUPA POR ESTADO **Y** POR FAVORITO ──────────────────────────
      //
      // Diez filas como mucho, y con ellas se puede responder CUALQUIER
      // recuento de la pantalla sin traerse ni una fila de anime: el total, los
      // favoritos, el recuento de cada chip, y —lo que faltaba— **cuántos
      // coinciden con el filtro puesto**.
      //
      // Ese último era el que se calculaba en JavaScript con `visibles.length`
      // sobre el resultado de `listar()`, que trae como mucho `LIMITE_LISTADO`
      // filas. Con 83 animes es correcto; con 600 la pantalla diría «500 de
      // 600» y el 500 sería el tope, no una cuenta. Un agregado sobre una
      // consulta acotada no es un agregado: es el tope disfrazado.
      const filas = await cliente
        .select({
          estado: anime.status,
          favorito: anime.isFavorite,
          n: sql<number>`count(*)::int`,
        })
        .from(anime)
        .where(mias())
        .groupBy(anime.status, anime.isFavorite);

      const porEstado: Record<Estado, number> = {
        VISTO: 0,
        VIENDO: 0,
        EN_ESPERA: 0,
        ABANDONADO: 0,
        PENDIENTE: 0,
      };

      let total = 0;
      let favoritos = 0;
      const matriz: CeldaDeRecuento[] = [];

      for (const fila of filas) {
        // `status` es `text` + CHECK en la base, así que Drizzle lo infiere como
        // `string`. Se estrecha contra la lista canónica en vez de castear: un
        // valor fuera del dominio se ignora en el recuento en lugar de reventar
        // al indexar el `Record`.
        if (esEstado(fila.estado)) {
          porEstado[fila.estado] += fila.n;
          matriz.push({ estado: fila.estado, favorito: fila.favorito, n: fila.n });
        }
        total += fila.n;
        if (fila.favorito) favoritos += fila.n;
      }

      return { porEstado, total, favoritos, matriz };
    },

    /**
     * ── POR QUÉ ESTO ES `sql` TIPADO Y NO UN OPERADOR DE DRIZZLE ──────────
     *
     * `similarity()` y el operador `%` son de `pg_trgm`, y Drizzle no los
     * modela. El helper `sql` con marcadores los expresa sin concatenar nada:
     * el título entra como **parámetro**, nunca interpolado. `sql.raw` con un
     * dato del usuario está prohibido por `security.md` §9, y aquí el título lo
     * escribe el usuario.
     *
     * ── EL `%` VA PRIMERO PARA QUE EL ÍNDICE SIRVA DE ALGO ────────────────
     *
     * `idx_anime_title_norm_trgm` es un GIN sobre `title_normalized`. El
     * operador `%` es el que lo usa; `similarity() > 0.55` a secas obligaría a
     * recorrer la tabla entera calculando la puntuación fila a fila. Se filtra
     * con `%` —que aplica el umbral de `pg_trgm`— y se vuelve a comprobar el
     * umbral explícitamente para no depender del `pg_trgm.similarity_threshold`
     * de la sesión, que es estado global y puede valer cualquier cosa.
     *
     * ── Y EL FILTRO DE PROPIEDAD SIGUE SIENDO EL DE SIEMPRE ───────────────
     *
     * `mias()` va en el `WHERE` como en toda consulta de este fichero. Sin él,
     * el aviso de duplicado sería un oráculo para averiguar qué tiene otra
     * gente en su vault: escribe un título, mira si te avisa.
     */
    async similares(tituloNormalizado: string, limite = LIMITE_SIMILARES) {
      // Un título vacío casa con demasiado y no significa nada: se corta antes
      // de ir a la base.
      if (tituloNormalizado.trim() === "") return [];

      return cliente
        .select({
          id: anime.id,
          titulo: anime.title,
          tituloNormalizado: anime.titleNormalized,
          anilistId: anime.anilistId,
          similitud: sql<number>`similarity(${anime.titleNormalized}, ${tituloNormalizado})::float8`,
        })
        .from(anime)
        .where(
          and(
            mias(),
            sql`${anime.titleNormalized} % ${tituloNormalizado}`,
            sql`similarity(${anime.titleNormalized}, ${tituloNormalizado}) > ${UMBRAL_SIMILITUD}`,
          ),
        )
        .orderBy(sql`similarity(${anime.titleNormalized}, ${tituloNormalizado}) desc`)
        .limit(limite);
    },

    /** Igualdad exacta de `title_normalized`: la comprobación que BLOQUEA. */
    async porTituloNormalizado(tituloNormalizado: string) {
      if (tituloNormalizado.trim() === "") return null;

      const [fila] = await cliente
        .select({ id: anime.id, titulo: anime.title })
        .from(anime)
        .where(and(mias(), eq(anime.titleNormalized, tituloNormalizado)))
        .limit(1);

      return fila ?? null;
    },

    /** El progreso de un anime propio. `null` si no hay o no es suyo. */
    async progresoDe(animeId: string) {
      const [fila] = await cliente
        .select({
          // `kind` es `text` + CHECK, así que Drizzle lo infiere `string`. Se
          // marca el tipo aquí igual que en `listar()`, que hace lo mismo.
          tipo: sql<TipoProgreso | null>`${progress.kind}`,
          etiqueta: progress.label,
          temporada: progress.season,
          episodio: progress.episode,
          porcentaje: progress.percent,
        })
        .from(progress)
        .innerJoin(anime, eq(anime.id, progress.animeId))
        .where(and(eq(progress.animeId, animeId), mias()))
        .limit(1);

      return fila ?? null;
    },

    /**
     * Dos títulos distintos con el mismo `anilist_id` son la misma obra: romaji
     * contra english contra sinónimo. La skill §2(b) lo trata como duplicado
     * exacto aunque el normalizado difiera.
     */
    async porAnilistId(anilistId: number) {
      const [fila] = await cliente
        .select({ id: anime.id, titulo: anime.title })
        .from(anime)
        .where(and(mias(), eq(anime.anilistId, anilistId)))
        .limit(1);

      return fila ?? null;
    },

    /** Los bytes de una portada. La ÚNICA consulta que los selecciona. */
    async portada(animeId: string, tamano: "full" | "thumb") {
      const [fila] = await cliente
        .select({
          bytes: tamano === "full" ? animeCover.bytes : animeCover.thumbBytes,
          mime: animeCover.mime,
          checksum: animeCover.checksum,
        })
        .from(animeCover)
        .innerJoin(anime, eq(anime.id, animeCover.animeId))
        .where(and(eq(animeCover.animeId, animeId), mias()))
        .limit(1);

      return fila ?? null;
    },

    /** El enlace de continuación más reciente. */
    async enlaceMasReciente(animeId: string) {
      const [fila] = await cliente
        .select({
          id: continueLink.id,
          url: continueLink.url,
          etiqueta: continueLink.label,
        })
        .from(continueLink)
        .innerJoin(anime, eq(anime.id, continueLink.animeId))
        .where(and(eq(continueLink.animeId, animeId), mias()))
        .orderBy(desc(continueLink.lastUsedAt))
        .limit(1);

      return fila ?? null;
    },

    // ─────────────────────────────────────────────────────────────────────
    // ESCRITURA
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Crea un anime. El `user_id` lo pone el vault, **no quien llama**: es
     * imposible crear un anime a nombre de otro.
     *
     * ── DEVUELVE `null` SI YA LO TENÍAS ───────────────────────────────────
     *
     * Antes NO lo hacía: chocaba con `uq_anime_user_title_norm` y **lanzaba**.
     * `api-conventions.md` dice, con todas las letras, que una violación de esa
     * restricción se traduce a `ANIME_DUPLICADO` y **nunca a un 500** — y aquí
     * era un 500. Lo destapó el seed al correrlo dos veces: la segunda vez
     * reventaba en el primer anime, con un volcado de SQL en pantalla.
     *
     * `onConflictDoNothing` sobre el índice único deja la decisión en la base,
     * que es quien de verdad la garantiza, y devuelve `null` para que quien
     * llama lo traduzca. Es lo que además hace **idempotente** al seed.
     */
    async crear(datos: DatosCrearAnime) {
      const [fila] = await cliente
        .insert(anime)
        .values({
          userId: ctx.userId,
          title: datos.titulo,
          titleNormalized: normalizarTitulo(datos.titulo),
          status: datos.estado,
          format: datos.formato ?? null,
          year: datos.anio ?? null,
          notes: datos.notas ?? null,
          isFavorite: datos.esFavorito ?? false,
          anilistId: datos.anilistId ?? null,
        })
        // La deduplicación EXACTA la garantiza la base, no una comprobación
        // previa: comprobar y luego insertar deja una ventana por la que caben
        // dos peticiones simultáneas del mismo título.
        .onConflictDoNothing({ target: [anime.userId, anime.titleNormalized] })
        .returning({ id: anime.id });

      return fila ?? null;
    },

    /**
     * Edita un anime propio. Devuelve `null` si no existe o no es suyo, en vez
     * de tocar cero filas en silencio.
     */
    /**
     * Los enlaces de un anime propio, el más usado recientemente primero.
     *
     * ── EL `NULLS LAST` NO ES UN ADORNO ──────────────────────────────────
     *
     * En Postgres, `ORDER BY x DESC` pone los `NULL` **primero**. Un enlace
     * recién pegado tiene `last_used_at` a `null` hasta que se abre, así que sin
     * esto se colocaría por delante del que se usó hace diez minutos — y como el
     * primero es la acción primaria de la card, la card ofrecería el enlace
     * equivocado. Solo se nota cuando hay dos.
     */
    async enlaces(animeId: string) {
      return cliente
        .select({
          id: continueLink.id,
          url: continueLink.url,
          etiqueta: continueLink.label,
          temporada: continueLink.season,
          episodio: continueLink.episode,
          ultimoUso: continueLink.lastUsedAt,
        })
        .from(continueLink)
        .innerJoin(anime, eq(anime.id, continueLink.animeId))
        .where(and(eq(continueLink.animeId, animeId), mias()))
        .orderBy(sql`${continueLink.lastUsedAt} desc nulls last`, desc(continueLink.createdAt));
    },

    /**
     * Añade un enlace a un anime propio.
     *
     * ── DOS SENTENCIAS, Y AQUÍ SÍ ES CORRECTO ────────────────────────────
     *
     * El resto de escrituras de este fichero meten la comprobación de propiedad
     * DENTRO del `WHERE`, porque comprobar-y-luego-escribir deja una ventana
     * entre las dos. Aquí no se puede: el `INSERT … SELECT` de Drizzle exige que
     * los campos seleccionados coincidan **uno a uno y en el mismo orden** con
     * la definición de la tabla, así que añadir una columna a `continue_link`
     * rompería esta consulta en runtime. Cambiar una ventana teórica por una
     * bomba de relojería no es un intercambio bueno.
     *
     * Lo que hace segura la versión de dos pasos es que **nada en la aplicación
     * cambia el `user_id` de un anime**: no hay método que lo haga, ni en el
     * vault ni fuera. La propiedad de una fila de `anime` se fija al crearla y
     * no se mueve, así que entre la lectura y la escritura no hay nada que pueda
     * cambiar la respuesta.
     *
     * **Si algún día existe «transferir un anime a otra cuenta», esto hay que
     * rehacerlo**, y esta nota es el aviso.
     *
     * La `FOREIGN KEY` cubre el otro caso: si el anime se borra entremedias, el
     * `INSERT` falla en vez de dejar un enlace huérfano.
     *
     * `last_used_at` nace `null`, no `now()`: un enlace pegado y nunca abierto
     * no es «lo último que vi». Ver el orden de `enlaces()`.
     */
    async guardarEnlace(animeId: string, datos: DatosEnlace) {
      const [propio] = await cliente
        .select({ id: anime.id })
        .from(anime)
        .where(mio(animeId))
        .limit(1);

      // `null` y no un throw: no existe y no es tuyo son indistinguibles desde
      // fuera, como en todo este fichero (`security.md` §1).
      if (propio === undefined) return null;

      const [fila] = await cliente
        .insert(continueLink)
        .values({
          animeId: propio.id,
          url: datos.url,
          label: datos.etiqueta ?? null,
          season: datos.temporada ?? null,
          episode: datos.episodio ?? null,
          siteId: datos.siteId ?? null,
        })
        .returning({ id: continueLink.id });

      return fila ?? null;
    },

    /** Marca un enlace propio como usado ahora, y devuelve su URL. */
    async marcarEnlaceUsado(enlaceId: string) {
      const [fila] = await cliente
        .update(continueLink)
        .set({ lastUsedAt: new Date() })
        .where(
          and(
            eq(continueLink.id, enlaceId),
            // La propiedad va por subconsulta porque `continue_link` no tiene
            // `user_id`: cuelga de `anime`, y ahí es donde vive el filtro.
            sql`exists (select 1 from ${anime} where ${anime.id} = ${continueLink.animeId} and ${mias()})`,
          ),
        )
        .returning({ url: continueLink.url });

      return fila ?? null;
    },

    async borrarEnlace(enlaceId: string) {
      const [fila] = await cliente
        .delete(continueLink)
        .where(
          and(
            eq(continueLink.id, enlaceId),
            sql`exists (select 1 from ${anime} where ${anime.id} = ${continueLink.animeId} and ${mias()})`,
          ),
        )
        .returning({ id: continueLink.id });

      return fila ?? null;
    },

    async editar(animeId: string, datos: DatosEditarAnime) {
      const cambios: Record<string, unknown> = { updatedAt: new Date() };

      if (datos.titulo !== undefined) {
        cambios.title = datos.titulo;
        // El normalizado se recalcula SIEMPRE que cambia el título: si se
        // desincroniza, la deduplicación deja de funcionar en silencio.
        cambios.titleNormalized = normalizarTitulo(datos.titulo);
      }
      if (datos.estado !== undefined) cambios.status = datos.estado;
      if (datos.formato !== undefined) cambios.format = datos.formato;
      if (datos.anio !== undefined) cambios.year = datos.anio;
      if (datos.notas !== undefined) cambios.notes = datos.notas;
      if (datos.esFavorito !== undefined) cambios.isFavorite = datos.esFavorito;
      // `anilistId` estaba en el TIPO de entrada y no se aplicaba: quien lo
      // pasara veía la llamada compilar, devolver el id y no cambiar nada. Un
      // campo que se acepta y se ignora es peor que uno que no existe, porque
      // no hay error que investigar. Y aquí, además, `anilist_id` es una de las
      // tres claves de deduplicación (skill de dominio §2b).
      if (datos.anilistId !== undefined) cambios.anilistId = datos.anilistId;

      const [fila] = await cliente
        .update(anime)
        .set(cambios)
        .where(mio(animeId))
        .returning({ id: anime.id });

      return fila ?? null;
    },

    /**
     * Guarda la portada de un anime propio.
     *
     * ── LA PROPIEDAD SE COMPRUEBA DENTRO DEL `INSERT` ──────────────────────
     * El `INSERT … SELECT … WHERE` inserta **solo si la subconsulta encuentra
     * el anime filtrado por usuario**. Si no es suyo, no inserta nada y no hay
     * fila devuelta: cero filas afectadas, cero información filtrada.
     *
     * Comprobar antes con un `SELECT` y después insertar sería lo mismo salvo
     * por la ventana entre las dos consultas — y las ventanas es lo que este
     * proyecto lleva todo el día cerrando.
     */
    async guardarPortada(animeId: string, datos: DatosPortada) {
      // ── LA PROPIEDAD SE COMPRUEBA DENTRO DEL `INSERT` ──────────────────────
      // El `SELECT` de la subconsulta lleva `mias()`, así que **solo inserta si
      // el anime es de este usuario**. Si no lo es, la subconsulta no devuelve
      // filas, no se inserta nada y el `RETURNING` viene vacío: cero filas
      // afectadas, cero información filtrada, y ni una ventana entre comprobar
      // y escribir.
      //
      // Va en SQL explícito y no con `insert().select()` de Drizzle porque ese
      // constructor exige que los campos seleccionados coincidan **en orden**
      // con la definición de la tabla, y eso convierte cualquier reordenación
      // futura del esquema en un fallo en runtime. Con los nombres escritos, el
      // orden da igual.
      const filas = await cliente.execute(sql`
        insert into anime_cover
          (anime_id, mime, bytes, thumb_bytes, width, height, size_bytes, source_url, checksum)
        select
          a.id,
          ${datos.mime},
          ${datos.bytes},
          ${datos.miniatura},
          ${datos.ancho},
          ${datos.alto},
          ${datos.bytes.byteLength},
          ${datos.urlOrigen ?? null},
          ${datos.checksum}
        from anime a
        where a.id = ${animeId} and a.user_id = ${ctx.userId}
        on conflict (anime_id) do update set
          mime        = excluded.mime,
          bytes       = excluded.bytes,
          thumb_bytes = excluded.thumb_bytes,
          width       = excluded.width,
          height      = excluded.height,
          size_bytes  = excluded.size_bytes,
          source_url  = excluded.source_url,
          checksum    = excluded.checksum
        returning anime_id
      `);

      const devueltas = (filas as unknown as { rows?: { anime_id?: string }[] }).rows ?? [];
      const id = devueltas[0]?.anime_id;

      return id === undefined ? null : { animeId: id };
    },

    /**
     * Guarda el progreso de un anime propio.
     *
     * Misma técnica que `guardarPortada`: la propiedad se comprueba DENTRO del
     * `INSERT`, con la subconsulta filtrada por usuario. Si el anime no es
     * suyo, no se inserta nada y no vuelve fila.
     */
    async guardarProgreso(animeId: string, datos: DatosProgreso) {
      const filas = await cliente.execute(sql`
        insert into progress (anime_id, kind, season, episode, percent, label, updated_at)
        select a.id, ${datos.kind}, ${datos.temporada ?? null}, ${datos.episodio ?? null},
               ${datos.porcentaje ?? null}, ${datos.label}, now()
        from anime a
        where a.id = ${animeId} and a.user_id = ${ctx.userId}
        on conflict (anime_id) do update set
          kind       = excluded.kind,
          season     = excluded.season,
          episode    = excluded.episode,
          percent    = excluded.percent,
          label      = excluded.label,
          updated_at = now()
        returning anime_id
      `);

      const devueltas = (filas as unknown as { rows?: { anime_id?: string }[] }).rows ?? [];
      const id = devueltas[0]?.anime_id;

      return id === undefined ? null : { animeId: id };
    },

    /** Borra un anime propio. La cascada se lleva portada, progreso y enlaces. */
    async borrar(animeId: string) {
      const [fila] = await cliente.delete(anime).where(mio(animeId)).returning({ id: anime.id });

      return fila ?? null;
    },
  };
}

/**
 * Ejecuta varias operaciones del vault en UNA transacción.
 *
 * ── POR QUÉ ES UNA FUNCIÓN APARTE Y NO UN MÉTODO DEL VAULT ─────────────────
 *
 * El driver HTTP de Neon **no soporta transacciones interactivas**: cada
 * consulta es una petición independiente. Si `transaccion()` fuera un método del
 * vault, se podría llamar sobre un vault construido con el cliente HTTP y fallar
 * en runtime.
 *
 * Al ser una función aparte que abre su propio cliente por WebSocket, **no hay
 * forma de pedir una transacción sobre un cliente que no las soporta**. Otra vez
 * lo mismo: la forma de la API impide el error en vez de advertir de él.
 *
 * El callback recibe **otro vault**, atado al mismo contexto y al cliente
 * transaccional: dentro de la transacción sigue siendo imposible consultar sin
 * filtro por usuario.
 *
 *     await enTransaccion(ctx, async (vault) => {
 *       const creado = await vault.crear({ titulo, estado: "PENDIENTE" });
 *       // …portada y progreso, todo o nada
 *     });
 */
export async function enTransaccion<T>(
  ctx: ContextoUsuario,
  trabajo: (vault: Vault) => Promise<T>,
): Promise<T> {
  // Misma comprobación que en `vaultDe`: esta es la otra puerta.
  if (!ContextoUsuario.esAutentico(ctx)) {
    throw new ErrorContextoFalsificado();
  }

  return conTransaccion(async (cliente) =>
    cliente.transaction(async (tx) => trabajo(vaultDe(ctx, tx))),
  );
}
