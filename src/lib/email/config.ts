import "server-only";

import { textoOpcional } from "@/lib/config/entorno";

/**
 * Entorno relacionado con el correo.
 *
 * La bandera de verificación de email NO vive aquí: está en
 * `@/lib/config/entorno` junto con las demás booleanas, para que todas se
 * validen con el mismo criterio (fallar en voz alta ante una errata) y en el
 * mismo arranque. Ver `seExigeVerificacionEmail` allí.
 */
export function entornoEmail(): {
  resendApiKey: string | undefined;
  emailFrom: string | undefined;
  urlBase: string;
} {
  return {
    resendApiKey: textoOpcional("RESEND_API_KEY"),
    emailFrom: textoOpcional("EMAIL_FROM"),
    urlBase:
      textoOpcional("AUTH_URL") ?? textoOpcional("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  };
}
