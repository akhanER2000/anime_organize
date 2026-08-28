import "server-only";

import { titulosDeBusqueda } from "@/lib/domain/busqueda-anilist";

import { analizarConClaude, consultarAniList, hayClaveDeIa } from "./consultas";

import type { Enriquecimiento } from "@/lib/db/enriquecimiento";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS DOS PASOS, EN ORDEN, Y QUÉ PASA CUANDO UNO FALLA.
 *
 * ── EL PASO 2 DEPENDE DEL 1, PERO EL 1 NO DEPENDE DEL 2 ─────────────────
 *
 * AniList trae la sinopsis, y la sinopsis es lo que se le da a Claude. Sin
 * ella el análisis sería sobre el título a secas, que es adivinar.
 *
 * Al revés no: si Claude falla —o no está configurado—, **lo de AniList ya está
 * guardado y sigue valiendo**. Por eso se guarda al terminar cada paso y no al
 * final de los dos: un fallo en el segundo no puede tirar el trabajo del
 * primero.
 *
 * ── SIN CLAVE NO ES UN ERROR ─────────────────────────────────────────────
 *
 * Skill §6: se salta con un aviso. Se registra un `ai_job` en estado `OMITIDO`
 * —ni OK ni ERROR— para que el dueño pueda ver, meses después, que aquel día no
 * había clave; sin ese registro, «mi ficha no tiene etiquetas» no tendría
 * explicación en ninguna parte.
 *
 * ── IDEMPOTENTE ──────────────────────────────────────────────────────────
 *
 * `api-conventions.md`: un anime ya enriquecido no se vuelve a consultar salvo
 * `{ reanalizar: true }`. Se decide por `anilist_id`, que es el efecto del paso
 * 1: si está, ya pasó por aquí.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type ResultadoEnriquecer = {
  readonly animeId: string;
  readonly titulo: string;
  /** Qué pasó en cada paso, para poder contarlo sin adivinar. */
  readonly anilist: "OK" | "SIN_RESULTADO" | "ERROR" | "OMITIDO";
  readonly ia: "OK" | "NO_CONFIGURADA" | "ERROR" | "OMITIDO";
  readonly detalle: string | null;
  /** Cuánto conviene esperar antes del siguiente, si el proveedor lo pidió. */
  readonly esperarSegundos: number;
};

export type OpcionesEnriquecer = {
  readonly reanalizar?: boolean;
  /** Salta el paso 2 aunque haya clave. Para el modo «sólo metadatos». */
  readonly sinIa?: boolean;
};

/**
 * Busca por id si lo hay; si no, prueba las formas de preguntar POR ORDEN.
 *
 * Para en el primer resultado. Sólo se gasta un intento más cuando el anterior
 * devolvió «no hay nada» — un error de red o un 429 **no** se reintentan aquí:
 * eso lo decide quien orquesta el lote, que es quien sabe cuánto esperar.
 */
async function buscarConReintentos(
  anilistId: number | null,
  titulo: string,
  opciones: OpcionesEnriquecer,
): Promise<Awaited<ReturnType<typeof consultarAniList>>> {
  if (anilistId !== null && opciones.reanalizar === true) {
    return consultarAniList({ anilistId });
  }

  let ultimo = await consultarAniList({ busqueda: titulo });
  if (ultimo.ok) return ultimo;

  for (const intento of titulosDeBusqueda(titulo).slice(1)) {
    if (!ultimo.ok && ultimo.motivo !== "SIN_RESULTADO") return ultimo;
    ultimo = await consultarAniList({ busqueda: intento });
    if (ultimo.ok) return ultimo;
  }

  return ultimo;
}

