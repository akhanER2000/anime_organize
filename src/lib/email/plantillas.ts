import type { MensajeEmail } from "./tipos";

/**
 * Plantillas de correo. Texto plano obligatorio; el HTML es opcional y llega
 * después (FASE 6, con la estética del sistema).
 *
 * Módulo puro: se puede testear sin `server-only` ni entorno.
 *
 * Regla de contenido: el correo **no revela si la cuenta existe** más allá de lo
 * que ya sabe quien lo recibe, y nunca incluye la contraseña ni el token en el
 * asunto (los asuntos acaban en notificaciones, en previsualizaciones y en logs
 * de servidores de correo intermedios).
 */

const FIRMA = "— Anime Vault";

export function plantillaVerificacion(datos: { urlBase: string; token: string }): MensajeEmail {
  const enlace = `${datos.urlBase}/verificar?token=${encodeURIComponent(datos.token)}`;

  return {
    para: "", // lo rellena quien llama
    asunto: "Confirma tu cuenta de Anime Vault",
    texto: [
      "Confirma tu cuenta",
      "",
      "Abre este enlace para activar tu vault:",
      enlace,
      "",
      "El enlace caduca en 24 horas y solo se puede usar una vez.",
      "Si no has creado ninguna cuenta, ignora este mensaje: no se hará nada.",
      "",
      FIRMA,
    ].join("\n"),
  };
}

export function plantillaReset(datos: { urlBase: string; token: string }): MensajeEmail {
  const enlace = `${datos.urlBase}/recuperar/nueva?token=${encodeURIComponent(datos.token)}`;

  return {
    para: "",
    asunto: "Restablecer tu contraseña de Anime Vault",
    texto: [
      "Restablecer contraseña",
      "",
      "Abre este enlace para elegir una contraseña nueva:",
      enlace,
      "",
      "El enlace caduca en 1 hora y solo se puede usar una vez.",
      "",
      "Si no has pedido cambiar la contraseña, ignora este mensaje: tu contraseña",
      "actual sigue siendo válida y nadie ha accedido a tu cuenta.",
      "",
      FIRMA,
    ].join("\n"),
  };
}

/**
 * Aviso al titular cuando alguien intenta entrar con Google usando un email que
 * ya tiene cuenta con contraseña.
 *
 * La pantalla de login muestra un mensaje GENÉRICO para no enumerar usuarios; la
 * explicación concreta llega aquí, a quien de verdad es el titular.
 * Ver `.claude/rules/security.md` §2 bis.
 */
export function plantillaVinculacionBloqueada(datos: { urlBase: string }): MensajeEmail {
  return {
    para: "",
    asunto: "Intento de acceso con Google a tu cuenta de Anime Vault",
    texto: [
      "Alguien ha intentado entrar con Google usando tu dirección de correo.",
      "",
      "No hemos vinculado nada: por seguridad, una cuenta de Google solo se puede",
      "vincular desde Ajustes, con la sesión ya iniciada. Que dos cuentas compartan",
      "email no demuestra que sean la misma persona.",
      "",
      "Si has sido tú: entra con tu contraseña y vincula Google desde",
      `${datos.urlBase}/app/ajustes`,
      "",
      "Si no has sido tú: no hay nada que hacer, no se ha concedido ningún acceso.",
      "Aun así, si te preocupa, cambia tu contraseña.",
      "",
      FIRMA,
    ].join("\n"),
  };
}
