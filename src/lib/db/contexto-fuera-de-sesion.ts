import { ContextoUsuario } from "./contexto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXTO SIN SESIÓN — **para tests y para scripts de línea de comandos.**
 *
 * Se llamaba `contexto-pruebas.ts` y su única función, `contextoDePrueba`. El
 * nombre se quedó corto en cuanto el seed tuvo que usarlo: `npm run seed`
 * escribe los 83 animes REALES del propietario, y llamar «de prueba» a lo que
 * abre ese vault es una mentira pequeña que dentro de seis meses hace que
 * alguien lo trate como código desechable.
 *
 * Lo que de verdad tienen en común los dos usos es que **no hay sesión HTTP**:
 * en un test porque no hay navegador, en un script porque no hay petición. El
 * nombre dice eso ahora.
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
/**
 * Para tests. El `userId` lo pone el propio test, así que no hay nada que
 * verificar: la verificación es que el fichero se llame `*.test.ts`, y eso lo
 * hace cumplir el lint.
 */
export function contextoDePrueba(userId: string): ContextoUsuario {
  return ContextoUsuario.desdeSesionVerificada(userId);
}

/**
 * Para scripts de CLI (`npm run seed`, `npm run enrich`).
 *
 * Un script corre en la máquina de su dueño, con las credenciales de su dueño y
 * porque su dueño lo ha lanzado: eso ES la verificación, y no hay una sesión
 * HTTP que la represente. El `motivo` no se usa para nada técnico —solo obliga
 * a escribir en el código POR QUÉ este script puede abrir un vault—, y eso
 * aparece en el diff cuando alguien añade el siguiente.
 */
export function contextoDeScript(userId: string, motivo: string): ContextoUsuario {
  if (motivo.trim() === "") {
    throw new Error("contextoDeScript exige un motivo: quién abre este vault y por qué.");
  }
  return ContextoUsuario.desdeSesionVerificada(userId);
}
