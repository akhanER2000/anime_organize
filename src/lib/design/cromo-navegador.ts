/**
 * El único color literal permitido fuera de `globals.css`.
 *
 * `themeColor` pinta el cromo del navegador —la barra de estado en móvil, la
 * barra de título en escritorio—, que está FUERA del documento: no hay contexto
 * CSS donde resolver `var(--color-void)`, así que tiene que ser un literal.
 *
 * Es la única excepción del proyecto a la Regla 0 de `design-tokens.md`, y está
 * atada con un test (`cromo-navegador.test.ts`) que lo compara con
 * `--color-void` de `design/tokens.json`: si el diseño cambia el token, el test
 * se pone en rojo y esta constante deja de poder derivar en silencio.
 */
// lint-tokens-ok: el cromo del navegador no resuelve var(); atado por su test
export const COLOR_CROMO_NAVEGADOR = "#07080a";
