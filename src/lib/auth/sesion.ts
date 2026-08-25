/**
 * Validez de una sesión JWT contra el estado real del usuario.
 *
 * EL PROBLEMA QUE RESUELVE: un JWT es válido hasta que expira. El servidor no
 * guarda nada, así que **no puede revocarlo**. Sin esta comprobación:
 *
 *   · borro mi cuenta → mi token me sigue autenticando durante días,
 *     contra un `user_id` que ya no existe;
 *   · me roban la sesión y cambio la contraseña → el token robado sigue valiendo,
 *     que es justo lo contrario de lo que el usuario cree que ha hecho.
 *
 * LA SOLUCIÓN: en el callback de sesión se comprueba contra la base que
 *   (a) el usuario existe,
 *   (b) `deleted_at` es NULL,
 *   (c) el token se emitió DESPUÉS de `users.sessions_valid_from`.
 *
 * Módulo PURO: la decisión se separa de la consulta para poder testear las tres
 * condiciones sin base de datos.
 *
 * COSTE: la comprobación está ACOTADA. Hacerla en cada petición autenticada
 * —incluida cada navegación RSC— sería una consulta por render para detectar un
 * evento que ocurre casi nunca. Ver `hayQueComprobarContraLaBase` al final:
 *
 *   · LECTURA  → como mucho una consulta cada 60 s. Ventana máxima de 60 s para
 *                que una lectura se entere de una revocación.
 *   · MUTACIÓN → SIEMPRE consulta. Ventana CERO. Es donde una sesión revocada
 *                haría daño de verdad.
 *
 * Medido en `coste-sesion.test.ts`: 10 consultas donde antes había 65, en una
 * sesión de 5 minutos.
 */

/** Lo que la base dice del usuario del token. `null` = no existe. */
export type EstadoCuenta = {
  deletedAt: Date | null;
  sessionsValidFrom: Date;
} | null;

export type MotivoSesionInvalida =
  "USUARIO_NO_EXISTE" | "CUENTA_DESACTIVADA" | "SESION_REVOCADA" | "TOKEN_SIN_IAT";

export type VeredictoSesion = { valida: true } | { valida: false; motivo: MotivoSesionInvalida };

/**
 * ¿Sigue siendo válida esta sesión?
 *
 * @param cuenta  estado en la base, o `null` si el usuario ya no existe
 * @param emitidoMs  marca de emisión del token, en MILISEGUNDOS.
 *
 * **No es el `iat` del JWT.** `iat` va en segundos enteros por el estándar, y
 * esa truncación era la causa de dos fallos distintos (ver abajo). Como esta
 * marca la escribimos nosotros en un claim propio (`em`), va en milisegundos y
 * el problema deja de existir en vez de acotarse.
 */
export function evaluarSesion(
  cuenta: EstadoCuenta,
  emitidoMs: number | undefined,
): VeredictoSesion {
  // El usuario borró su cuenta: el `user_id` del token no apunta a nada. Este es
  // el caso que hace que borrar la cuenta eche a la sesión de verdad.
  if (cuenta === null) {
    return { valida: false, motivo: "USUARIO_NO_EXISTE" };
  }

  if (cuenta.deletedAt !== null) {
    return { valida: false, motivo: "CUENTA_DESACTIVADA" };
  }

  // Un token sin `iat` no se puede fechar, así que no se puede saber si es
  // anterior al corte. Se rechaza: ante la duda, fuera.
  if (emitidoMs === undefined || !Number.isFinite(emitidoMs)) {
    return { valida: false, motivo: "TOKEN_SIN_IAT" };
  }

  /**
   * ── MILISEGUNDOS EN AMBOS LADOS. SIN REDONDEOS, SIN VENTANAS ─────────────
   *
   * Aquí hubo dos fallos seguidos, y los dos venían de comparar una marca
   * truncada al segundo contra un `timestamptz` con milisegundos:
   *
   * 1. Una cuenta creada a las `10:00:00.800` cuyo dueño entraba a las
   *    `10:00:00.900` obtenía una marca de `10:00:00.000` —menor que su propio
   *    corte por defecto— y quedaba **revocada en el mismo segundo de
   *    registrarse**. Habría roto el registro con entrada automática.
   * 2. Al truncar los dos lados para arreglar lo anterior, una contraseña
   *    cambiada en el MISMO segundo en que se emitió el token no revocaba: el
   *    test del camino real lo destapó poniéndose intermitente según la carga
   *    de la máquina.
   *
   * La solución no es elegir cuál de los dos agujeros se tolera: es dejar de
   * truncar. `em` es un claim NUESTRO, no el `iat` del estándar, así que va en
   * milisegundos y la comparación es exacta.
   *
   * Las dos marcas salen del mismo reloj —el de la aplicación—: quien revoca
   * escribe `marcaDeRevocacion(new Date())`. Ver esa función para el único caso
   * en que interviene el reloj de Postgres.
   * ───────────────────────────────────────────────────────────────────────── */
  const corteMs = cuenta.sessionsValidFrom.getTime();

  if (emitidoMs < corteMs) {
    return { valida: false, motivo: "SESION_REVOCADA" };
  }

  return { valida: true };
}

