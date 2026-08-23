import "server-only";

/**
 * Lectura del entorno relacionada con el correo y la verificación.
 *
 * Se lee en cada llamada, no al importar el módulo: en los tests hace falta poder
 * cambiar `process.env` entre casos, y un `const` a nivel de módulo lo congelaría.
 */

function textoOpcional(valor: string | undefined): string | undefined {
  const limpio = valor?.trim();
  return limpio !== undefined && limpio.length > 0 ? limpio : undefined;
}

export function entornoEmail(): {
  resendApiKey: string | undefined;
  emailFrom: string | undefined;
  urlBase: string;
} {
  return {
    resendApiKey: textoOpcional(process.env.RESEND_API_KEY),
    emailFrom: textoOpcional(process.env.EMAIL_FROM),
    urlBase:
      textoOpcional(process.env.AUTH_URL) ??
      textoOpcional(process.env.NEXT_PUBLIC_APP_URL) ??
      "http://localhost:3000",
  };
}

/**
 * ¿Se exige verificar el email antes de poder entrar?
 *
 * Por defecto **false**: mientras el vault sea de una sola persona, verificar tu
 * propio correo no aporta nada y bloquearía el arranque. Los caminos de código y
 * sus tests existen igualmente, así que activarlo es cambiar esta variable.
 *
 * Solo la cadena exacta "true" activa. Cualquier otra cosa —incluido "1", "yes"
 * o una errata— deja el flag apagado: ante la duda, no bloquear el acceso.
 */
export function seExigeVerificacionEmail(): boolean {
  return textoOpcional(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION)?.toLowerCase() === "true";
}
