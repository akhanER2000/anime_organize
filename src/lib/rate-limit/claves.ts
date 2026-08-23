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
 * IP del cliente detrás del proxy de Vercel.
 *
 * CUIDADO: `x-forwarded-for` lo puede falsificar el cliente si nada lo
 * sobrescribe. Detrás de Vercel, la plataforma reescribe la cabecera y el
 * PRIMER valor es la IP real del cliente; los siguientes son la cadena de
 * proxies. Tomar el último sería tomar el proxy, y limitar al proxy es limitar
 * a todo el mundo a la vez.
 *
 * Si no hay cabecera, se devuelve `null` y quien llama decide. No se inventa un
 * "desconocido" compartido: todos los clientes sin cabecera caerían en el mismo
 * cubo y se bloquearían entre sí.
 */
export function ipDelCliente(cabeceras: Headers): string | null {
  const directa = cabeceras.get("x-real-ip")?.trim();
  if (directa !== undefined && directa.length > 0) return directa;

  const reenviada = cabeceras.get("x-forwarded-for");
  if (reenviada === null) return null;

  const primera = reenviada.split(",")[0]?.trim();
  return primera !== undefined && primera.length > 0 ? primera : null;
}
