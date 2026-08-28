import { describe, expect, it } from "vitest";

import { indiceCircular } from "./navegacion-circular";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Los casos que importan son los DOS EXTREMOS, y sobre todo el de abajo.
 *
 * `(actual + salto) % total` funciona perfectamente para todo lo que se prueba
 * a mano —avanzar, retroceder por el medio, dar la vuelta hacia adelante— y
 * falla solo al retroceder desde la primera posición, porque en JavaScript el
 * resto de un negativo es negativo. Un test que no incluya ese caso da verde
 * sobre la implementación rota.
 *
 * VERIFICADO POR MUTACIÓN (2026-08-27):
 *   Cambiando el cuerpo por `(actual + salto) % total` → 3 en rojo, y los tres
 *   son de retroceso desde el principio. Los de avance siguen verdes, que es
 *   justo lo que hace peligroso a este bug.
 *   Devolviendo `0` en vez de `-1` con la lista vacía → 1 en rojo.
 *   Restaurado → verde.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("indiceCircular", () => {
  it("avanza y retrocede por el medio", () => {
    expect(indiceCircular(1, 1, 4)).toBe(2);
    expect(indiceCircular(2, -1, 4)).toBe(1);
  });

  it("desde la ÚLTIMA hacia adelante vuelve a la primera", () => {
    expect(indiceCircular(3, 1, 4)).toBe(0);
  });

  it("desde la PRIMERA hacia atrás va a la última, no a −1", () => {
    // El caso que rompe la versión ingenua. Un −1 aquí deja el grupo de
    // pestañas fuera del tabulador y sin panel pintado.
    expect(indiceCircular(0, -1, 4)).toBe(3);
  });

  it("con un solo elemento, cualquier flecha se queda donde está", () => {
    expect(indiceCircular(0, 1, 1)).toBe(0);
    expect(indiceCircular(0, -1, 1)).toBe(0);
  });

  it("un salto MAYOR que la lista sigue cayendo dentro", () => {
    // PageDown sobre tres opciones. `+ total` a secas no bastaría para volver a
    // positivo si el salto negativo fuera grande.
    expect(indiceCircular(0, 10, 3)).toBe(1);
    expect(indiceCircular(0, -10, 3)).toBe(2);
  });

  it("una lista vacía no tiene índice válido, y lo dice con −1", () => {
    // `0` sería un índice que no apunta a nada, y el fallo aparecería una capa
    // más arriba. `-1` ya significa «nada resaltado» en el resto del sistema.
    expect(indiceCircular(0, 1, 0)).toBe(-1);
    expect(indiceCircular(0, -1, 0)).toBe(-1);
  });
});
