import { TIPOS_PROGRESO, type TipoProgreso } from "./enums";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LAS DECISIONES DEL ALTA DE UN ANIME, SIN BASE DE DATOS.
 *
 * ── POR QUÉ ESTO VIVE EN `domain/` ────────────────────────────────────────
 *
 * Porque son reglas, no consultas. La Server Action hace las tres preguntas a
 * la base —¿existe el título normalizado?, ¿existe ese `anilist_id`?, ¿hay
 * parecidos?— y trae tres respuestas; **qué hacer con ellas** es lo de aquí, y
 * se puede probar con una tabla de casos en vez de con Postgres.
 *
 * La separación no es estética: la regla que más importa —«la similitud
 * PREGUNTA, nunca bloquea»— es una decisión, y enterrarla dentro de una función
 * que además consulta la base significa que para probarla hace falta sembrar
 * datos. Se probaría poco, y es la que más caro sale equivocar.
 *
 * ── LA REGLA QUE NO SE ROMPE ──────────────────────────────────────────────
 *
 * Skill de dominio §2: **bloquear por similitud tiraría animes legítimos del
 * usuario**. `Higurashi no Naku Koro ni` y `Higurashi no Naku Koro ni (2020)`
 * superan 0.55 y **son dos series distintas que el dueño tiene a propósito**.
 * Lo mismo con `White Album` y `White Album 2`.
 *
 * Por eso hay tres desenlaces y no dos: bloquear, preguntar y seguir. El del
 * medio es el que existe para no perder datos.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Lo que la base sabe decir sobre un título antes de crearlo. */
export type Hallazgos = {
  /** El anime con el MISMO `title_normalized`, si lo hay. */
  readonly exacto: { readonly id: string; readonly titulo: string } | null;
  /** El anime con el mismo `anilist_id`, si se dio uno y ya está. */
  readonly porAnilist: { readonly id: string; readonly titulo: string } | null;
  /** Hasta tres parecidos por trigram, sin incluir el exacto. */
  readonly similares: readonly { readonly id: string; readonly titulo: string }[];
};

export type Veredicto =
  /** Ya lo tienes. No se inserta. `api-conventions.md`: 409 `ANIME_DUPLICADO`. */
  | {
      readonly clase: "BLOQUEADO";
      readonly motivo: "TITULO" | "ANILIST";
      readonly existente: { readonly id: string; readonly titulo: string };
    }
  /** Puede que ya lo tengas. **200 con `ok: true`**: es una pregunta, no un fallo. */
  | {
      readonly clase: "PREGUNTA";
      readonly candidatos: readonly { readonly id: string; readonly titulo: string }[];
    }
  | { readonly clase: "ADELANTE" };

/**
 * Decide qué hacer con lo que devolvió la base.
 *
 * `forzar` es lo que pulsa «Añadir igualmente»: salta la PREGUNTA y **nunca** el
 * bloqueo. Un duplicado exacto no se puede forzar desde la interfaz porque el
 * `UNIQUE (user_id, title_normalized)` lo rechazaría de todas formas, y ofrecer
 * un botón que no puede funcionar es peor que no ofrecerlo.
 */
