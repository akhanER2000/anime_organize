/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ¿ESTA IP ES DE LA RED INTERNA?
 *
 * Vive aparte del descargador porque es lógica **pura**: entra una cadena, sale
 * un booleano. Eso permite probarla con cien casos sin levantar red, y permite
 * que el descargador la use en cada salto de redirección sin duplicar nada.
 *
 * La lista sale de `.claude/rules/security.md` §4 y **no se recorta**. Cada
 * rango está ahí por un ataque concreto:
 *
 *   · `127/8` y `::1`      — el propio servidor: bases de datos, paneles internos
 *   · `169.254.169.254`    — el metadata de la nube. En AWS/GCP devuelve
 *                            CREDENCIALES. Es el objetivo clásico de un SSRF.
 *   · `10/8`, `172.16/12`, `192.168/16` — la red privada de al lado
 *   · `100.64/10`          — CGNAT: la red del operador
 *   · `0.0.0.0/8`          — «esta red». `0.0.0.0` resuelve a localhost en Linux
 *   · `198.18/15`          — banco de pruebas de rendimiento
 *   · `::ffff:a.b.c.d`     — IPv4 disfrazada de IPv6. Se revalida como IPv4, y
 *                            este es el bypass que más veces se olvida
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Convierte `a.b.c.d` en un entero de 32 bits, o `null` si no es IPv4. */
function comoEnteroV4(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;

  let n = 0;
  for (const parte of partes) {
    // `Number("01")` es 1, pero `01` en una IP es una notación octal que algunos
    // resolutores interpretan distinto. Solo se acepta decimal sin ceros
    // delante, que es lo único que produce un `dns.lookup` real.
    if (!/^\d{1,3}$/.test(parte)) return null;
    if (parte.length > 1 && parte.startsWith("0")) return null;

    const octeto = Number(parte);
    if (octeto > 255) return null;
    n = n * 256 + octeto;
  }
  return n;
}

/** Rangos IPv4 bloqueados, como `[primero, ultimo]` en enteros de 32 bits. */
const RANGOS_V4: readonly (readonly [number, number])[] = (
  [
    ["0.0.0.0", 8], //        «esta red»
    ["10.0.0.0", 8], //       privada
    ["100.64.0.0", 10], //    CGNAT
    ["127.0.0.0", 8], //      loopback
    ["169.254.0.0", 16], //   link-local · incluye el metadata de nube
    ["172.16.0.0", 12], //    privada
    ["192.0.0.0", 24], //     asignaciones especiales de IETF
    ["192.0.2.0", 24], //     documentación
    ["192.168.0.0", 16], //   privada
    ["198.18.0.0", 15], //    banco de pruebas
    ["198.51.100.0", 24], //  documentación
    ["203.0.113.0", 24], //   documentación
    ["224.0.0.0", 4], //      multicast
    ["240.0.0.0", 4], //      reservado · incluye 255.255.255.255
  ] as const
).map(([base, bits]) => {
  const inicio = comoEnteroV4(base) ?? 0;
  const tamano = 2 ** (32 - bits);
  return [inicio, inicio + tamano - 1] as const;
});

/**
 * ¿Hay que bloquear esta IP?
 *
 * **Devuelve `true` ante cualquier duda**, incluida una cadena que no se sepa
 * interpretar. Un descargador que se equivoca hacia «bloqueado» pierde una
 * portada; uno que se equivoca hacia «permitido» filtra la red interna.
 */
export function esIpPrivada(ip: string): boolean {
  const limpia = ip.trim().toLowerCase();
  if (limpia === "") return true;

  // ── IPv4 disfrazada de IPv6 ─────────────────────────────────────────
  // `::ffff:127.0.0.1` es loopback escrito en IPv6. Si no se desenvuelve, pasa
  // por «IPv6 desconocida» y se cuela. Es el bypass que más veces se olvida.
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(limpia);
  if (mapeada?.[1] !== undefined) return esIpPrivada(mapeada[1]);

  const v4 = comoEnteroV4(limpia);
  if (v4 !== null) {
    return RANGOS_V4.some(([desde, hasta]) => v4 >= desde && v4 <= hasta);
  }

  // ── IPv6 ────────────────────────────────────────────────────────────────
  if (limpia.includes(":")) {
    if (limpia === "::" || limpia === "::1") return true;
    // `fc00::/7` (únicas locales), `fe80::/10` (enlace local), `ff00::/8`
    // (multicast). Se comprueba por prefijo del primer grupo, que es lo que
    // determina el rango.
    const primero = limpia.split(":")[0] ?? "";
    if (/^f[cd]/.test(primero)) return true;
    if (/^fe[89ab]/.test(primero)) return true;
    if (/^ff/.test(primero)) return true;
    return false;
  }

  // Ni IPv4 ni IPv6 reconocible: no se sabe qué es, así que no se conecta.
  return true;
}
