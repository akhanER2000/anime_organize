/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RECORRER UNA LISTA CON LAS FLECHAS, DANDO LA VUELTA AL LLEGAR AL FINAL.
 *
 * ── POR QUÉ ESTO NO VIVE DENTRO DE CADA COMPONENTE ────────────────────────
 *
 * Lo necesitan `Pestanas` (← →) y `Combobox` (↑ ↓), y lo iba a escribir dos
 * veces —que es exactamente cómo nacieron los 34 duplicados del registro de
 * `code-style.md`—. Peor aún: es la clase de aritmética que se escribe mal en
 * silencio y produce un bug que solo aparece en un extremo de la lista.
 *
 * ── EL FALLO QUE ESTA FUNCIÓN EXISTE PARA NO REPETIR ──────────────────────
 *
 * La versión ingenua es `(actual + salto) % total`. En JavaScript **el resto de
 * un negativo es negativo**: `-1 % 4` vale `-1`, no `3`. Así que pulsar ← en la
 * primera pestaña devuelve `-1`, y con eso:
 *
 *   · `pestanas[-1]` es `undefined` → no se pinta ningún panel;
 *   · `aria-activedescendant` apunta a un id que no existe → el lector de
 *     pantalla se queda mudo;
 *   · el `tabIndex` de todas vale −1 → **el grupo desaparece del tabulador** y
 *     no hay forma de volver a entrar con el teclado.
 *
 * Y solo pasa en un extremo, con una tecla, así que sobrevive a cualquier
 * prueba manual que no piense en ello.
 *
 * Sumar `total` antes del módulo lo cierra: `(-1 + 4) % 4` es `3`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function indiceCircular(actual: number, salto: number, total: number): number {
  // Una lista vacía no tiene índice válido. Devolver `0` daría un índice que no
  // apunta a nada y el fallo aparecería una capa más arriba, donde cuesta más
  // entenderlo; `-1` es la señal de «no hay nada que resaltar», que es lo que
  // ya significa en el resto del sistema.
  if (total <= 0) return -1;

  // El `% total` de dentro acota saltos mayores que la lista (PageDown sobre
  // tres opciones). Sin él, `+ total` no bastaría para volver a positivo.
  return (((actual + salto) % total) + total) % total;
}
