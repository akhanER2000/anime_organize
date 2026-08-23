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
   * Único mensaje de fallo de login. Idéntico si el email no existe, si la
   * contraseña es incorrecta o si la cuenta está desactivada.
   *
   * Orienta con una lista de cosas que revisar, y esa lista es la misma en los
   * tres casos: quien la lee no aprende nada sobre si la cuenta existe.
   */
  loginFallido:
    "No hemos podido iniciar sesión. Revisa el correo y la contraseña — " +
    "cuidado con las mayúsculas y con los espacios al copiar y pegar. " +
    "Si acabas de registrarte, comprueba antes tu correo de verificación.",

  /**
   * Se enseña **junto** al anterior, como acciones. Que las dos salidas estén
   * siempre visibles es lo que hace innecesario decir cuál es el problema.
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

  /** Cuando el envío falla tras crear la cuenta: hay que ofrecer la salida. */
  registroSinCorreo:
    "Tu cuenta está creada, pero no hemos podido enviarte el correo de confirmación. " +
    "Puedes pedir que te lo reenviemos.",

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
    mensaje: MENSAJES.loginFallido,
  },
  {
    motivo: "registro: no puede distinguirse cuenta nueva de cuenta existente",
    casos: ["CREAR", "REENVIAR_VERIFICACION", "AVISAR_YA_REGISTRADO"],
    mensaje: MENSAJES.registroHecho,
  },
  {
    motivo: "recuperar: no puede distinguirse si la dirección tiene cuenta",
    casos: ["EXISTE", "NO_EXISTE"],
    mensaje: MENSAJES.recuperarEnviado,
  },
] as const;
