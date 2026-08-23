/**
 * Los textos que ve el usuario en autenticación.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA TENSIÓN, DICHA EN VOZ ALTA
 *
 * No enumerar usuarios choca de frente con la usabilidad. «Credenciales
 * inválidas» es seguro y es **inútil**: a alguien que ha escrito mal el email no
 * le dice qué hacer, y a alguien que se registró ayer y no verificó el correo,
 * tampoco.
 *
 * LA SALIDA: copia que **oriente sin confirmar existencia**. En vez de decir
 * QUÉ ha fallado, se enumera lo que el usuario puede revisar. La lista es la
 * misma exista o no la cuenta, así que no informa a un atacante; pero a la
 * persona con una errata le dice exactamente dónde mirar.
 *
 * REGLAS DE ESCRITURA:
 *  1. Nunca «ese correo no existe», «ya está registrado», «la contraseña es
 *     incorrecta». Cada una de esas frases es un oráculo.
 *  2. Nunca dos mensajes distintos para dos causas que el atacante quiere
 *     distinguir. Si el texto cambia, el atacante lee el cambio.
 *  3. Sí decir qué PUEDE HACER: revisar, reenviar, recuperar.
 *  4. Segunda persona, sin regañar, sin signos de exclamación.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const MENSAJES = {
  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Base del fallo de login. Idéntica si el email no existe, si la contraseña es
   * incorrecta o si la cuenta está desactivada.
   *
   * Orienta con una lista de cosas que revisar, y esa lista es la misma en los
   * tres casos: quien la lee no aprende nada sobre si la cuenta existe.
   *
   * NO se usa suelta: la pantalla llama a `mensajeLoginFallido()`, que añade la
   * pista de verificación **solo si esa verificación existe**.
   */
  loginFallidoBase:
    "No hemos podido iniciar sesión. Revisa el correo y la contraseña — " +
    "cuidado con las mayúsculas y con los espacios al copiar y pegar.",

  /**
   * Pista extra, SOLO cuando `AUTH_REQUIRE_EMAIL_VERIFICATION` está encendido.
   *
   * Con la bandera apagada no hay ningún correo que comprobar, y esta frase
   * mandaría a la gente a buscar algo que no existe.
   */
  loginFallidoPistaVerificacion:
    "Si acabas de registrarte, comprueba antes tu correo de verificación.",

  /**
   * Se enseñan **junto** al mensaje, como acciones. Que las salidas estén
   * siempre visibles es lo que hace innecesario decir cuál es el problema.
   *
   * `reenviar` solo aparece si la verificación está activa: ver `accionesLogin()`.
   */
  loginAcciones: {
    recuperar: "He olvidado mi contraseña",
    reenviar: "Reenviar el correo de verificación",
    registrarse: "Todavía no tengo cuenta",
  },

  /** Rate limit. Aquí sí se puede ser concreto: no revela nada de la cuenta. */
  loginDemasiadosIntentos:
    "Demasiados intentos. Espera unos minutos antes de volver a probar. " +
    "Si no recuerdas la contraseña, es más rápido restablecerla.",

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTRO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Idéntico tanto si la cuenta se acaba de crear como si ya existía.
   *
   * Por detrás cambia lo que se hace —crear, reenviar la verificación, o avisar
   * de que ya hay cuenta—, pero el usuario ve siempre esto y en los tres casos
   * recibe un correo útil. Quien no sea el titular no aprende nada.
   */
  registroHecho:
    "Si la dirección es válida, te hemos enviado un correo para confirmar tu cuenta. " +
    "Revisa tu bandeja de entrada y la carpeta de correo no deseado.",

  /**
   * Cuando el envío de correo falla.
   *
   * ══════════════════════════════════════════════════════════════════════════
   * NO PUEDE AFIRMAR NADA SOBRE LA CUENTA.
   *
   * La versión anterior decía «Tu cuenta está creada, pero no hemos podido…»,
   * y eso DELATABA: ese texto solo puede salir en un registro nuevo. Quien
   * registrara un email ajeno sabría que la cuenta NO existía al ver ese
   * mensaje, y que SÍ existía al ver el genérico.
   *
   * Peor aún: es un camino que el atacante puede **provocar a voluntad**,
   * saturando el rate limit del proveedor de correo. Proteger el camino feliz y
   * dejar abierto el de error no protege nada.
   *
   * Este texto es idéntico tanto si la cuenta se acaba de crear como si ya
   * existía. Ver `MENSAJES_QUE_NO_PUEDEN_DIVERGIR`.
   * ══════════════════════════════════════════════════════════════════════════
   */
  correoNoEnviado:
    "No hemos podido enviar el correo en este momento. Inténtalo de nuevo en unos " +
    "minutos, o pide que te lo reenviemos.",

  // ─────────────────────────────────────────────────────────────────────────
  // RECUPERAR CONTRASEÑA
  // ─────────────────────────────────────────────────────────────────────────

  /** Igual exista o no la cuenta. */
  recuperarEnviado:
    "Si esa dirección tiene una cuenta, te hemos enviado un enlace para elegir " +
    "una contraseña nueva. Caduca en una hora y solo se puede usar una vez.",

  /** Token caducado, ya usado o inventado: los tres, el mismo texto. */
  recuperarEnlaceInvalido:
    "Este enlace ya no sirve. Los enlaces caducan a la hora y solo valen una vez. " +
    "Pide uno nuevo y úsalo cuanto antes.",

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFICACIÓN DE CORREO
  // ─────────────────────────────────────────────────────────────────────────

  verificacionHecha: "Tu correo está confirmado. Ya puedes entrar en tu vault.",

  verificacionEnlaceInvalido:
    "Este enlace de confirmación ya no sirve. Puede que haya caducado o que ya " +
    "lo hayas usado. Prueba a entrar; si sigue sin dejarte, pide uno nuevo.",

  /** Igual exista o no la cuenta, y esté o no ya verificada. */
  reenvioHecho:
    "Si esa dirección tiene una cuenta pendiente de confirmar, te hemos enviado " +
    "un correo nuevo.",

  // ─────────────────────────────────────────────────────────────────────────
  // VINCULACIÓN OAUTH
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Genérico a propósito: decir «ese correo ya tiene cuenta con contraseña»
   * confirma qué direcciones están registradas. La explicación concreta va por
   * correo al titular (`plantillaVinculacionBloqueada`).
   */
  vinculacionBloqueada:
    "No hemos podido completar el acceso. Si ya tienes cuenta, entra con tu " +
    "contraseña y vincula el proveedor desde Ajustes.",

  desvincularUltimoMetodo:
    "Este es tu único modo de entrar. Añade una contraseña antes de desvincularlo, " +
    "o te quedarías fuera de tu propia cuenta.",

  // ─────────────────────────────────────────────────────────────────────────
  // CAMPOS DEL FORMULARIO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validación de formato, en el cliente. Esto NO enumera: se comprueba la
   * forma del texto, no si existe la cuenta.
   */
  campos: {
    emailVacio: "Escribe tu correo.",
    emailMalFormado: "Esto no parece un correo. Revisa que tenga una @ y un dominio.",
    passwordVacia: "Escribe tu contraseña.",
    passwordCorta: "La contraseña necesita al menos 8 caracteres.",
    passwordSinFuerza:
      "Elige algo menos previsible. Una frase de tres o cuatro palabras es más " +
      "segura y más fácil de recordar que ocho caracteres raros.",
    passwordsNoCoinciden: "Las dos contraseñas no coinciden.",
    passwordActualNecesaria: "Escribe tu contraseña actual para confirmar que eres tú.",
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BORRADO DE CUENTA
  // ─────────────────────────────────────────────────────────────────────────

  borrarConfirmacion:
    "Escribe tu correo completo para confirmar. Esto borra tu vault entero: " +
    "animes, portadas, progreso y enlaces. No se puede deshacer.",

  borrarEmailNoCoincide: "El correo no coincide con el de tu cuenta.",

  borrarExportPrimero:
    "Antes de borrar nada, te descargamos una copia de tu vault en formato JSON.",
} as const;

