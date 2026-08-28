import "server-only";

import { peticionFijada, validarDestino } from "./peticion-segura";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «COMPROBAR ESPEJOS» — encargo §8, y `api-conventions.md` § «Peticiones
 * salientes: `fetch`, nunca un comando de shell».
 *
 * ── ESTO ES UN SSRF SI NO SE MIRA, Y NADIE LO LLAMA ASÍ ──────────────────
 *
 * El pipeline de portadas lleva desde el principio un cartel que dice «el punto
 * más peligroso de la app». Éste no lo lleva, y hace **exactamente lo mismo**:
 * coge una dirección que escribió el usuario y la pide desde el servidor.
 *
 * Peor, en un sentido: la portada al menos exige que la respuesta sea una imagen
 * válida. Aquí el resultado útil para un atacante **es el propio hecho de que
 * respondiera**. Se añade un espejo apuntando a `http://169.254.169.254/` —el
 * metadata de la nube— se pulsa «comprobar», y la pantalla dice si contestó. No
 * hace falta leer el cuerpo: el botón ya es un escáner de la red interna.
 *
 * Por eso pasa por `validarDestino`, que es **el mismo código** que protege las
 * portadas. No una copia.
 *
 * ── `HEAD`, `redirect: manual`, Y POR QUÉ UN 302 NO ES UN ESPEJO VIVO ────
 *
 * `api-conventions.md` lo fija: «`redirect: "manual"` — un 302 a un
 * interstitial no es un espejo vivo». Los dominios de estos sitios caducan y se
 * revenden; cuando eso pasa, el nuevo dueño suele poner una redirección a una
 * página de aparcamiento que responde 200 tan contenta. Seguir el salto diría
 * «vivo» sobre un dominio que ya no es de quien era, que es el caso que más
 * daño hace.
 *
 * Así que **no se siguen redirecciones**: un 3xx se anota como caído. Es más
 * estricto de lo necesario para un sitio que legítimamente redirige de `http` a
 * `https`, y esa es la parte que el usuario corrige poniendo la URL buena —lo
 * cual, además, es información útil que hoy no tendría.
 *
 * ── UN FALLO DE RED NO ES «CAÍDO PARA SIEMPRE» ───────────────────────────
 *
 * Se devuelve `vivo: false` y quien llama lo anota, pero **nunca se borra el
 * espejo** (skill §8). Un timeout de hoy puede ser un 200 mañana.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** 5 s. `api-conventions.md`: «timeout corto». */
const TIMEOUT_MS = 5_000;

/**
 * Concurrencia 4.
 *
 * Los espejos de un mismo sitio **suelen compartir CDN y caer a la vez**, así
 * que lanzarlos todos de golpe no acelera nada y multiplica el ruido contra un
 * tercero. Cuatro es el mismo número que usa el seed para las portadas de Drive.
 */
export const A_LA_VEZ = 4;

export type ResultadoEspejo = {
  readonly id: string;
  readonly vivo: boolean;
  /** Para el log del servidor. **No se enseña al usuario.** */
  readonly detalle: string;
};

/** Comprueba UN espejo. Nunca lanza: un fallo de red es un resultado. */
export async function comprobarEspejo(
  espejo: { readonly id: string; readonly url: string },
  opciones: { readonly permitirLoopbackParaPruebas?: boolean } = {},
): Promise<ResultadoEspejo> {
  const destino = await validarDestino(espejo.url, opciones.permitirLoopbackParaPruebas === true);

  if (!destino.ok) {
    // Un destino interno no es «caído»: es una dirección que este servidor no
    // va a pedir nunca. Se marca inactivo igual, porque tampoco le sirve al
    // usuario, y el motivo queda en el log.
    return { id: espejo.id, vivo: false, detalle: `destino rechazado: ${destino.motivo}` };
  }

  try {
    const respuesta = await peticionFijada(destino, {
      metodo: "HEAD",
      cabeceras: {
        // Se identifica. Un comprobador anónimo que golpea trece dominios es
        // indistinguible de un escáner, y el operador del sitio merece saber
        // quién llama.
        "user-agent": "AnimeVault/1.0 (comprobador de espejos)",
        accept: "*/*",
      },
      // `HEAD` no trae cuerpo, pero un servidor mal hecho puede mandarlo igual.
      // El tope lo corta en vez de tragárselo.
      maximoBytes: 0,
      timeoutMs: TIMEOUT_MS,
    });

    const vivo = respuesta.estado >= 200 && respuesta.estado < 300;
    return {
      id: espejo.id,
      vivo,
      detalle: vivo
        ? `HTTP ${String(respuesta.estado)}`
        : `HTTP ${String(respuesta.estado)} · no vivo`,
    };
  } catch {
    // Timeout, conexión rechazada, TLS roto… todo lo mismo de cara afuera.
    return { id: espejo.id, vivo: false, detalle: "sin respuesta" };
  }
}

/**
 * Comprueba una lista, con la concurrencia acotada.
 *
 * Se procesa por tandas en vez de con `Promise.all` sobre todo: con cien
 * espejos, `Promise.all` abriría cien sockets a la vez contra terceros, que es
 * indistinguible de un ataque por parte de quien lo recibe.
 */
export async function comprobarEspejos(
  espejos: readonly { readonly id: string; readonly url: string }[],
  opciones: { readonly permitirLoopbackParaPruebas?: boolean; readonly aLaVez?: number } = {},
): Promise<ResultadoEspejo[]> {
  const tamano = opciones.aLaVez ?? A_LA_VEZ;
  const resultados: ResultadoEspejo[] = [];

  for (let i = 0; i < espejos.length; i += tamano) {
    const tanda = espejos.slice(i, i + tamano);
    resultados.push(
      ...(await Promise.all(
        tanda.map((espejo) =>
          comprobarEspejo(
            espejo,
            opciones.permitirLoopbackParaPruebas === true
              ? { permitirLoopbackParaPruebas: true }
              : {},
          ),
        ),
      )),
    );
  }

  return resultados;
}
