import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dbInterna } from "@/lib/db/interno";
import { rateLimitBucket } from "@/lib/db/schema";

import { LIMITES } from "./politica";

import { registrarIntento, registrarIntentos } from "./index";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL LIMITADOR, CONTRA POSTGRES DE VERDAD.
 *
 * CAMINO REAL (2026-08-23) — `.claude/rules/testing.md` § «Verificación por el
 * CAMINO REAL».
 *
 * ── POR QUÉ EXISTE ─────────────────────────────────────────────────────────
 * Hasta hoy, la tabla de estado de `testing.md` decía esto de `registrarIntento`:
 *
 *     «SIN TEST — corre en producción y nadie ha comprobado que cuente bien»
 *
 * Y era literal. Lo que sí estaba testeado era `evaluar()`, la función PURA que
 * decide a partir de dos contadores ya calculados. Pero `evaluar()` no cuenta:
 * quien cuenta es el `INSERT … ON CONFLICT DO UPDATE`, y ese no se había
 * ejecutado nunca en un test. Un `target` mal puesto, una ventana mal calculada
 * o una lectura sucia no los veía nadie — y el limitador es lo único que separa
 * el login de un ataque por fuerza bruta.
 *
 * Este test NO fabrica contadores: llama a `registrarIntento` tal cual, contra
 * la misma base y el mismo driver que usa la aplicación.
 *
 * ── VERIFICADO POR MUTACIÓN · 2026-08-23 ───────────────────────────────────
 *
 * | Mutación | Qué se rompe | Resultado |
 * |---|---|---|
 * | quitar el `+ 1` del `set` del `ON CONFLICT` | el cubo no cuenta | **7 de 8 en ROJO** |
 * | `contadorAnterior: 0` | la ventana pasa a ser FIJA, no deslizante | **1 en ROJO** («ventana deslizante») |
 * | bucle con `break` en `registrarIntentos` | cortocircuita al primer bloqueo | **1 en ROJO** («registra en TODAS las claves») |
 *
 * La tercera **no se puso roja a la primera**, y eso destapó un fallo en ESTE
 * fichero: la clave ya bloqueada iba la última del array, así que un
 * cortocircuito la alcanzaba igualmente y el test pasaba sin comprobar nada.
 * Corregido poniéndola delante. Es el motivo por el que la mutación no es
 * opcional: un test que no se pone rojo cuando debe es un verde que miente.
 *
 * ── CLAVES DESECHABLES ─────────────────────────────────────────────────────
 * Cada caso usa una clave con un uuid, así que no interfieren entre sí ni con
 * nada que haya en la rama de desarrollo. Se limpian al final.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SUFIJO = randomUUID();
const clavesUsadas: string[] = [];

/** Una clave nueva para cada caso: los tests no comparten cubo. */
function clave(nombre: string): string {
  const k = `test:${nombre}:${SUFIJO}`;
  clavesUsadas.push(k);
  return k;
}

