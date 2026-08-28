import type { AnimeEnListado } from "@/lib/db";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL EXPORT EN JSON — lo irrecuperable, y nada más.
 *
 * ── QUÉ DEJA FUERA, Y POR QUÉ SE DICE EN EL PROPIO FICHERO ────────────────
 *
 * **Las portadas no van.** Solo su `checksum` y de dónde vinieron.
 *
 * Y está medido, no estimado: las 83 portadas del vault ocupan **3,05 MB** en
 * binario. En JSON hay que codificarlas en base64, que crece un 33 %: 4,06 MB.
 * El presupuesto de payload de una Server Action en Vercel es de 1 MB por
 * defecto, así que el export con portadas sería el **349 %** de lo que cabe —
 * y fallaría con un error de plataforma, no con un mensaje.
 *
 * Lo importante es que **lo que se deja fuera es lo recuperable**: una portada
 * se vuelve a poner pegando una URL. Lo que no se recupera de ninguna manera
 * son las notas, el progreso con la etiqueta que escribió el usuario, y los
 * enlaces exactos a los capítulos. Eso va entero.
 *
 * El fichero lo dice de sí mismo, en `_leeme`. Un export que calla lo que no
 * lleva es peor que uno incompleto: quien lo guarda cree tenerlo todo.
 *
 * ── LA VERSIÓN NO ES DECORATIVA ───────────────────────────────────────────
 *
 * Un fichero de export sobrevive a la aplicación que lo generó. Sin un número
 * de versión, el importador de dentro de dos años tendría que adivinar la forma
 * mirando las claves — que es exactamente cómo se corrompen los datos que
 * alguien guardó para estar tranquilo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Sube cuando la FORMA cambie de manera que un importador viejo se rompa. */
export const VERSION_EXPORT = 1;

export type AnimeExportado = {
  readonly titulo: string;
  readonly estado: string;
  readonly esFavorito: boolean;
  readonly anio: number | null;
  readonly notas: string | null;
  readonly progreso: {
    readonly etiqueta: string | null;
    readonly tipo: string | null;
    readonly temporada: number | null;
    readonly episodio: number | null;
    readonly porcentaje: number | null;
  } | null;
  readonly enlaces: readonly {
    readonly url: string;
    readonly etiqueta: string | null;
    readonly ultimoUso: string | null;
  }[];
  readonly portada: {
    /** Para reconocer la MISMA imagen si se vuelve a subir. Los bytes no van. */
    readonly checksum: string;
    readonly urlOrigen: string | null;
  } | null;
  readonly actualizadoEn: string;
};

export type Export = {
  readonly _leeme: string;
  readonly version: number;
  readonly generadoEn: string;
  readonly cuenta: { readonly email: string };
  readonly animes: readonly AnimeExportado[];
};

/** Lo que hace falta de cada anime para exportarlo. */
export type FilaParaExportar = AnimeEnListado & {
  readonly notas: string | null;
  readonly urlOrigenPortada: string | null;
  readonly enlaces: readonly {
    readonly url: string;
    readonly etiqueta: string | null;
    readonly ultimoUso: Date | null;
  }[];
};

const LEEME = [
  "Export de Anime Vault.",
  "LLEVA: títulos, estados, favoritos, años, notas, progreso con la etiqueta original y los enlaces para continuar.",
  "NO LLEVA los bytes de las portadas, solo su checksum y su dirección de origen:",
  "las 83 del vault ocupan 3,05 MB, y en base64 serían 4,06 MB — el 349 % de lo que cabe en una respuesta.",
  "Una portada se recupera pegando su dirección; unas notas y unos enlaces, no.",
].join(" ");

/**
 * Compone el fichero.
 *
 * Es una función pura: recibe filas y devuelve el objeto. Ni consulta, ni
 * serializa, ni descarga — así se puede probar con una tabla de casos en vez de
 * con una base y un navegador.
 */
export function componerExport(datos: {
  readonly email: string;
  readonly animes: readonly FilaParaExportar[];
  /** Se pasa para que el fichero sea reproducible en un test. */
  readonly ahora: Date;
}): Export {
  return {
    _leeme: LEEME,
    version: VERSION_EXPORT,
    generadoEn: datos.ahora.toISOString(),
    cuenta: { email: datos.email },
    animes: datos.animes.map((fila) => ({
      titulo: fila.titulo,
      estado: fila.estado,
      esFavorito: fila.esFavorito,
      anio: fila.anio,
      notas: fila.notas,
      progreso:
        fila.progresoEtiqueta === null && fila.progresoTipo === null
          ? null
          : {
              // La etiqueta ORIGINAL, la que escribió el usuario. Reescribirla
              // aquí perdería justo lo que el export existe para conservar.
              etiqueta: fila.progresoEtiqueta,
              tipo: fila.progresoTipo,
              temporada: fila.progresoTemporada,
              episodio: fila.progresoEpisodio,
              porcentaje: fila.progresoPorcentaje,
            },
      enlaces: fila.enlaces.map((enlace) => ({
        url: enlace.url,
        etiqueta: enlace.etiqueta,
        ultimoUso: enlace.ultimoUso?.toISOString() ?? null,
      })),
      portada:
        fila.checksumPortada === null
          ? null
          : { checksum: fila.checksumPortada, urlOrigen: fila.urlOrigenPortada },
      actualizadoEn: fila.actualizadoEn.toISOString(),
    })),
  };
}

/**
 * El nombre del fichero que se descarga.
 *
 * Lleva la fecha porque quien exporta dos veces quiere poder distinguirlos, y
 * `anime-vault.json` a secas se sobrescribe en la carpeta de descargas sin
 * avisar. `YYYY-MM-DD` y no el formato local: ordena solo.
 */
export function nombreDeFichero(ahora: Date): string {
  return `anime-vault-${ahora.toISOString().slice(0, 10)}.json`;
}
