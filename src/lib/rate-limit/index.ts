import "server-only";

import { and, lt, sql } from "drizzle-orm";

import { rateLimitActivo } from "@/lib/config/entorno";
import { dbInterna } from "@/lib/db/interno";
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
 * ¿Tiene la clave la forma `<accion>:<email|ip|user>:<valor>`?
 *
 * Está SEPARADA de `registrarIntento` a propósito. La comprobación es pura,
 * pero `registrarIntento` sigue hasta la base en cuanto acepta — así que un
 * test del caso ACEPTADO acababa siendo un test con base de datos escondida.
 * Pasó de verdad: `limitador.test.ts` verde en local (donde hay un Neon real)
 * y rojo en CI (donde hay un `postgres:18` con el que el driver HTTP de Neon
 * no habla). Un test unitario que necesita base no es un test unitario.
 *
 * El caso RECHAZADO sí se puede seguir probando contra `registrarIntento`:
 * lanza antes de tocar nada, y así queda cubierto que la guarda está de
 * verdad cableada y no solo exportada.
 */
export function claveBienFormada(clave: string): boolean {
  return /^[a-z0-9-]+:(email|ip|user):/.test(clave);
}

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
  /**
   * ── LA CLAVE LA COMPONEN LOS CONSTRUCTORES, NO SE ESCRIBE A MANO ─────────
   *
   * `nombre` elige la POLÍTICA —cuántos y en qué ventana— y `clave` identifica
   * el CUBO. Son dos cosas, y confundirlas no da error: da un cubo compartido.
   *
   * EL FALLO REAL: tres rutas nuevas pasaron `sesion.userId` pelado como clave.
   * Con eso, **todos los límites `*:user` de la misma persona cuentan en el
   * mismo contador** —importar una hoja le gastaba el presupuesto de enriquecer
   * y el de comprobar espejos— y la tabla se llena de uuids que no dicen de qué
   * son. El efecto observable de cada ruta por separado es idéntico al
   * correcto, así que ningún test de esas rutas podía verlo.
   *
   * ── POR QUÉ NO SE EXIGE QUE EMPIECE POR `nombre` ─────────────────────────
   *
   * Fue el primer intento y **estaba mal**: `/recuperar/nueva` aplica la
   * política `recuperar:ip` a un cubo propio, `recuperar-nueva:ip:<ip>`, y eso
   * es correcto y deliberado — reutiliza el límite sin compartir el contador
   * con «pedir el enlace». Aquella guarda lo rompía con un 500, y lo destapó el
   * recorrido en navegador del restablecimiento.
   *
   * Lo que se exige es la FORMA que producen `clavePorEmail`, `clavePorIp` y
   * `clavePorUsuario`: `<accion>:<email|ip|user>:<valor>`. Un uuid pelado no la
   * cumple; un cubo propio con la misma política, sí.
   *
   * Lanza en vez de avisar: es un error de programación, no una entrada del
   * usuario, y falla en la primera llamada — nunca en silencio.
   */
  if (!claveBienFormada(clave)) {
    throw new Error(
      `La clave del limitador debe tener la forma "<accion>:<email|ip|user>:<valor>" ` +
        `y era "${clave}". Compónla con clavePorUsuario/clavePorEmail/clavePorIp ` +
        "de @/lib/rate-limit en vez de escribirla a mano.",
    );
  }

  const limite = LIMITES[nombre];

  // Escotilla SOLO para los tests de integración, que necesitan ejecutar cien
  // logins seguidos. Por defecto está encendido (ver BANDERAS).
  if (!rateLimitActivo()) {
    return { permitido: true, restantes: limite.maximo, reintentarEnSegundos: 0, usado: 0 };
  }

  const inicio = inicioVentana(ahora, limite.ventanaMs);
  const anterior = ventanaAnterior(inicio, limite.ventanaMs);
  const expiraEn = new Date(inicio.getTime() + limite.ventanaMs * 2);

  const cliente = dbInterna();

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
    await dbInterna().delete(rateLimitBucket).where(lt(rateLimitBucket.expiraEn, ahora));
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSULTAR SIN GASTAR — para poder DECIR que estás bloqueado sin bloquearte más
 *
 * ── EL FALLO QUE LA TRAJO, MEDIDO ─────────────────────────────────────────
 *
 * La Server Action del login llamaba a `registrarIntentos` **para poder enseñar
 * el mensaje «demasiados intentos»**, y después `authorize` volvía a registrar
 * por su cuenta. O sea que **un solo envío del formulario gastaba DOS intentos**.
 *
 * Medido: un envío, `contador = 2`. Con el límite en 5, el bloqueo llegaba al
 * TERCER envío en vez de al sexto, y quien se equivocaba dos veces se quedaba
 * fuera un cuarto de hora sin entender por qué.
 *
 * Quien tiene que contar es `authorize`, porque es **la puerta que se ataca**:
 * un `POST` directo al endpoint de Auth.js no pasa por la Server Action. La
 * acción solo necesita SABER si ya está bloqueado, para pintar el mensaje
 * honesto en vez de «correo o contraseña incorrectos».
 *
 * Por eso esto lee y no escribe. No es una optimización: contar dos veces el
 * mismo intento es contar mal.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function consultarIntento(
  nombre: NombreLimite,
  clave: string,
  ahora: Date = new Date(),
): Promise<Veredicto> {
  const limite = LIMITES[nombre];

  if (!rateLimitActivo()) {
    return { permitido: true, restantes: limite.maximo, reintentarEnSegundos: 0, usado: 0 };
  }

  const inicio = inicioVentana(ahora, limite.ventanaMs);
  const anterior = ventanaAnterior(inicio, limite.ventanaMs);
  const cliente = dbInterna();

  const filas = await cliente
    .select({ ventana: rateLimitBucket.ventanaInicio, contador: rateLimitBucket.contador })
    .from(rateLimitBucket)
    .where(sql`${rateLimitBucket.clave} = ${clave}`);

  const deEsta = filas.find((f) => f.ventana.getTime() === inicio.getTime())?.contador ?? 0;
  const dePrevia = filas.find((f) => f.ventana.getTime() === anterior.getTime())?.contador ?? 0;

  // ── SE CUENTA EL INTENTO QUE ESTÁ A PUNTO DE HACERSE ────────────────────
  //
  // `evaluar` da por hecho que el contador YA incluye el intento en curso: lo
  // llama `registrarIntento` justo después de incrementar, y por eso permite
  // mientras `usado <= maximo`.
  //
  // Aquí no se ha incrementado nada, así que hay que sumar el intento pendiente
  // o la respuesta llega un intento tarde. Medido: sin el `+ 1`, el formulario
  // seguía diciendo «correo o contraseña incorrectos» en el envío que `authorize`
  // ya estaba bloqueando — el mensaje correcto aparecía uno después.
  //
  // La pregunta que responde esta función es «¿me dejarían intentarlo AHORA?»,
  // no «¿cuánto llevo gastado?».
  return evaluar({
    limite,
    contadorActual: deEsta + 1,
    contadorAnterior: dePrevia,
    ahora,
    inicio,
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OLVIDAR LOS INTENTOS DE UNA CLAVE.
 *
 * ── CUÁNDO ESTÁ JUSTIFICADO, Y CUÁNDO NO ──────────────────────────────────
 *
 * Solo cuando ha ocurrido algo que demuestra la identidad **mejor** que la
 * contraseña. Hoy hay exactamente un caso: consumir un token de recuperación,
 * que prueba control del buzón — y quien controla el buzón ya puede cambiar la
 * contraseña, así que mantener el bloqueo no protege nada.
 *
 * ── EL CALLEJÓN SIN SALIDA QUE ESTO CIERRA ────────────────────────────────
 *
 * Reproducido de punta a punta contra la aplicación arrancada:
 *
 *   1. cinco intentos fallidos  → bloqueado 15 minutos
 *   2. login con la contraseña CORRECTA → rechazado (el bloqueo sigue)
 *   3. restablecer la contraseña → «Contraseña cambiada»
 *   4. login con la NUEVA → **rechazado**
 *   5. vaciando solo el cubo, sin tocar nada más → **entra**
 *
 * El paso 5 es el control: la contraseña siempre fue buena. Y el bucle se
 * realimenta, porque cada reintento renueva el bloqueo: el dueño legítimo se
 * queda fuera de forma indefinida haciendo exactamente lo que hay que hacer.
 *
 * ── LO QUE **NO** SE OLVIDA ───────────────────────────────────────────────
 *
 * Nunca el cubo por IP. Una IP es compartida —y puede ser la del atacante—, así
 * que borrarla abriría la puerta a barrer muchas cuentas desde un mismo origen
 * usando un reseteo propio como llave maestra. Se olvida la clave del EMAIL que
 * acaba de demostrar que es suyo, y solo esa.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function olvidarIntentos(clave: string): Promise<void> {
  await dbInterna()
    .delete(rateLimitBucket)
    .where(sql`${rateLimitBucket.clave} = ${clave}`);
}