export function decidirAlta(hallazgos: Hallazgos, forzar = false): Veredicto {
  // El orden importa: el exacto manda sobre el de AniList, porque es el que la
  // base va a rechazar con su restricción y el que produce el mensaje útil
  // («ya tienes este anime», con enlace a la ficha que ya existe).
  if (hallazgos.exacto !== null) {
    return { clase: "BLOQUEADO", motivo: "TITULO", existente: hallazgos.exacto };
  }

  if (hallazgos.porAnilist !== null) {
    return { clase: "BLOQUEADO", motivo: "ANILIST", existente: hallazgos.porAnilist };
  }

  if (!forzar && hallazgos.similares.length > 0) {
    return { clase: "PREGUNTA", candidatos: hallazgos.similares };
  }

  return { clase: "ADELANTE" };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS PROCESOS POR LOTES NO PREGUNTAN.
 *
 * Skill de dominio §2, con todas las letras: «el seed y la importación bloquean
 * SOLO por (a) y (b). Nunca por similitud: si el seed descartara por trigram,
 * tiraría los tres *Higurashi* legítimos».
 *
 * No hay un humano detrás de una importación de 400 filas para responder 400
 * preguntas, así que la única alternativa a esto sería descartar en silencio —
 * que es exactamente perder datos del usuario sin decírselo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function decidirAltaEnLote(hallazgos: Hallazgos): Veredicto {
  return decidirAlta({ ...hallazgos, similares: [] }, true);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL PROGRESO QUE ESCRIBE UNA PERSONA, TRADUCIDO A LA TABLA.
 *
 * Skill §4: `label` **siempre** se rellena, porque es lo que pinta la interfaz,
 * y sale tal cual de lo que escribió el usuario. Los demás campos son los que
 * permiten calcular la barra.
 *
 * ── EL CASO QUE SE ESCRIBE MAL SIEMPRE ────────────────────────────────────
 *
 * «+1 episodio» sobre un anime **sin temporada**. Si no se pone `temporada: 1`,
 * queda un progreso de tipo `EPISODIO` con `season` a null, y la barra no puede
 * calcular nada: pasa a indeterminada justo cuando el usuario acaba de decir
 * exactamente por dónde va. La skill lo fija: «si no había temporada,
 * `season = 1`».
 * ═══════════════════════════════════════════════════════════════════════════
 */
export type ProgresoActual = {
  readonly tipo: TipoProgreso | null;
  readonly temporada: number | null;
  readonly episodio: number | null;
  readonly porcentaje: number | null;
};

export type ProgresoParaGuardar = {
  readonly kind: TipoProgreso;
  readonly label: string;
  readonly temporada: number | null;
  readonly episodio: number | null;
  readonly porcentaje: number | null;
};

/** «+1 episodio» — skill §4. */
export function sumarEpisodio(actual: ProgresoActual): ProgresoParaGuardar {
  const temporada = actual.temporada ?? 1;
  const episodio = (actual.episodio ?? 0) + 1;

  return {
    kind: "EPISODIO",
    label: `Temporada ${String(temporada)} · episodio ${String(episodio)}`,
    temporada,
    episodio,
    porcentaje: null,
  };
}

/** «Marcar temporada completa» — skill §4. */
export function completarTemporada(actual: ProgresoActual): ProgresoParaGuardar {
  const temporada = actual.temporada ?? 1;

  return {
    kind: "TEMPORADA",
    label: temporada === 1 ? "Solo 1ra temporada" : `Hasta la temporada ${String(temporada)}`,
    temporada,
    episodio: null,
    porcentaje: null,
  };
}

/** «Marcar todo visto» — skill §4. Cambia también el estado, y eso lo hace quien llama. */
export function marcarCompleto(): ProgresoParaGuardar {
  return {
    kind: "COMPLETO",
    label: "Completo (Todo Visto)",
    temporada: null,
    episodio: null,
    porcentaje: null,
  };
}

/**
 * Progreso libre: lo que la persona escriba.
 *
 * Un porcentaje se guarda como `PORCENTAJE` y una etiqueta suelta como
 * `CUSTOM`. La diferencia es si la barra puede rellenarse o queda
 * indeterminada, y por eso no se adivina: se pregunta con dos controles.
 */
export function progresoLibre(etiqueta: string, porcentaje: number | null): ProgresoParaGuardar {
  const limpia = etiqueta.trim();

  if (porcentaje === null) {
    return {
      kind: "CUSTOM",
      // Una etiqueta vacía dejaría la ficha con un hueco donde debería haber
      // una frase. «En proceso» es lo que ya usa el seed para esos diez.
      label: limpia === "" ? "En proceso" : limpia,
      temporada: null,
      episodio: null,
      porcentaje: null,
    };
  }

  const acotado = Math.min(100, Math.max(0, Math.round(porcentaje)));

  return {
    kind: "PORCENTAJE",
    label: limpia === "" ? `${String(acotado)} %` : limpia,
    temporada: null,
    episodio: null,
    porcentaje: acotado,
  };
}

/** Guarda para quien construya un `TipoProgreso` desde texto externo. */
export function esTipoProgreso(valor: unknown): valor is TipoProgreso {
  return typeof valor === "string" && (TIPOS_PROGRESO as readonly string[]).includes(valor);
}
