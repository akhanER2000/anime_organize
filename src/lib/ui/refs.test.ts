import { describe, expect, it, vi } from "vitest";

import { fijarRef } from "./refs";

/**
 * `fijarRef` es puro y se prueba entero aquí. Que la **Casilla lo use** es
 * otra pregunta —la de si está enchufado— y la responde
 * `scripts/lint-spread.mjs`, que lee el fichero de verdad.
 */
describe("fijarRef", () => {
  it("llama al ref de función con el nodo", () => {
    const ref = vi.fn();

    fijarRef(ref, "el-nodo");

    expect(ref).toHaveBeenCalledExactlyOnceWith("el-nodo");
  });

  it("escribe en `current` cuando el ref es un objeto", () => {
    const ref: { current: string | null } = { current: null };

    fijarRef(ref, "el-nodo");

    expect(ref.current).toBe("el-nodo");
  });

  it("propaga el desmontaje: un `null` llega igual por las dos formas", () => {
    const funcion = vi.fn();
    const objeto: { current: string | null } = { current: "el-nodo" };

    fijarRef(funcion, null);
    fijarRef(objeto, null);

    expect(funcion).toHaveBeenCalledExactlyOnceWith(null);
    expect(objeto.current).toBeNull();
  });

  it("no revienta cuando no hay ref, que es el caso normal", () => {
    expect(() => {
      fijarRef(null, "el-nodo");
      fijarRef(undefined, "el-nodo");
    }).not.toThrow();
  });
});
