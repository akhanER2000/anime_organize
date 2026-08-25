import { describe, expect, it } from "vitest";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { contextoDePrueba } from "./contexto-fuera-de-sesion";
import { vaultDe } from "./vault";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA GARANTÍA DEL CONTRATO, EN RUNTIME.
 *
 * ENCONTRADO POR UN ATAQUE ADVERSARIAL (2026-08-23): la marca nominal bloquea
 * el literal y el `new`, pero **cualquier valor `any` se colaba** —
 * `JSON.parse(...)` y `Object.create(ContextoUsuario.prototype, ...)` compilaban,
 * pasaban el lint y ABRÍAN EL VAULT DE OTRO USUARIO. La garantía documentada
 * («no se puede forjar · el compilador · nunca») era falsa.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-23): al quitar la llamada a
 * `ContextoUsuario.esAutentico(ctx)` de `vaultDe`, los tests de este bloque se
 * ponen en rojo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Las dos forjas que el ataque demostró. Se construyen sin `as` ni `new`. */
function forjaPorJson(userIdAjeno: string): unknown {
  return JSON.parse(JSON.stringify({ userId: userIdAjeno }));
}

function forjaPorPrototipo(userIdAjeno: string): unknown {
  return Object.create(ContextoUsuario.prototype, {
    userId: { value: userIdAjeno, enumerable: true },
  });
}

describe("esAutentico · la marca privada no está en el prototipo", () => {
  it("un contexto legítimo es auténtico", () => {
    expect(ContextoUsuario.esAutentico(contextoDePrueba("uuid-legitimo"))).toBe(true);
  });

  it("una forja por JSON.parse NO lo es", () => {
    expect(ContextoUsuario.esAutentico(forjaPorJson("de-otro"))).toBe(false);
  });

  it("una forja por Object.create sobre el prototipo NO lo es", () => {
    // Los campos privados los instala el CONSTRUCTOR: nunca están en el
    // prototipo, por mucho que se herede de él.
    expect(ContextoUsuario.esAutentico(forjaPorPrototipo("de-otro"))).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["número", 42],
    ["texto", "no soy un contexto"],
    ["objeto vacío", {}],
    ["objeto con userId", { userId: "de-otro" }],
    ["array", []],
  ])("%s no es auténtico, y NO lanza", (_caso, valor) => {
    // `#campo in v` LANZA TypeError con null y primitivos: por eso hay un
    // `typeof`/`!== null` delante. Sin él, esto sería un 500 en vez de un
    // rechazo limpio.
    expect(() => ContextoUsuario.esAutentico(valor)).not.toThrow();
    expect(ContextoUsuario.esAutentico(valor)).toBe(false);
  });
});

describe("vaultDe RECHAZA un contexto forjado", () => {
  it.each([
    ["JSON.parse", forjaPorJson],
    ["Object.create", forjaPorPrototipo],
  ])("una forja por %s no abre el vault", (_caso, forjar) => {
    const forjado = forjar("uuid-de-otro-usuario");

    // El tipo se relaja aquí A PROPÓSITO: se está simulando exactamente lo que
    // hace un `any` que el compilador deja pasar.
    expect(() => vaultDe(forjado as never)).toThrow(ErrorContextoFalsificado);
  });

  it("el mensaje del error dice qué hacer en vez de solo negarse", () => {
    let capturado: unknown;
    try {
      vaultDe(forjaPorJson("x") as never);
    } catch (error) {
      capturado = error;
    }

    expect(capturado).toBeInstanceOf(ErrorContextoFalsificado);
    expect((capturado as Error).message).toContain("exigirSesionParaLeer");
  });

  it("un contexto legítimo SÍ abre el vault", () => {
    // Un test que solo comprueba negativas pasaría con una función que lanza
    // siempre.
    expect(() => vaultDe(contextoDePrueba("uuid-legitimo"))).not.toThrow();
  });
});

