/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONTEXTO DE USUARIO — la llave sin la cual no se puede consultar nada.
 *
 * FILOSOFÍA: en este proyecto, lo que ha funcionado es convertir **disciplina en
 * imposibilidad**. Verificación por mutación en vez de «el test parece
 * correcto». Fallo en voz alta en vez de «acuérdate de escribir true».
 * Worktrees en vez de «no toques ficheros ajenos».
 *
 * Aquí lo mismo: **no se puede construir una consulta sobre datos de usuario sin
 * un contexto de usuario**, y olvidarlo no es un fallo en producción, es un
 * error de compilación.
 *
 * CÓMO SE CONSIGUE, a nivel de TIPOS:
 *
 *   1. `ContextoUsuario` es una CLASE con un campo privado `#`. En TypeScript,
 *      una clase con miembro privado se tipa **nominalmente**: un objeto
 *      estructuralmente idéntico —`{ userId: "..." }`— NO es asignable. No se
 *      puede falsificar escribiendo un literal.
 *
 *   2. El constructor es `private`. `new ContextoUsuario(...)` desde fuera es un
 *      error de compilación.
 *
 *   3. `vaultDe(ctx)` es la ÚNICA puerta a los datos, y **exige** el contexto en
 *      su firma. Sin él no hay repositorio, y sin repositorio no hay consulta.
 *
 * DÓNDE ESTÁ EL HUECO, dicho sin adornos: TypeScript no puede comprobar que un
 * `WHERE` concreto contenga `user_id` — eso es una propiedad del VALOR, no del
 * tipo. Lo que sí puede es garantizar que nadie llegue a escribir ese `WHERE`
 * por su cuenta, y eso es lo que se hace: las tablas y el cliente crudo son
 * inalcanzables desde el código de aplicación (regla de ESLint, verificada en
 * CI), y las consultas se escriben UNA vez, aquí dentro, con sus tests de
 * mutación.
 *
 * Las tres capas, y qué las hace cumplir:
 *
 *   | Capa                                   | Lo hace cumplir      | Se salta… |
 *   |----------------------------------------|----------------------|-----------|
 *   | No se puede forjar un contexto         | **el compilador**    | nunca     |
 *   | No hay repositorio sin contexto        | **el compilador**    | nunca     |
 *   | No se alcanza la tabla cruda           | ESLint (CI + hook)   | con un `eslint-disable`, que se ve en el diff |
 *   | La consulta lleva el filtro            | tests por mutación   | rompiendo un test que se pone rojo |
 *
 * `scripts/verificar-contrato.mjs` comprueba las cuatro en cada ejecución de CI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * La llave. **No se puede construir desde fuera de este módulo.**
 *
 * El campo `#deSesionVerificada` no es decorativo: es lo que hace que la clase
 * se tipe de forma nominal. Sin él, cualquier `{ userId: string }` valdría.
 */
export class ContextoUsuario {
  /**
   * Marca nominal. Nunca se lee; existe para que TypeScript rechace cualquier
   * objeto que no venga de aquí.
   */
  readonly #deSesionVerificada = true;

  private constructor(readonly userId: string) {
    // Se lee una vez para que `noUnusedLocals` no la elimine del análisis. La
    // marca tiene que EXISTIR en el tipo: es lo que impide falsificarlo.
    void this.#deSesionVerificada;

    // Un uuid vacío pasaría los tipos y filtraría por nada. Se corta aquí.
    if (userId.trim().length === 0) {
      throw new Error("ContextoUsuario exige un userId no vacío.");
    }
  }

  /**
   * ÚNICA fábrica.
   *
   * Solo debe llamarse desde `src/auth.ts`, después de haber verificado la
   * sesión contra la base. Está restringido por ESLint
   * (`no-restricted-imports`): importarlo desde cualquier otro sitio es un error
   * de lint que para el commit y CI.
   *
   * @internal
   */
  static desdeSesionVerificada(userId: string): ContextoUsuario {
    return new ContextoUsuario(userId);
  }

  /** Para logs y mensajes de error. Nunca expone más que el id. */
  toString(): string {
    return `ContextoUsuario(${this.userId})`;
  }

  /**
   * Evita que el contexto acabe serializado en una respuesta por descuido
   * (`JSON.stringify(algo)` con el contexto dentro).
   */
  toJSON(): { userId: string } {
    return { userId: this.userId };
  }
}

/**
 * Marca de sensibilidad para el repositorio.
 *
 * Un repositorio de MUTACIÓN exige que la sesión se haya comprobado contra la
 * base **sin caché** (ver `sesion.ts`). El tipo lo arrastra para que una Server
 * Action de escritura no pueda usar por descuido un contexto de solo lectura.
 */
export type ModoAcceso = "LECTURA" | "MUTACION";

/**
 * Recurso no encontrado.
 *
 * SE USA TAMBIÉN CUANDO EL RECURSO EXISTE PERO ES DE OTRO USUARIO. Nunca un 403:
 * un 403 confirma que el recurso existe y permite enumerar ids ajenos probando
 * uuids. Para quien pregunta, «no es tuyo» y «no existe» son indistinguibles.
 */
export class ErrorNoEncontrado extends Error {
  override readonly name = "ErrorNoEncontrado";
  readonly codigo = "NO_ENCONTRADO" as const;
  readonly estadoHttp = 404 as const;

  constructor(recurso = "recurso") {
    super(`No se ha encontrado el ${recurso}.`);
  }
}
