"use server";

import { exigirSesionParaMutar } from "@/auth";
import { exito, fallo, falloDeValidacion, type Respuesta } from "@/lib/api/respuesta";
import { hashearPassword, verificarPassword } from "@/lib/auth/password";
import { cambiarPasswordConSesion, hashDeCuenta } from "@/lib/db/cuentas";
import {
  clavePorEmail,
  clavePorIp,
  ipDelCliente,
  registrarIntento,
  type NombreLimite,
} from "@/lib/rate-limit";
import { EsquemaCambiarPassword } from "@/lib/validation/auth";

import { headers } from "next/headers";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAMBIAR LA CONTRASEÑA DESDE AJUSTES.
 *
 * ── RE-AUTENTICACIÓN OBLIGATORIA ──────────────────────────────────────────
 *
 * `security.md` §2: «al cambiar contraseña o email, re-autenticación
 * obligatoria (pedir la contraseña actual)». No es burocracia: una sesión
 * robada —una cookie copiada de un ordenador desatendido— permitiría al
 * intruso **cambiar la contraseña y dejar fuera al dueño**. Pedir la actual
 * convierte «tengo la cookie» en «además sé el secreto».
 *
 * ── Y LLEVA LÍMITE, AUNQUE HAYA SESIÓN ───────────────────────────────────
 *
 * La tentación es no ponerlo: quien está dentro ya se autenticó. Pero este
 * formulario **verifica una contraseña**, así que es un oráculo: con una sesión
 * robada se podría probar la contraseña del dueño sin límite y sin que él se
 * entere. Y cada intento paga un Argon2id de ~30 ms, que es el amplificador de
 * denegación de servicio de `security.md` §2.
 *
 * Se limita por **usuario y por IP**, y se registra ANTES de verificar. El
 * orden es el mismo que en el login y por el mismo motivo: una petición
 * bloqueada no puede llegar al hash.
 *
 * ── EL ORDEN DEL RESTO: parsear → limitar → verificar → escribir ──────────
 *
 * Y la escritura comprueba, en su propio `WHERE`, que la fila sigue teniendo el
 * hash que se acaba de verificar. Si entre medias alguien cambió la contraseña
 * por el enlace de recuperación, esto no la pisa: devuelve que no se pudo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Los mismos nombres que el login: comparten la política de `security.md` §5. */
const LIMITE_POR_USUARIO: NombreLimite = "login:email";
const LIMITE_POR_IP: NombreLimite = "login:ip";

export async function cambiarPassword(entrada: unknown): Promise<Respuesta<{ ok: true }>> {
  const sesion = await exigirSesionParaMutar();

  const validado = EsquemaCambiarPassword.safeParse(entrada);
  if (!validado.success) return falloDeValidacion(validado.error.issues);

  const { actual, nueva } = validado.data;

  // ── EL LÍMITE VA ANTES DEL HASH. NO ES NEGOCIABLE ─────────────────────
  const ip = ipDelCliente(await headers());
  const claveIp = ip === null ? null : clavePorIp(LIMITE_POR_IP, ip);

  const [porUsuario, porIp] = await Promise.all([
    registrarIntento(LIMITE_POR_USUARIO, clavePorEmail(LIMITE_POR_USUARIO, sesion.email)),
    claveIp === null ? Promise.resolve(null) : registrarIntento(LIMITE_POR_IP, claveIp),
  ]);

  if (!porUsuario.permitido || porIp?.permitido === false) {
    const espera = Math.max(porUsuario.reintentarEnSegundos, porIp?.reintentarEnSegundos ?? 0);
    return fallo(
      "LIMITE_EXCEDIDO",
      `Demasiados intentos. Vuelve a probar en ${String(Math.ceil(espera / 60))} minutos.`,
    );
  }

  // El `userId` sale de la SESIÓN verificada, nunca del formulario: aceptarlo
  // del cliente convertiría esto en «cambia la contraseña de quien digas».
  const hashActual = await hashDeCuenta(sesion.userId);
  if (hashActual === null) {
    // Una cuenta sin contraseña entra solo por proveedor. No hay nada que
    // cambiar, y decir «no tienes contraseña» no filtra nada: es su cuenta.
    return fallo("CONFLICTO_ESTADO", "Esta cuenta no entra con contraseña.");
  }

  const correcta = await verificarPassword(actual, hashActual);
  if (!correcta) {
    return fallo("VALIDACION", "La contraseña actual no es correcta.", [
      { campo: "actual", motivo: "La contraseña actual no es correcta." },
    ]);
  }

  const cambiada = await cambiarPasswordConSesion({
    userId: sesion.userId,
    hashActual,
    hashNuevo: await hashearPassword(nueva),
  });

  if (!cambiada) {
    // La fila ya no tiene el hash que se verificó: alguien la cambió entre
    // medias. Decirlo es mejor que pisar el cambio del otro en silencio.
    return fallo(
      "CONFLICTO_ESTADO",
      "La contraseña cambió mientras rellenabas el formulario. Vuelve a intentarlo.",
    );
  }

  return exito({ ok: true });
}
