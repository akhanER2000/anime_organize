import { describe, expect, it } from "vitest";

import { calcularFortaleza } from "./fortaleza-password";

/**
 * El medidor es una PISTA para el usuario, no la política de contraseñas.
 * Estos tests fijan que la pista no mienta en los casos que importan.
 */
describe("calcularFortaleza", () => {
  it("una contraseña vacía no puntúa y lo dice con palabras", () => {
    const r = calcularFortaleza("");
    expect(r.nivel).toBe(0);
    expect(r.etiqueta).toBe("Escribe una contraseña");
  });

  it("nunca devuelve un nivel fuera de 0–4", () => {
    const entradas = ["", "a", "aB3!", "x".repeat(200), "123456".repeat(20), "aB3!".repeat(50)];
    for (const e of entradas) {
      const { nivel } = calcularFortaleza(e);
      expect(nivel).toBeGreaterThanOrEqual(0);
      expect(nivel).toBeLessThanOrEqual(4);
    }
  });

  it("siempre trae etiqueta: ningún nivel se queda sin texto", () => {
    // Si un nivel no tuviera etiqueta, la UI pintaría «undefined» al usuario.
    for (const e of ["", "a", "abcdefgh", "abcdefghijkl", "Corr3cto!Caballo-Bateria"]) {
      expect(calcularFortaleza(e).etiqueta).toMatch(/\S/);
    }
  });

  it("LA LONGITUD MANDA: una frase larga bate a un críptico corto", () => {
    // El criterio clásico premiaría `P4ss!` por «tener de todo». Es más débil.
    const frase = calcularFortaleza("caballo grapa bateria correcto");
    const criptico = calcularFortaleza("P4ss!");
    expect(frase.nivel).toBeGreaterThan(criptico.nivel);
  });

  it("crece de forma monótona al alargar la MISMA contraseña", () => {
    const base = "gaviotaverde";
    let anterior = calcularFortaleza(base).nivel;
    for (const extra of ["xy", "xyza", "xyzabcde"]) {
      const ahora = calcularFortaleza(base + extra).nivel;
      expect(ahora).toBeGreaterThanOrEqual(anterior);
      anterior = ahora;
    }
  });

  it("los patrones que un atacante prueba primero NO puntúan alto pese a ser largos", () => {
    // Este es el caso que hace inútil a un medidor que solo cuenta caracteres.
    for (const pobre of [
      "1234567890123456",
      "qwertyqwertyqwerty",
      "aaaaaaaaaaaaaaaaaaaa",
      "PasswordPassword1234",
      "animevault2026anime",
    ]) {
      expect(calcularFortaleza(pobre).nivel).toBeLessThanOrEqual(2);
    }
  });

  it("es pura: la misma entrada da siempre el mismo resultado", () => {
    const a = calcularFortaleza("Corr3cto!Caballo-Bateria");
    const b = calcularFortaleza("Corr3cto!Caballo-Bateria");
    expect(a).toEqual(b);
  });
});
