import { readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PREPARACIÓN DE LA SUITE E2E — se ejecuta UNA vez, antes de todo.
 *
 * ── LA SUITE SE ENVENENABA A SÍ MISMA ─────────────────────────────────────
 *
 * Cada spec necesita una sesión, así que cada uno hace login. Son tres, más el
 * registro del recorrido de auth. Y el límite de `login:email` es **5 intentos
 * cada 15 minutos**, con `login:ip` a 20 — y todos salen de esta máquina, así
 * que comparten cubo.
 *
 * Resultado: la primera pasada iba justa y **la segunda dentro del mismo cuarto
 * de hora fallaba**, con un 429 que en pantalla se lee como «la biblioteca no
 * carga». Lo avisaron dos de los tres agentes de pantalla antes de que pasara,
 * y pasó igual en la primera integración: dos specs en rojo por un motivo que
 * no tenía nada que ver con lo que probaban.
 *
 * ── POR QUÉ VACIAR LOS CUBOS NO ES HACER TRAMPA ───────────────────────────
 *
 * Porque el limitador **tiene sus propios tests, y son mejores que este uso
 * accidental**: ocho casos contra Postgres real en
 * `src/lib/rate-limit/limitador.integracion.test.ts`, y dos por el camino real
 * en `revocacion.camino-real.test.ts` que martillean el endpoint de Auth.js y
 * comprueban que los bloqueados ni siquiera pagan el hash.
 *
 * Lo que aquí se quita es un efecto colateral entre pruebas, no una protección.
 * La alternativa —bajar el límite, o subirlo para los tests— sí habría sido
 * tocar lo que se prueba.
 *
 * ── SE BORRAN TODOS LOS CUBOS DE AUTENTICACIÓN, NO SOLO LOS DE LOGIN ──────
 *
 * La primera versión limpiaba solo `login:*` «para enterarme si un spec agota
 * los otros». Me enteré en la siguiente pasada: `registro:ip` son **5 por
 * hora**, la suite crea cuentas nuevas en cada ejecución, y el recorrido de
 * registro empezó a fallar con «no aparece “Cuenta creada”» — que se lee como
 * un fallo de la pantalla y no lo era.
 *
 * La lectura correcta no es «el límite molesta»: es que **una suite que prueba
 * PANTALLAS no debe estar probando el limitador de paso**. Cuando lo hace, cada
 * pantalla hereda un motivo de fallo que no es suyo, y el rojo deja de señalar
 * dónde está el problema.
 *
 * Además, limpiar los cubos hace la suite **repetible**: se puede correr diez
 * veces seguidas mientras se arregla algo, que es justo cuando más falta hace.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default async function prepararSuite(): Promise<void> {
  const url = cadenaDeConexion();
  if (url === null) {
    // Sin base no hay nada que limpiar. No se lanza: los specs que no dependen
    // de datos deben poder correr igual, y los que sí ya se saltan solos.
    console.warn("[e2e] sin DATABASE_URL: no se limpian los cubos del limitador");
    return;
  }

  const sql = neon(url);
  const borrados = await sql`
    delete from rate_limit_bucket
     where clave like 'login:%'
        or clave like 'registro:%'
        or clave like 'recuperar%'
    returning clave`;
  console.info(`[e2e] cubos de autenticación limpiados: ${String(borrados.length)}`);

  // ── Y LAS CUENTAS DE PRUEBA DE PASADAS ANTERIORES ───────────────────────
  // Cada ejecución crea cuentas desechables con dominio `@ejemplo.test`. Sin
  // esto, la rama de desarrollo acumula cientos y el vault del propietario
  // acaba rodeado de basura. El correo real NUNCA casa con ese dominio.
  const cuentas = await sql`
    delete from users where email like '%@ejemplo.test' returning email`;
  if (cuentas.length > 0) {
    console.info(`[e2e] cuentas de prueba anteriores borradas: ${String(cuentas.length)}`);
  }
}

/**
 * La cadena de `.env.local`, leída a mano.
 *
 * Playwright no carga `.env.local` por su cuenta, y meter `dotenv` solo para
 * esto sería una dependencia nueva. Son cuatro líneas.
 */
function cadenaDeConexion(): string | null {
  const deEntorno = process.env.DATABASE_URL;
  if (deEntorno !== undefined && deEntorno !== "") return deEntorno;

  try {
    const contenido = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const encontrada = /^DATABASE_URL=(.+)$/m.exec(contenido)?.[1];
    return encontrada === undefined ? null : encontrada.trim().replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}