describe("registrarIntento · contra Postgres", () => {
  beforeAll(() => {
    // Si el limitador estuviera apagado, TODO este fichero pasaría sin
    // ejecutar una sola consulta: el verde diría «el limitador cuenta bien»
    // habiendo comprobado únicamente que la escotilla de los tests funciona.
    // Eso es peor que no tener test, así que se para en seco.
    if (process.env.RATE_LIMIT_ENABLED === "false") {
      throw new Error(
        "RATE_LIMIT_ENABLED=false: este test NO puede correr con el limitador " +
          "apagado, daría un verde que no significa nada.",
      );
    }
  });

  afterAll(async () => {
    const db = dbInterna();
    for (const k of clavesUsadas) {
      await db.delete(rateLimitBucket).where(sql`${rateLimitBucket.clave} = ${k}`);
    }
  });

  it("CUENTA DE VERDAD: permite exactamente el máximo y deniega el siguiente", async () => {
    const k = clave("cuenta");
    const maximo = LIMITES["recuperar:email"].maximo;

    const veredictos = [];
    for (let i = 0; i < maximo + 2; i++) {
      veredictos.push(await registrarIntento("recuperar:email", k));
    }

    const permitidos = veredictos.filter((v) => v.permitido).length;
    expect(permitidos).toBe(maximo);
    expect(veredictos[maximo]?.permitido).toBe(false);
    expect(veredictos[maximo + 1]?.permitido).toBe(false);
  });

  it("los `restantes` bajan de uno en uno y no se quedan pegados", async () => {
    const k = clave("restantes");
    const maximo = LIMITES["recuperar:email"].maximo;

    const restantes: number[] = [];
    for (let i = 0; i < maximo; i++) {
      restantes.push((await registrarIntento("recuperar:email", k)).restantes);
    }

    // Un `ON CONFLICT` que no incrementara devolvería siempre el mismo número.
    const esperado = Array.from({ length: maximo }, (_, i) => maximo - 1 - i);
    expect(restantes).toEqual(esperado);
  });

  it("EL INCREMENTO ES ATÓMICO: 12 llamadas EN PARALELO no se pisan", async () => {
    // Este es el caso que un `SELECT` + `UPDATE` perdería, y el que de verdad
    // ocurre en producción: doce funciones serverless a la vez, cada una en su
    // instancia. Si dos leyeran el mismo contador antes de escribir, el cubo
    // avanzaría 11 en vez de 12 y el atacante ganaría un intento por carrera.
    const k = clave("atomico");
    const total = 12;

    const veredictos = await Promise.all(
      Array.from({ length: total }, () => registrarIntento("login:email", k)),
    );

    const usados = veredictos.map((v) => v.usado).sort((a, b) => a - b);
    // Doce llamadas → doce valores DISTINTOS de `usado`, del 1 al 12.
    // Cualquier repetición es una lectura sucia.
    expect(usados).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  });

  it("cada clave tiene su propio cubo: agotar una no bloquea la otra", async () => {
    const kA = clave("aislada-a");
    const kB = clave("aislada-b");
    const maximo = LIMITES["recuperar:email"].maximo;

    for (let i = 0; i < maximo + 1; i++) {
      await registrarIntento("recuperar:email", kA);
    }

    expect((await registrarIntento("recuperar:email", kA)).permitido).toBe(false);
    expect((await registrarIntento("recuperar:email", kB)).permitido).toBe(true);
  });

  it("el mismo cubo distingue ventanas: la de hace dos ya no cuenta", async () => {
    const k = clave("ventanas");
    const ahora = new Date();
    const haceDosVentanas = new Date(ahora.getTime() - LIMITES["recuperar:email"].ventanaMs * 2);

    // Se agota la ventana MUY anterior…
    for (let i = 0; i < 5; i++) {
      await registrarIntento("recuperar:email", k, haceDosVentanas);
    }

    // …y la actual sigue limpia: dos ventanas atrás ya no pondera.
    const ahoraMismo = await registrarIntento("recuperar:email", k, ahora);
    expect(ahoraMismo.permitido).toBe(true);
    expect(ahoraMismo.usado).toBe(1);
  });

  it("VENTANA DESLIZANTE: lo gastado en la ventana anterior sigue pesando", async () => {
    // Una ventana FIJA dejaría pasar el doble en el borde: 3 intentos al final
    // de una hora y 3 más al principio de la siguiente. Esto comprueba que la
    // anterior pondera de verdad CONTRA LA BASE, no solo en la función pura.
    const k = clave("deslizante");
    const { ventanaMs, maximo } = LIMITES["recuperar:email"];

    const ahora = new Date();
    const inicioActual = Math.floor(ahora.getTime() / ventanaMs) * ventanaMs;
    const dentroDeLaAnterior = new Date(inicioActual - ventanaMs + 1000);

    for (let i = 0; i < maximo; i++) {
      await registrarIntento("recuperar:email", k, dentroDeLaAnterior);
    }

    // Justo al empezar la ventana nueva el solapamiento es casi total: lo
    // gastado antes pesa casi entero y el primer intento ya debe estar cortado.
    const reciénEmpezada = new Date(inicioActual + 1000);
    const veredicto = await registrarIntento("recuperar:email", k, reciénEmpezada);

    expect(veredicto.permitido).toBe(false);
  });

  it("`registrarIntentos` devuelve el MÁS restrictivo y registra en TODAS las claves", async () => {
    const kIp = clave("dos-ip");
    const kEmail = clave("dos-email");

    // Se agota solo la de email.
    for (let i = 0; i < LIMITES["recuperar:email"].maximo + 1; i++) {
      await registrarIntento("recuperar:email", kEmail);
    }

    const antes = await registrarIntento("recuperar:ip", kIp);
    const usadoAntes = antes.usado;

    // ── EL ORDEN DE ESTE ARRAY ES LA MITAD DEL TEST ────────────────────────
    // La clave YA BLOQUEADA va PRIMERO. Con la agotada al final, un
    // cortocircuito «sal al primer bloqueo» habría registrado igualmente las
    // dos y el test habría pasado sin comprobar nada: lo descubrí al mutar
    // `registrarIntentos` a un bucle con `break` y ver que los 8 seguían en
    // verde. Con la bloqueante delante, el cortocircuito se salta la segunda y
    // el test se pone rojo.
    const veredicto = await registrarIntentos([
      { nombre: "recuperar:email", clave: kEmail },
      { nombre: "recuperar:ip", clave: kIp },
    ]);

    expect(veredicto.permitido).toBe(false);

    // Y LA CLAVE QUE NO BLOQUEÓ TAMBIÉN AVANZÓ. Si se cortocircuitara al primer
    // bloqueo, el contador de IP se quedaría quieto y un atacante podría
    // mantenerlo a cero provocando adrede el bloqueo por email.
    const despues = await registrarIntento("recuperar:ip", kIp);
    expect(despues.usado).toBeGreaterThan(usadoAntes + 1);
  });

  it("deja `reintentarEnSegundos` positivo al bloquear, para poder responder 429", async () => {
    const k = clave("retry");
    for (let i = 0; i < LIMITES["recuperar:email"].maximo + 1; i++) {
      await registrarIntento("recuperar:email", k);
    }
    const bloqueado = await registrarIntento("recuperar:email", k);

    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.reintentarEnSegundos).toBeGreaterThan(0);
  });
});