export async function enriquecerUno(
  datos: Enriquecimiento,
  animeId: string,
  opciones: OpcionesEnriquecer = {},
): Promise<ResultadoEnriquecer | null> {
  const anime = await datos.uno(animeId);
  if (anime === null) return null;

  const base = { animeId, titulo: anime.titulo };

  // ── PASO 1 ────────────────────────────────────────────────────────────
  if (anime.anilistId !== null && opciones.reanalizar !== true) {
    // Ya enriquecido. No se consulta y no se registra un trabajo: un `ai_job`
    // por cada vez que alguien abre una ficha llenaría la tabla de ruido.
    return { ...base, anilist: "OMITIDO", ia: "OMITIDO", detalle: null, esperarSegundos: 0 };
  }

  const deAniList = await buscarConReintentos(anime.anilistId, anime.titulo, opciones);

  if (!deAniList.ok) {
    await datos.registrar({
      animeId,
      proveedor: "ANILIST",
      estado: deAniList.motivo === "SIN_RESULTADO" ? "OMITIDO" : "ERROR",
      error: deAniList.motivo,
    });

    return {
      ...base,
      anilist: deAniList.motivo === "SIN_RESULTADO" ? "SIN_RESULTADO" : "ERROR",
      // Sin sinopsis no hay paso 2 que valga la pena: analizar un título suelto
      // es pedirle al modelo que se lo invente.
      ia: "OMITIDO",
      detalle: deAniList.motivo,
      esperarSegundos: deAniList.esperarSegundos ?? 0,
    };
  }

  await datos.guardarDeAniList(animeId, deAniList.datos);
  await datos.registrar({
    animeId,
    proveedor: "ANILIST",
    estado: "OK",
    resultado: { anilistId: deAniList.datos.anilistId, generos: deAniList.datos.generos.length },
  });

  // ── PASO 2 ────────────────────────────────────────────────────────────
  if (opciones.sinIa === true) {
    return { ...base, anilist: "OK", ia: "OMITIDO", detalle: null, esperarSegundos: 0 };
  }

  if (!hayClaveDeIa()) {
    await datos.registrar({
      animeId,
      proveedor: "ANTHROPIC",
      estado: "OMITIDO",
      error: "ANTHROPIC_API_KEY sin configurar",
    });
    return { ...base, anilist: "OK", ia: "NO_CONFIGURADA", detalle: null, esperarSegundos: 0 };
  }

  const deClaude = await analizarConClaude({
    titulo: anime.titulo,
    sinopsis: deAniList.datos.sinopsis ?? anime.sinopsis,
    generos: deAniList.datos.generos,
  });

  if (!deClaude.ok) {
    const detalle = deClaude.motivo === "NO_CONFIGURADA" ? "sin clave" : deClaude.detalle;
    await datos.registrar({ animeId, proveedor: "ANTHROPIC", estado: "ERROR", error: detalle });
    return { ...base, anilist: "OK", ia: "ERROR", detalle, esperarSegundos: 0 };
  }

  await datos.guardarDeClaude(animeId, deClaude.datos);
  await datos.registrar({
    animeId,
    proveedor: "ANTHROPIC",
    estado: "OK",
    tokensEntrada: deClaude.tokensEntrada,
    tokensSalida: deClaude.tokensSalida,
    resultado: {
      tono: deClaude.datos.tono,
      publico: deClaude.datos.publico,
      resumen: deClaude.datos.resumenCorto,
      advertencias: deClaude.datos.advertencias,
    },
  });

  return { ...base, anilist: "OK", ia: "OK", detalle: null, esperarSegundos: 0 };
}

/**
 * El límite de AniList: 90 peticiones por minuto.
 *
 * `api-conventions.md` fija **concurrencia 3** y backoff exponencial con
 * jitter. Tres a la vez con ~300 ms de ida y vuelta se queda holgadamente por
 * debajo, y lo que de verdad protege es respetar el `Retry-After` cuando llega
 * un 429: ignorarlo y reintentar rápido es lo que convierte un corte de un
 * minuto en un bloqueo largo.
 */
export const A_LA_VEZ = 3;

/** El jitter evita que los 3 hilos reintenten a la vez y vuelvan a chocar. */
function esperaConJitter(intento: number, base: number): number {
  const exponencial = base * 2 ** intento;
  return Math.round(exponencial * (0.5 + Math.random() * 0.5));
}

async function dormir(ms: number): Promise<void> {
  await new Promise((listo) => setTimeout(listo, ms));
}

export type ProgresoLote = {
  readonly hechos: number;
  readonly total: number;
  readonly actual: string;
};

/**
 * Enriquece una lista con la concurrencia acotada.
 *
 * Un fallo de uno **no tumba el lote**, igual que un fallo de portada no tumba
 * el seed: cada anime lleva su resultado y el resumen se cuenta al final.
 */
export async function enriquecerLote(
  datos: Enriquecimiento,
  ids: readonly string[],
  opciones: OpcionesEnriquecer & { readonly alAvanzar?: (p: ProgresoLote) => void } = {},
): Promise<ResultadoEnriquecer[]> {
  const resultados: ResultadoEnriquecer[] = [];
  const cola = [...ids];
  let hechos = 0;

  const trabajador = async (): Promise<void> => {
    for (;;) {
      const id = cola.shift();
      if (id === undefined) return;

      let intento = 0;
      for (;;) {
        const r = await enriquecerUno(datos, id, opciones);
        if (r === null) break;

        // Sólo se reintenta el corte del proveedor, y como mucho tres veces.
        // Reintentar un «no encontrado» sería pedir lo mismo esperando otra
        // respuesta.
        if (r.esperarSegundos > 0 && intento < 3) {
          await dormir(Math.max(r.esperarSegundos * 1000, esperaConJitter(intento, 1000)));
          intento += 1;
          continue;
        }

        resultados.push(r);
        hechos += 1;
        opciones.alAvanzar?.({ hechos, total: ids.length, actual: r.titulo });
        break;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, ids.length) }, trabajador));

  return resultados;
}