describe("el contexto no se puede serializar por descuido", () => {
  it("toJSON solo expone el userId", () => {
    const ctx = contextoDePrueba("uuid-1");
    expect(JSON.parse(JSON.stringify({ ctx }))).toEqual({ ctx: { userId: "uuid-1" } });
  });

  it("y lo serializado ya NO es un contexto auténtico", () => {
    // Justo el caso del ataque: guardar el ctx en una caché y rehidratarlo.
    const ctx = contextoDePrueba("uuid-1");
    const rehidratado: unknown = JSON.parse(JSON.stringify(ctx));

    expect(ContextoUsuario.esAutentico(rehidratado)).toBe(false);
  });

  it("un userId vacío se rechaza al construir", () => {
    expect(() => contextoDePrueba("")).toThrow();
    expect(() => contextoDePrueba("   ")).toThrow();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOS CUATRO SALTOS QUE PASABAN `tsc` Y `eslint` CON EXIT 0.
 *
 * Los encontró un agente cuyo único trabajo era refutar las afirmaciones de
 * este repositorio. Los doce intentos de `lint:contrato` seguían siendo doce
 * rechazados — porque los doce se juegan en el COMPILADOR y en el LINTER, y
 * estos cuatro se juegan en RUNTIME.
 *
 * Los cuatro abrían el vault de cualquier usuario, y ninguno necesitaba un
 * `as`, ni un `new`, ni un `eslint-disable`, ni un import dinámico. El comentario
 * de `contexto.ts` que decía «no se puede forjar un contexto · el compilador ·
 * **nunca**» era literalmente falso.
 *
 * Van aquí y no en `verificar-contrato.mjs` porque ese script mide lo que
 * rechazan `tsc` y `eslint`, y estos cuatro **compilan y pasan el lint**: lo que
 * los para es el testigo del constructor y el `Object.freeze`.
 *
 * ── VERIFICADO POR MUTACIÓN · 2026-08-24 ───────────────────────────────────
 *
 * | Mutación | Resultado |
 * |---|---|
 * | quitar la comprobación del testigo en el constructor | **1 en ROJO** («Reflect.construct») |
 * | quitar `Object.freeze(this)` | **1 en ROJO** («Object.defineProperty») |
 *
 * La segunda tumba solo uno de los tres casos de mutación, y merece decirse con
 * precisión en vez de dar por hecho que el `freeze` lo hace todo: quien de
 * verdad para a `Object.assign` y a `Reflect.set` es que **`userId` es un getter
 * sin setter**, y eso ya lanza en modo estricto sin congelar nada. El `freeze`
 * añade el caso que el getter no cubre —`defineProperty` puede definir una
 * propiedad propia que lo tape, salvo si el objeto no es extensible—.
 *
 * Dos mecanismos, dos casos distintos, y los dos hacen falta.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("los saltos de RUNTIME, que el compilador no puede ver", () => {
  it("Reflect.construct NO fabrica un contexto: el constructor exige un testigo", () => {
    // `private constructor` lo comprueba el compilador; en runtime era un
    // constructor normal, y `Reflect.construct` lo ejecutaba de verdad —así que
    // instalaba la marca privada y `esAutentico` decía que sí—. Devuelve `any`,
    // así que ni siquiera hacía falta un `as`.
    expect(() => Reflect.construct(ContextoUsuario, ["de-otra-persona"])).toThrow(
      ErrorContextoFalsificado,
    );
  });

  it("Object.assign NO reapunta un contexto legítimo a otro usuario", () => {
    // `readonly userId` es una promesa de TypeScript que en runtime no existe.
    // Y era peor de lo que parece: `vault.ts` lee `ctx.userId` de forma perezosa
    // dentro de `mias()`, así que la mutación surtía efecto DESPUÉS de que
    // `vaultDe` hubiera validado el contexto.
    const ctx = contextoDePrueba("el-mio");

    expect(() => Object.assign(ctx, { userId: "el-de-otro" })).toThrow(TypeError);
    expect(ctx.userId).toBe("el-mio");
  });

  it("Reflect.set NO escribe: devuelve false y deja el userId intacto", () => {
    // `Reflect.set` no lanza sobre un objeto congelado; devuelve `false`. Si
    // alguien no mirara el valor de retorno —nadie lo mira— parecería funcionar.
    const ctx = contextoDePrueba("el-mio");

    expect(Reflect.set(ctx, "userId", "el-de-otro")).toBe(false);
    expect(ctx.userId).toBe("el-mio");
  });

  it("Object.defineProperty NO puede redefinir el userId", () => {
    const ctx = contextoDePrueba("el-mio");

    expect(() => Object.defineProperty(ctx, "userId", { value: "el-de-otro" })).toThrow(TypeError);
    expect(ctx.userId).toBe("el-mio");
  });

  it("y el contexto legítimo sigue siendo auténtico después de los cuatro intentos", () => {
    // El control positivo. Sin esto, congelar de más —o romper el getter— haría
    // pasar los cuatro casos de arriba rompiendo la aplicación entera.
    const ctx = contextoDePrueba("el-mio");

    try {
      Object.assign(ctx, { userId: "otro" });
    } catch {
      // esperado
    }
    Reflect.set(ctx, "userId", "otro");

    expect(ContextoUsuario.esAutentico(ctx)).toBe(true);
    expect(ctx.userId).toBe("el-mio");
  });
});
