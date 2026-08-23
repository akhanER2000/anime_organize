/**
 * Política de vinculación de cuentas OAuth.
 *
 * Módulo PURO a propósito: son decisiones, no infraestructura. Se puede testear
 * sin base de datos, sin Auth.js y sin que exista el proveedor de Google.
 *
 * La política está escrita en `.claude/rules/security.md` §2 bis y se resume en:
 * la vinculación solo desde Ajustes, con sesión iniciada, NUNCA automáticamente
 * por coincidencia de email.
 */

/** Motivos por los que se rechaza una vinculación. */
export type MotivoRechazo =
  "EMAIL_YA_REGISTRADO" | "CUENTA_YA_VINCULADA_A_OTRO" | "SIN_SESION" | "ULTIMO_METODO_DE_ACCESO";

export type Decision =
  | { permitido: true }
  | { permitido: false; motivo: MotivoRechazo; codigoAuthJs?: "OAuthAccountNotLinked" };

/** Lo que se sabe del usuario al que se querría vincular la cuenta. */
export type EstadoUsuario = {
  /** ¿Tiene contraseña? */
  tienePassword: boolean;
  /** Proveedores OAuth ya vinculados: ["google", "github"]. */
  proveedoresVinculados: readonly string[];
};

/**
 * ¿Se puede vincular esta cuenta OAuth durante un LOGIN?
 *
 * Respuesta corta: **no**, nunca automáticamente.
 *
 * Auth.js corta con `OAuthAccountNotLinked` cuando llega un perfil de OAuth cuyo
 * email ya pertenece a un usuario sin ese `account`. Ese comportamiento es
 * correcto y se conserva: la coincidencia de email NO es prueba de identidad.
 * Solo lo sería si confiáramos en que el proveedor verificó ese email, y esa
 * confianza no se delega por defecto.
 *
 * El ataque que evita: quien logre crear una cuenta en el proveedor con el email
 * de la víctima entraría en su vault sin conocer la contraseña.
 */
export function puedeVincularEnLogin(contexto: {
  emailYaRegistrado: boolean;
  cuentaYaVinculadaAOtroUsuario: boolean;
}): Decision {
  if (contexto.cuentaYaVinculadaAOtroUsuario) {
    return { permitido: false, motivo: "CUENTA_YA_VINCULADA_A_OTRO" };
  }
  if (contexto.emailYaRegistrado) {
    return {
      permitido: false,
      motivo: "EMAIL_YA_REGISTRADO",
      codigoAuthJs: "OAuthAccountNotLinked",
    };
  }
  // Email nuevo: se crea un usuario nuevo con su fila en `accounts`. Eso no es
  // "vincular", es registrarse.
  return { permitido: true };
}

/**
 * ¿Se puede vincular desde Ajustes?
 *
 * Sí, y es la ÚNICA vía: hay prueba de posesión de la cuenta (la sesión) y del
 * proveedor (el flujo OAuth recién completado).
 */
export function puedeVincularDesdeAjustes(contexto: {
  haySesion: boolean;
  cuentaYaVinculadaAOtroUsuario: boolean;
}): Decision {
  if (!contexto.haySesion) {
    return { permitido: false, motivo: "SIN_SESION" };
  }
  if (contexto.cuentaYaVinculadaAOtroUsuario) {
    return { permitido: false, motivo: "CUENTA_YA_VINCULADA_A_OTRO" };
  }
  return { permitido: true };
}

/**
 * ¿Se puede DESVINCULAR este proveedor?
 *
 * Nunca se deja una cuenta sin forma de entrar. Tras desvincular tiene que
 * quedar al menos un método de acceso: o `password_hash`, o otro `account`.
 */
export function puedeDesvincular(usuario: EstadoUsuario, proveedor: string): Decision {
  const quedan = usuario.proveedoresVinculados.filter((p) => p !== proveedor);
  const quedaAlgunMetodo = usuario.tienePassword || quedan.length > 0;

  return quedaAlgunMetodo
    ? { permitido: true }
    : { permitido: false, motivo: "ULTIMO_METODO_DE_ACCESO" };
}

/**
 * Mensaje que se enseña en la pantalla de login cuando se bloquea.
 *
 * GENÉRICO a propósito: decir «ese email ya existe» enumera usuarios. La
 * explicación concreta va por correo al titular
 * (`plantillaVinculacionBloqueada`).
 */
export const MENSAJE_LOGIN_BLOQUEADO =
  "No hemos podido completar el acceso. Si ya tienes cuenta, entra con tu " +
  "contraseña y vincula el proveedor desde Ajustes.";
