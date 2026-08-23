import { createHash } from "node:crypto";

/**
 * Construcción de las claves del limitador.
 *
 * DOS REGLAS:
 *
 * 1. **El email va hasheado.** Esta tabla no puede convertirse en un censo de
 *    direcciones registradas: quien lea `rate_limit_bucket` vería en claro
 *    todas las direcciones que han intentado entrar, incluidas las que no
 *    tienen cuenta. Con sha256 la clave sigue sirviendo para contar y ya no
 *    sirve para enumerar.
 *
 * 2. **El email se normaliza antes de hashear.** Si no, `A@B.com` y `a@b.com`
 *    consumen cubos distintos y el límite por cuenta se salta escribiendo el
 *    email con otras mayúsculas. `users.email` es `citext`, así que para la
 *    base son la misma cuenta: el limitador tiene que coincidir con eso.
 */

/** Igual que la normalización de `citext`: minúsculas y sin espacios sobrantes. */
function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashear(valor: string): string {
  return createHash("sha256").update(valor).digest("hex").slice(0, 32);
}

export function clavePorEmail(accion: string, email: string): string {
  return `${accion}:email:${hashear(normalizarEmail(email))}`;
}

export function clavePorIp(accion: string, ip: string): string {
  // La IP no se hashea: no identifica a una persona por sí sola y verla en claro
  // es lo que permite diagnosticar un ataque mirando la tabla.
  return `${accion}:ip:${ip.trim()}`;
}

export function clavePorUsuario(accion: string, userId: string): string {
  return `${accion}:user:${userId}`;
}

/**
 * IP del cliente.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LO IMPORTANTE: **una cabecera la escribe quien envía la petición.** Si nadie
 * la sanea, cualquiera manda su propia `X-Forwarded-For: 1.2.3.4` y se salta el
 * límite por IP entero, cambiando el valor en cada intento.
 *
 * Quedarse con la PRIMERA entrada de `X-Forwarded-For` es, en el caso general,
 * la opción **falsificable**: en una cadena real de proxies el cliente puede
 * anteponer lo que quiera y los proxies solo van añadiendo detrás.
 *
 * Aquí es aceptable **únicamente porque Vercel reescribe la cabecera** y no
 * reenvía valores externos, justamente para impedir el spoofing: cuando la
 * petición llega a la función, `X-Forwarded-For` tiene un solo valor y ese valor
 * lo puso la plataforma. Primera y última son la misma.
 *
 * ESA SUPOSICIÓN ES DE VERCEL, NO NUESTRA. Si esto se despliega en otro sitio
 * —un contenedor detrás de nginx, un balanceador propio, Cloudflare delante—
 * hay que revisar esta función: en esos entornos la IP de fiar es la que añade
 * el proxy de confianza más cercano (habitualmente la ÚLTIMA entrada, o la
 * penúltima según cuántos saltos controles), nunca la primera.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Orden de preferencia:
 *
 *  1. `x-vercel-forwarded-for` — la pone Vercel y **no se sobrescribe** aunque
 *     el usuario coloque otro proxy por delante. Es la más fiable de las tres.
 *  2. `x-real-ip` — también la pone la plataforma.
 *  3. `x-forwarded-for`, primera entrada — **solo como respaldo de desarrollo
 *     local**. Se documenta como falsificable a propósito.
 *
 * Sin ninguna cabecera se devuelve `null` y quien llama decide. No se inventa un
 * cubo "desconocido" compartido: todos los clientes sin cabecera caerían en el
 * mismo y se bloquearían entre sí.
 */
export function ipDelCliente(cabeceras: Headers): string | null {
  // 1. La que pone Vercel y nadie puede pisar.
  const vercel = cabeceras.get("x-vercel-forwarded-for")?.trim();
  if (vercel !== undefined && vercel.length > 0) {
    return primeraEntrada(vercel);
  }

  // 2. También la pone la plataforma.
  const real = cabeceras.get("x-real-ip")?.trim();
  if (real !== undefined && real.length > 0) return real;

  // 3. Respaldo para desarrollo local. FALSIFICABLE fuera de Vercel: ver la
  //    nota de arriba antes de desplegar en otro sitio.
  const reenviada = cabeceras.get("x-forwarded-for");
  if (reenviada === null) return null;

  return primeraEntrada(reenviada);
}

function primeraEntrada(valor: string): string | null {
  const primera = valor.split(",")[0]?.trim();
  return primera !== undefined && primera.length > 0 ? primera : null;
}
