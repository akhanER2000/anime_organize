import "server-only";

import { and, lt, sql } from "drizzle-orm";

import { rateLimitActivo } from "@/lib/config/entorno";
import { db } from "@/lib/db";
import { rateLimitBucket } from "@/lib/db/schema";

import {
  LIMITES,
  evaluar,
  inicioVentana,
  ventanaAnterior,
  type NombreLimite,
  type Veredicto,
} from "./politica";

export { clavePorEmail, clavePorIp, clavePorUsuario, ipDelCliente } from "./claves";
export { LIMITES, type NombreLimite, type Veredicto } from "./politica";

/**
 * Limitador contra Postgres.
 *
 * POR QUÉ POSTGRES: en Vercel cada invocación puede caer en una instancia y una
 * región distintas. Un contador en memoria se pierde entre invocaciones y no se
 * comparte: «5 intentos» se convierte en «5 intentos por instancia», que no
 * limita nada. Ver `.claude/rules/security.md` §5.
 *
 * POR QUÉ NO UN SERVICIO APARTE (Upstash, Vercel KV): sería otro proveedor que
 * registrar, otro secreto que rotar y otra superficie que auditar, para algo que
 * la base que ya tenemos resuelve con una tabla. La latencia extra de Postgres
 * frente a Redis es irrelevante en un flujo de login, que ya va a consultar la
 * base para verificar la contraseña.
 */

/** Cuántas veces, de mil, se aprovecha una llamada para barrer filas caducadas. */
const PROBABILIDAD_LIMPIEZA = 5;

/**
 * Registra un intento y decide si se permite.
 *
 * El incremento es un `INSERT … ON CONFLICT DO UPDATE … RETURNING` **atómico**:
 * una sola ida y vuelta, sin leer-modificar-escribir y por tanto sin condición
 * de carrera entre invocaciones concurrentes.
 *
 * FALLA CERRADO: si la base no responde, se deniega. En estas rutas no es una
 * decisión dura — el login necesita la base para verificar la contraseña, así
 * que si la base está caída no hay login que permitir.
 */
export async function registrarIntento(
  nombre: NombreLimite,
  clave: string,
  ahora: Date = new Date(),
): Promise<Veredicto> {
  const limite = LIMITES[nombre];

  // Escotilla SOLO para los tests de integración, que necesitan ejecutar cien
  // logins seguidos. Por defecto está encendido (ver BANDERAS).
  if (!rateLimitActivo()) {
    return { permitido: true, restantes: limite.maximo, reintentarEnSegundos: 0, usado: 0 };
  }

  const inicio = inicioVentana(ahora, limite.ventanaMs);
  const anterior = ventanaAnterior(inicio, limite.ventanaMs);
  const expiraEn = new Date(inicio.getTime() + limite.ventanaMs * 2);

  const cliente = db();

  const [fila] = await cliente
    .insert(rateLimitBucket)
    .values({ clave, ventanaInicio: inicio, contador: 1, expiraEn })
    .onConflictDoUpdate({
      target: [rateLimitBucket.clave, rateLimitBucket.ventanaInicio],
      set: { contador: sql`${rateLimitBucket.contador} + 1` },
    })
    .returning({ contador: rateLimitBucket.contador });

  const [previa] = await cliente
    .select({ contador: rateLimitBucket.contador })
    .from(rateLimitBucket)
    .where(
      and(
        sql`${rateLimitBucket.clave} = ${clave}`,
        sql`${rateLimitBucket.ventanaInicio} = ${anterior}`,
      ),
    )
    .limit(1);

  if (Math.random() * 1000 < PROBABILIDAD_LIMPIEZA) {
    void limpiarCaducados(ahora);
  }

  return evaluar({
    limite,
    contadorActual: fila?.contador ?? 1,
    contadorAnterior: previa?.contador ?? 0,
    ahora,
    inicio,
  });
}

/**
 * Comprueba VARIAS claves y devuelve el veredicto más restrictivo.
 *
 * Login se limita por IP **y** por email: por email frena la fuerza bruta contra
 * una cuenta aunque el atacante rote IPs; por IP frena el barrido de muchas
 * cuentas desde un mismo origen. Hacen falta las dos.
 *
 * Se registran TODAS aunque una ya haya bloqueado: si se cortocircuitara, el
 * contador de la otra clave no avanzaría y un atacante podría mantenerlo a cero.
 */
export async function registrarIntentos(
  entradas: readonly { nombre: NombreLimite; clave: string }[],
  ahora: Date = new Date(),
): Promise<Veredicto> {
  const veredictos = await Promise.all(
    entradas.map((e) => registrarIntento(e.nombre, e.clave, ahora)),
  );

  const bloqueante = veredictos.find((v) => !v.permitido);
  if (bloqueante !== undefined) return bloqueante;

  // Todos permiten: se informa del más ajustado, para que la cabecera
  // `X-RateLimit-Remaining` no prometa más de lo que hay.
  return veredictos.reduce((a, b) => (a.restantes <= b.restantes ? a : b));
}

/**
 * Borra filas caducadas.
 *
 * Oportunista, no un cron: menos piezas móviles, y si un día no se ejecuta lo
 * único que pasa es que sobran filas muertas — no que el límite deje de
 * funcionar. Los errores se tragan a propósito: es mantenimiento, y que falle no
 * puede tumbar un login.
 */
export async function limpiarCaducados(ahora: Date = new Date()): Promise<void> {
  try {
    await db().delete(rateLimitBucket).where(lt(rateLimitBucket.expiraEn, ahora));
  } catch {
    // Silencio deliberado: ver el comentario de arriba.
  }
}

/** Cabeceras estándar para acompañar la respuesta. */
export function cabecerasRateLimit(nombre: NombreLimite, v: Veredicto): Record<string, string> {
  const cabeceras: Record<string, string> = {
    "x-ratelimit-limit": String(LIMITES[nombre].maximo),
    "x-ratelimit-remaining": String(v.restantes),
  };
  if (!v.permitido) {
    cabeceras["retry-after"] = String(v.reintentarEnSegundos);
  }
  return cabeceras;
}
