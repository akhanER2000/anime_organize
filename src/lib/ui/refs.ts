import type { Ref } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENTREGAR UN NODO A UN `ref` QUE VIENE DE FUERA.
 *
 * ── POR QUÉ HACE FALTA, Y POR QUÉ ESTE FALLO ES DISTINTO A LOS DEMÁS ─────
 *
 * Desde **React 19**, el `ref` de un componente de función viaja como una prop
 * normal. Ya no hay `forwardRef` que lo separe: entra en `...resto` con
 * `name`, `onChange` y todo lo demás.
 *
 * Eso convierte a `ref` en el miembro más silencioso de la familia de fallos
 * del spread —lo que el componente calcula, pisado por lo que le esparcen
 * encima—, y con dos agravantes que ninguno de los otros tiene:
 *
 * 1. **TypeScript no lo ve en la forma que se usa de verdad.** El compilador
 *    SÍ rechaza `<Casilla ref={…} />` escrito a mano, pero **no** rechaza
 *    `<Casilla {...register("recordarme")} />`, porque un spread no pasa la
 *    comprobación de propiedades excedentes. La forma peligrosa es justo la
 *    que compila.
 * 2. **Los dos refs son legítimos.** En el resto de casos el arreglo es poner
 *    el spread delante y que gane la primitiva. Aquí no: si gana la primitiva,
 *    react-hook-form se queda sin nodo y el control **deja de registrarse**
 *    —la casilla «Recordarme» dejaría de enviarse—; si gana el llamador, se
 *    pierde lo que la primitiva necesitaba el nodo para hacer. No es un
 *    conflicto: son dos usos del mismo nodo, y hay que **componerlos**.
 *
 * ── LA FORMA DE UN `ref` ─────────────────────────────────────────────────
 *
 * `Ref<T>` es una unión de tres cosas y hay que atender a las tres: una
 * función (lo que devuelve `register()`), un objeto con `current` (lo que
 * devuelve `useRef`) y `null`. Tratar sólo la primera es la mitad del arreglo,
 * y la mitad que falta no da error: simplemente no pasa nada.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function fijarRef<T>(ref: Ref<T> | undefined, nodo: T | null): void {
  if (typeof ref === "function") {
    // React 19 admite que un ref de función devuelva su propia limpieza. Aquí
    // se descarta a propósito: quien la necesite es el dueño del ref, y este
    // ayudante no tiene dónde guardarla ni cuándo llamarla.
    ref(nodo);
    return;
  }

  if (ref === null || ref === undefined) return;

  ref.current = nodo;
}
