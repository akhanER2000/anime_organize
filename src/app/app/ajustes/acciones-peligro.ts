"use server";

import { headers } from "next/headers";

import { exigirSesionParaMutar, signOut } from "@/auth";
import { exito, fallo, type Respuesta } from "@/lib/api/respuesta";
import { verificarPassword } from "@/lib/auth/password";
import { vaultDe } from "@/lib/db";
import { borrarCuenta, hashDeCuenta } from "@/lib/db/cuentas";
import { componerExport, nombreDeFichero, type Export } from "@/lib/import-export/exportar";
import { clavePorEmail, ipDelCliente, registrarIntento, type NombreLimite } from "@/lib/rate-limit";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORTAR Y BORRAR LA CUENTA — artboard 12, pestaña «Peligro».
 *
 * ── EL ORDEN DE `security.md` §3, ENTERO Y EN ESTE ORDEN ──────────────────
 *
 *   1. rate limit específico;
 *   2. **re-autenticación** con la contraseña actual;
 *   3. confirmación escribiendo **el email exacto**;
 *   4. **export automático que se descarga ANTES de borrar nada**;
 *   5. borrado real en cascada;
 *   6. invalidación de la sesión.
 *
 * ── POR QUÉ EL EXPORT SE ENTREGA Y NO SE DESCARGA SOLO ───────────────────
 *
 * `security.md` §2 ter lo fija: «el borrado debe entregar el `.json` **antes**
 * de borrar. Se resuelve con la Server Action devolviendo los datos y el cliente
 * provocando la descarga, **no** con un `GET` que exponga el export a cualquiera
 * con la URL».
 *
 * Un `GET /api/export` sería un enlace que, con la cookie puesta, cualquier
 * página podría hacer que el navegador visitara. La Server Action no: Next
 * comprueba su origen.
 *
 * Y por eso son **dos acciones**: `exportarVault` primero, que devuelve el
 * fichero; y `borrarMiCuenta` después, que solo se llama cuando el navegador ya
 * lo tiene guardado. Si la segunda no llega a llamarse —se cerró la pestaña, se
 * cortó la red—, la cuenta sigue ahí y el usuario tiene su copia. El fallo cae
 * del lado de no perder nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** `security.md` §5: 3 por hora y por usuario. */
const LIMITE_BORRADO: NombreLimite = "borrar-cuenta:user";

/**
 * El export completo del vault.
 *
 * Se puede pedir sin ir a borrar nada: es la pestaña «Exportar». No lleva
 * límite propio porque es una lectura del propio vault, y quien la pide ya tiene
 * la sesión — pedírsela cien veces solo se hace daño a sí mismo.
 */
export async function exportarVault(): Promise<Respuesta<{ fichero: Export; nombre: string }>> {
  const sesion = await exigirSesionParaMutar();
  const animes = await vaultDe(sesion.ctx).paraExportar();
  const ahora = new Date();

  return exito({
    fichero: componerExport({ email: sesion.email, animes, ahora }),
    nombre: nombreDeFichero(ahora),
  });
}

/**
 * Borra la cuenta. **Solo se llama con el export ya en el disco del usuario.**
 *
 * ── LAS DOS PRUEBAS, Y NO SOBRA NINGUNA ──────────────────────────────────
 *
 * La contraseña prueba **quién eres**; escribir el email exacto prueba **qué
 * estás borrando**. Sin la primera, una cookie robada borra el vault; sin la
 * segunda, un clic de más en el sitio equivocado hace lo mismo, y la
 * confirmación se convierte en un paso que se aprende a pulsar sin leer.
 */
export async function borrarMiCuenta(datos: unknown): Promise<Respuesta<{ borrada: true }>> {
  const sesion = await exigirSesionParaMutar();

  if (typeof datos !== "object" || datos === null) {
    return fallo("VALIDACION", "Faltan datos.");
  }

  const { password, emailEscrito } = datos as {
    password?: unknown;
    emailEscrito?: unknown;
  };

  if (typeof password !== "string" || typeof emailEscrito !== "string") {
    return fallo("VALIDACION", "Faltan datos.");
  }

  // ── 1. EL LÍMITE, ANTES DEL HASH ────────────────────────────────────────
  const ip = ipDelCliente(await headers());
  const veredicto = await registrarIntento(
    LIMITE_BORRADO,
    clavePorEmail(LIMITE_BORRADO, sesion.email),
  );
  // La IP no se usa como segunda clave aquí: esto no es un endpoint de
  // adivinar credenciales de OTROS, es el dueño sobre lo suyo. Limitar por IP
  // echaría a una familia detrás del mismo router por lo que hiciera uno.
  void ip;

  if (!veredicto.permitido) {
    return fallo(
      "LIMITE_EXCEDIDO",
      `Demasiados intentos. Vuelve a probar en ${String(Math.ceil(veredicto.reintentarEnSegundos / 60))} minutos.`,
    );
  }

  // ── 2. ESCRIBIR EL EMAIL EXACTO ─────────────────────────────────────────
  //
  // Se compara con el de la SESIÓN, no con uno que venga del formulario. Y se
  // normaliza igual que la base —`citext`, así que sin distinguir mayúsculas—
  // porque exigir la capitalización exacta sería una trampa, no una barrera.
  if (emailEscrito.trim().toLowerCase() !== sesion.email.trim().toLowerCase()) {
    return fallo("VALIDACION", "El correo escrito no coincide con el de esta cuenta.", [
      { campo: "emailEscrito", motivo: "Escríbelo exactamente como aparece arriba." },
    ]);
  }

  // ── 3. RE-AUTENTICACIÓN ─────────────────────────────────────────────────
  const hash = await hashDeCuenta(sesion.userId);
  if (hash === null) return fallo("CONFLICTO_ESTADO", "Esta cuenta no entra con contraseña.");

  if (!(await verificarPassword(password, hash))) {
    return fallo("VALIDACION", "La contraseña no es correcta.", [
      { campo: "password", motivo: "La contraseña no es correcta." },
    ]);
  }

  // ── 4. EL BORRADO REAL, EN CASCADA ──────────────────────────────────────
  const borrada = await borrarCuenta(sesion.userId);
  if (!borrada) return fallo("NO_ENCONTRADO", "Esa cuenta ya no existe.");

  // ── 5. Y LA SESIÓN SE INVALIDA ──────────────────────────────────────────
  //
  // La fila ya no está, así que el token no autenticaría nada aguas abajo
  // —`evaluarSesion` consulta la base—, pero dejar la cookie puesta haría que
  // la siguiente navegación pasara el middleware y muriera dentro, con un error
  // en vez de con la pantalla de entrada.
  await signOut({ redirect: false });

  return exito({ borrada: true });
}
