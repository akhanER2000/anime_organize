import { describe, expect, it } from "vitest";

import { ContextoUsuario, ErrorContextoFalsificado } from "./contexto";
import { contextoDePrueba } from "./contexto-pruebas";
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