/**
 * Los mensajes que DEBEN ser idénticos entre sí, agrupados.
 *
 * Existe para que un test pueda comprobarlo: si alguien "mejora" uno de los dos
 * y no el otro, la diferencia se convierte en el oráculo que estábamos evitando.
 */
export const MENSAJES_QUE_NO_PUEDEN_DIVERGIR = [
  {
    motivo: "login: no puede distinguirse email inexistente de contraseña mala",
    casos: ["EMAIL_INEXISTENTE", "PASSWORD_INCORRECTA", "CUENTA_DESACTIVADA"],
    mensaje: MENSAJES.loginFallidoBase,
  },
  {
    motivo: "registro: no puede distinguirse cuenta nueva de cuenta existente",
    casos: ["CREAR", "REENVIAR_VERIFICACION", "AVISAR_YA_REGISTRADO"],
    mensaje: MENSAJES.registroHecho,
  },
  {
    /**
     * EL CAMINO DE ERROR TAMBIÉN. Es el que un atacante puede provocar a
     * voluntad saturando el rate limit del proveedor de correo, así que dejarlo
     * distinguible anula la protección del camino feliz.
     */
    motivo: "fallo de correo: no puede distinguirse cuenta nueva de cuenta existente",
    casos: ["FALLO_TRAS_CREAR", "FALLO_AL_REENVIAR", "FALLO_EN_RECUPERACION"],
    mensaje: MENSAJES.correoNoEnviado,
  },
  {
    motivo: "recuperar: no puede distinguirse si la dirección tiene cuenta",
    casos: ["EXISTE", "NO_EXISTE"],
    mensaje: MENSAJES.recuperarEnviado,
  },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
// TEXTOS QUE DEPENDEN DE LA CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mensaje de login fallido, ajustado a la configuración real.
 *
 * ¿POR QUÉ ES SEGURO QUE ESTE TEXTO CAMBIE? Porque depende de una bandera
 * GLOBAL, no de la cuenta. `AUTH_REQUIRE_EMAIL_VERIFICATION` es la misma para
 * todo el mundo, y su estado se deduce en dos segundos mirando el registro. No
 * informa de nada sobre una dirección concreta, que es lo que hay que proteger.
 *
 * Lo que SÍ importa: con la bandera apagada no hay ningún correo que comprobar,
 * y mandar a alguien a buscarlo es una pista falsa que le hace perder el tiempo.
 */
export function mensajeLoginFallido(seExigeVerificacion: boolean): string {
  return seExigeVerificacion
    ? `${MENSAJES.loginFallidoBase} ${MENSAJES.loginFallidoPistaVerificacion}`
    : MENSAJES.loginFallidoBase;
}

export type AccionLogin = { clave: "recuperar" | "reenviar" | "registrarse"; etiqueta: string };

/**
 * Acciones que se ofrecen bajo el mensaje de login.
 *
 * «Reenviar el correo de verificación» solo aparece si esa verificación existe:
 * un enlace que no lleva a ninguna parte es peor que no tener enlace.
 */
export function accionesLogin(seExigeVerificacion: boolean): AccionLogin[] {
  const acciones: AccionLogin[] = [
    { clave: "recuperar", etiqueta: MENSAJES.loginAcciones.recuperar },
  ];

  if (seExigeVerificacion) {
    acciones.push({ clave: "reenviar", etiqueta: MENSAJES.loginAcciones.reenviar });
  }

  acciones.push({ clave: "registrarse", etiqueta: MENSAJES.loginAcciones.registrarse });
  return acciones;
}
