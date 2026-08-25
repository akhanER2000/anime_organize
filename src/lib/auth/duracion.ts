/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CUÁNTO DURA UNA SESIÓN — «Recordarme», decidido por el propietario.
 *
 * | Casilla | Duración | Por qué |
 * |---|---|---|
 * | **desmarcada** (por defecto) | **12 horas** | una sesión de trabajo |
 * | marcada | **30 días** | el ordenador de casa |
 *
 * La casilla viene **desmarcada**: la opción segura es la que no hay que elegir.
 *
 * ── LA CADUCIDAD ES ABSOLUTA, NO DESLIZANTE ────────────────────────────────
 *
 * Se cuenta desde el instante del `authorize`, no desde la última actividad.
 * Auth.js **vuelve a firmar el JWT en cada navegación**, así que una caducidad
 * relativa se renovaría sola: quien robara la cookie y siguiera navegando la
 * mantendría viva para siempre. Es el mismo mecanismo que ya destrozó una vez
 * la revocación de sesiones en este proyecto (ver el callback `jwt` de
 * `src/auth.ts`), y la respuesta es la misma: una marca propia, puesta al
 * autenticar, que sobrevive a los refirmados.
 *
 * Esa marca ya existe: `em`, en milisegundos. La caducidad es `em + duración`.
 *
 * ── POR QUÉ SE PUEDEN AJUSTAR POR ENTORNO ──────────────────────────────────
 *
 * Para poder **probarlas por el camino real**. Comprobar que una sesión de 12
 * horas muere a las 12 horas exige, o esperar 12 horas, o fabricar el token — y
 * fabricarlo es justo lo que `testing.md` prohíbe llamar verificación. Con las
 * duraciones ajustables, el test arranca el servidor con 2 segundos, inicia
 * sesión de verdad, espera 3, navega, y comprueba que ya no autentica.
 *
 * Acortar es seguro. Alargar es una decisión de configuración, y por eso hay un
 * TOPE: nada por encima de 90 días, mida lo que mida la variable. Una sesión
 * eterna por un cero de más en el panel de Vercel no es una opción.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const HORA = 3600;
const DIA = 24 * HORA;

/** 12 horas. Una jornada: si te dejas la sesión abierta, mañana ya no está. */
export const CORTA_POR_DEFECTO = 12 * HORA;

/** 30 días. */
export const LARGA_POR_DEFECTO = 30 * DIA;

/**
 * Nada dura más de 90 días, ponga lo que ponga el entorno.
 *
 * No protege de un atacante —quien edita las variables ya tiene el despliegue—:
 * protege de un cero de más al teclear, que es lo que de verdad pasa.
 */
const TOPE_SEGUNDOS = 90 * DIA;

/**
 * Lee una duración del entorno. **Falla ruidosamente**, nunca en silencio.
 *
 * Un valor inválido que cayera al valor por defecto sin avisar es exactamente
 * la clase de configuración que parece aplicada y no lo está.
 */
type Entorno = Readonly<Partial<Record<string, string>>>;

function segundosDelEntorno(clave: string, porDefecto: number, entorno: Entorno): number {
  const bruto = entorno[clave];
  if (bruto === undefined || bruto.trim() === "") return porDefecto;

  const n = Number(bruto);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(
      `${clave} = "${bruto}" no es un número entero de segundos mayor que cero. ` +
        "Déjala vacía para usar el valor por defecto.",
    );
  }

  if (n > TOPE_SEGUNDOS) {
    throw new Error(
      `${clave} = ${String(n)} s supera el tope de ${String(TOPE_SEGUNDOS)} s (90 días). ` +
        "Una sesión más larga que eso casi siempre es un cero de más.",
    );
  }

  return n;
}

/** Duración en SEGUNDOS según la elección del usuario. */
export function duracionDeSesionSegundos(
  recordarme: boolean,
  entorno: Entorno = process.env,
): number {
  return recordarme
    ? segundosDelEntorno("AUTH_SESION_LARGA_SEGUNDOS", LARGA_POR_DEFECTO, entorno)
    : segundosDelEntorno("AUTH_SESION_CORTA_SEGUNDOS", CORTA_POR_DEFECTO, entorno);
}

/**
 * ¿Ha caducado esta sesión?
 *
 * @param emitidoMs  la marca `em` del token, en milisegundos, puesta al autenticar
 * @param recordarme lo que eligió el usuario, guardado en el token
 *
 * Un token **sin marca de emisión** se considera caducado: no se puede fechar,
 * así que no se puede saber si está dentro de plazo. Ante la duda, fuera.
 */
export function sesionCaducada(parametros: {
  emitidoMs: number | undefined;
  recordarme: boolean;
  ahoraMs?: number;
  entorno?: Entorno;
}): boolean {
  const { emitidoMs, recordarme } = parametros;
  if (emitidoMs === undefined || !Number.isFinite(emitidoMs)) return true;

  const ahora = parametros.ahoraMs ?? Date.now();
  const duracionMs = duracionDeSesionSegundos(recordarme, parametros.entorno) * 1000;

  return ahora >= emitidoMs + duracionMs;
}

/**
 * Segundos que le quedan de vida al token, para el `exp` del JWT.
 *
 * Nunca menos de 1: `jwt.encode` con un `maxAge` de 0 o negativo produciría un
 * token ya caducado en el mismo momento de emitirlo, y eso echaría al usuario
 * justo después de que acertara la contraseña.
 */
export function segundosRestantes(parametros: {
  emitidoMs: number | undefined;
  recordarme: boolean;
  ahoraMs?: number;
  entorno?: Entorno;
}): number {
  const { emitidoMs, recordarme } = parametros;
  const duracion = duracionDeSesionSegundos(recordarme, parametros.entorno);

  if (emitidoMs === undefined || !Number.isFinite(emitidoMs)) return duracion;

  const ahora = parametros.ahoraMs ?? Date.now();
  const restan = Math.ceil((emitidoMs + duracion * 1000 - ahora) / 1000);

  return Math.max(1, restan);
}