/**
 * Marca de corte al revocar. **Es el instante exacto, sin margen.**
 *
 * Antes restaba un segundo para absorber la truncación del `iat`. Ese margen
 * dejaba viva durante un segundo entero la sesión que se acababa de revocar:
 * justo lo que no puede pasar cuando alguien cambia la contraseña porque cree
 * que se la han robado. Con `em` en milisegundos el margen sobra, así que se
 * quita.
 *
 * ── EL ÚNICO SITIO DONDE INTERVIENE EL RELOJ DE POSTGRES ───────────────────
 * `users.sessions_valid_from` tiene `defaultNow()`, que lo pone la BASE. Esta
 * función lo pone la APLICACIÓN. Mientras el corte lo escriba quien revoca
 * —siempre, salvo en el valor por defecto al crear la cuenta— las dos marcas
 * salen del mismo reloj y no hay desfase que valga.
 *
 * **Al registrar un usuario, escribe `sessionsValidFrom` explícitamente con
 * esta función** en vez de dejar el `defaultNow()`. Si no, un reloj de Neon
 * unos milisegundos por delante del de la función revocaría la sesión recién
 * creada. Está anotado aquí porque el registro todavía no existe y es
 * exactamente el tipo de detalle que se pierde entre fases.
 */
export function marcaDeRevocacion(ahora: Date): Date {
  return new Date(ahora.getTime());
}

/** Operaciones que revocan TODAS las sesiones anteriores del usuario. */
export const OPERACIONES_QUE_REVOCAN = [
  "CAMBIO_PASSWORD",
  "RESET_PASSWORD",
  "CIERRE_TODAS_SESIONES",
  "BORRADO_CUENTA",
] as const;

export type OperacionRevocadora = (typeof OPERACIONES_QUE_REVOCAN)[number];

// ═══════════════════════════════════════════════════════════════════════════
// ACOTAR EL COSTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cada cuánto se re-verifica contra la base en una LECTURA.
 *
 * Sin acotar, el callback de sesión consulta la base en cada petición
 * autenticada —incluida cada navegación RSC— para detectar un evento que ocurre
 * casi nunca. En Neon eso son CU-horas y una consulta de latencia en cada render.
 *
 * Con el corte en 60 s: **una lectura puede sobrevivir como mucho 60 segundos**
 * a una revocación. Para una escritura la ventana es **cero**.
 */
export const SEGUNDOS_ENTRE_COMPROBACIONES = 60;

/**
 * La ventana efectiva, configurable por entorno.
 *
 * `AUTH_VENTANA_CHEQUEO_SEGUNDOS=0` desactiva el acotado: cada petición
 * consulta la base.
 *
 * EXISTE PARA QUE LA PROTECCIÓN SE PUEDA PROBAR POR EL CAMINO REAL. Un test que
 * roba una cookie y espera 60 segundos no es un test, es una siesta; y uno que
 * fabrica el token para saltarse la espera vuelve a demostrar solo que la
 * función es correcta. Con la ventana a 0, el mecanismo completo —middleware,
 * callback `jwt`, consulta, `evaluarSesion`— se ejercita de verdad.
 *
 * En producción NO se toca: el valor por defecto es 60 y es el que documenta
 * `security.md` §1 bis.
 */
export function ventanaDeChequeoSegundos(entorno: NodeJS.ProcessEnv = process.env): number {
  const bruto = entorno.AUTH_VENTANA_CHEQUEO_SEGUNDOS?.trim();
  if (bruto === undefined || bruto.length === 0) return SEGUNDOS_ENTRE_COMPROBACIONES;

  const valor = Number(bruto);
  // Un valor inválido NO baja la guardia en silencio: se usa el defecto seguro.
  if (!Number.isInteger(valor) || valor < 0) {
    console.warn(
      `[sesion] AUTH_VENTANA_CHEQUEO_SEGUNDOS="${bruto}" no es un entero >= 0. ` +
        `Se usa el valor por defecto (${SEGUNDOS_ENTRE_COMPROBACIONES} s).`,
    );
    return SEGUNDOS_ENTRE_COMPROBACIONES;
  }

  return valor;
}

/**
 * Sensibilidad de la operación. Determina si se puede confiar en el token o hay
 * que ir a la base sí o sí.
 */
export type Sensibilidad =
  /** Lecturas: listar la biblioteca, ver una ficha, navegar. Se puede acotar. */
  | "LECTURA"
  /**
   * Cualquier escritura, y todo lo que toque la cuenta: ajustes, cambio de
   * contraseña, borrado, vinculación de proveedores. **NUNCA se acota.**
   */
  | "MUTACION";

/**
 * ¿Hay que consultar la base, o basta con el token?
 *
 * @param ultimaComprobacion  marca guardada en el JWT, en segundos epoch.
 *                            `undefined` = nunca se ha comprobado.
 */
export function hayQueComprobarContraLaBase(parametros: {
  sensibilidad: Sensibilidad;
  ultimaComprobacion: number | undefined;
  ahoraSegundos: number;
  ventanaSegundos?: number;
}): boolean {
  // Una mutación SIEMPRE va a la base. Es el caso en el que una sesión revocada
  // haría daño de verdad, y es una fracción minúscula del tráfico.
  if (parametros.sensibilidad === "MUTACION") return true;

  // Sin marca previa no hay nada en lo que confiar.
  if (parametros.ultimaComprobacion === undefined) return true;

  // Un reloj que va hacia atrás (marca en el futuro) es sospechoso: se comprueba.
  if (parametros.ultimaComprobacion > parametros.ahoraSegundos) return true;

  const ventana = parametros.ventanaSegundos ?? ventanaDeChequeoSegundos();
  return parametros.ahoraSegundos - parametros.ultimaComprobacion >= ventana;
}
