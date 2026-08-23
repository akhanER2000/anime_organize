import { ContextoUsuario } from "./contexto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXTO PARA TESTS. **RESTRINGIDO A FICHEROS `*.test.ts`.**
 *
 * Este módulo existe SEPARADO del contexto real porque un ataque adversarial
 * encontró el agujero: `ContextoUsuario.paraPruebas()` era un método estático
 * público de la clase, y la regla de lint solo vigilaba `desdeSesionVerificada`.
 * Cualquiera podía escribir
 *
 *     ContextoUsuario.paraPruebas(idDeOtroUsuario)   // ← y el lint lo permitía
 *
 * y abrir el vault de quien quisiera.
 *
 * Ahora es un módulo aparte, y `no-restricted-imports` solo lo permite desde
 * ficheros de test. Un `import` desde `src/app/**` o `src/components/**` es un
 * error de lint que para el commit y CI.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function contextoDePrueba(userId: string): ContextoUsuario {
  return ContextoUsuario.desdeSesionVerificada(userId);
}
