/**
 * ¿Se puede renderizar este `href` como enlace?
 *
 * Vive aquí y no dentro de `enlace.tsx` por dos motivos, y el segundo importa
 * más de lo que parece:
 *
 * 1. Es lógica pura y se testea sin montar nada.
 * 2. **Vitest corre con `environment: "node"` y no transforma `.tsx`.** Un test
 *    que importe un componente falla al parsear el JSX. Así que toda lógica que
 *    merezca test propio sale del `.tsx` a un módulo puro. Es la regla del
 *    proyecto, no una preferencia: la fidelidad visual la comprueban
 *    `ui-fidelity-checker` y Playwright, no Vitest.
 *
 * ── QUÉ PROTEGE ────────────────────────────────────────────────────────────
 * `continue_link.url` la pega el usuario (security.md §8). Un `href` con
 * esquema ejecutable es XSS **almacenado**: se guarda una vez y dispara cada
 * vez que alguien abre la ficha.
 */

/** Un `href` es propio si es relativo o un ancla. Nada de adivinar dominios. */
export function esInterno(href: string): boolean {
  return href.startsWith("/") || href.startsWith("#");
}

/**
 * `javascript:`, `data:` y `vbscript:` ejecutan código al pulsar.
 *
 * Se decide con el parser de URL, **no con `startsWith`**: ` javascript:` con
 * espacios delante y `java\tscript:` con un tabulador en medio esquivan una
 * comparación de cadenas —el navegador los ejecuta igual— y no esquivan al
 * parser. Están fijados en `href.test.ts`.
 */
export function esHrefSeguro(href: string): boolean {
  if (esInterno(href)) return true;
  try {
    const protocolo = new URL(href).protocol;
    return protocolo === "http:" || protocolo === "https:";
  } catch {
    // Ni URL absoluta válida ni ruta propia: no se renderiza como enlace.
    return false;
  }
}
