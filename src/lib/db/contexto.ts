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
/**
 * La llave del constructor. **No se exporta, y no debe exportarse nunca.**
 *
 * Un `Symbol` de módulo no se puede adivinar ni obtener desde fuera: no está en
 * el objeto exportado, no lo devuelve `Object.getOwnPropertySymbols` de nada
 * alcanzable, y `Symbol.for` no lo encuentra porque no está en el registro
 * global. Es lo que convierte `private constructor` —una promesa del
 * compilador— en una barrera de runtime.
 */
const TESTIGO_DE_SESION: unique symbol = Symbol("ContextoUsuario.deSesionVerificada");

export class ContextoUsuario {
  /**
   * Marca nominal. Nunca se lee; existe para que TypeScript rechace cualquier
   * objeto que no venga de aquí.
   */
  readonly #deSesionVerificada = true;

  /**
   * El userId, en un campo PRIVADO y expuesto solo por un getter.
   *
   * Antes era `readonly userId` en el constructor. `readonly` es una promesa de
   * TypeScript y **en runtime no existe**: `Object.assign(ctx, { userId: otro })`
   * lo reescribía sin quejarse, y la instancia seguía siendo auténtica porque la
   * marca privada continuaba ahí. Peor todavía: `vault.ts` lee `ctx.userId` de
   * forma perezosa dentro de `mias()`, así que la mutación surtía efecto
   * **después** de que `vaultDe` hubiera validado el contexto.
   *
   * Un campo `#` no se puede alcanzar desde fuera de la clase por ningún medio:
   * ni `Object.assign`, ni `Reflect.set`, ni `defineProperty`, ni un `Proxy`.
   */
  readonly #userId: string;

  /** El identificador del dueño de los datos. Solo lectura, de verdad. */
  get userId(): string {
    return this.#userId;
  }

  /**
   * ── EL TESTIGO ES LO QUE HACE PRIVADO AL CONSTRUCTOR DE VERDAD ────────────
   *
   * `private constructor` lo comprueba **el compilador**, y en runtime el
   * constructor es uno normal. Un agente cuyo trabajo era refutar las
   * afirmaciones de este repositorio encontró la puerta:
   *
   *     const ctx: ContextoUsuario = Reflect.construct(ContextoUsuario, [ajeno]);
   *
   * `Reflect.construct` **ejecuta el constructor de verdad**, así que instala la
   * marca privada y `esAutentico()` devolvía `true`. Y como devuelve `any`, no
   * hacía falta `as`, ni `new`, ni el literal: pasaba `tsc` y `eslint` con exit
   * 0. Abría el vault de cualquier usuario.
   *
   * El testigo cierra eso: es un `Symbol` de módulo que **no se exporta**, así
   * que quien no esté dentro de este fichero no puede conseguirlo, y sin él el
   * constructor lanza. `Reflect.construct(ContextoUsuario, [id])` pasa
   * `undefined` como testigo y muere ahí mismo.
   *
   * Es la misma idea de siempre: en vez de una regla que hay que recordar, una
   * llave que no se puede copiar.
   */
  private constructor(userId: string, testigo: symbol) {
    if (testigo !== TESTIGO_DE_SESION) {
      throw new ErrorContextoFalsificado(
        "ContextoUsuario se construyó sin el testigo de sesión. " +
          "Solo `desdeSesionVerificada` puede crear uno.",
      );
    }

    // Se lee una vez para que `noUnusedLocals` no la elimine del análisis. La
    // marca tiene que EXISTIR en el tipo: es lo que impide falsificarlo.
    void this.#deSesionVerificada;

    // Un uuid vacío pasaría los tipos y filtraría por nada. Se corta aquí.
    if (userId.trim().length === 0) {
      throw new Error("ContextoUsuario exige un userId no vacío.");
    }

    this.#userId = userId;

    // ── CONGELADO ────────────────────────────────────────────────────────
    // Cierra las tres formas de reapuntar una instancia LEGÍTIMA a otro
    // usuario, todas encontradas por el refutador y todas con exit 0 en `tsc`
    // y `eslint`: `Object.assign` lanza sobre un objeto congelado, `Reflect.set`
    // devuelve `false` sin escribir, y `Object.defineProperty` lanza porque un
    // objeto congelado no es extensible.
    Object.freeze(this);
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
    return new ContextoUsuario(userId, TESTIGO_DE_SESION);
  }

  /**
   * ¿Este valor es un contexto AUTÉNTICO, o algo que se le parece?
   *
   * ══════════════════════════════════════════════════════════════════════════
   * ESTO EXISTE PORQUE LOS TIPOS NO BASTAN, y lo encontró un ataque adversarial.
   *
   * La marca nominal `#deSesionVerificada` bloquea el literal y el `new`, pero
   * **cualquier valor de tipo `any` se cuela sin `as`, sin `new` y sin literal**:
   *
   *     const ctx: ContextoUsuario = JSON.parse(JSON.stringify({ userId: ajeno }));
   *     const ctx: ContextoUsuario = Object.create(ContextoUsuario.prototype, {
   *       userId: { value: ajeno },
   *     });
   *
   * Las dos COMPILAN y PASAN EL LINT: `JSON.parse` y `Object.create` devuelven
   * `any`, y `no-explicit-any` solo prohíbe el `any` ESCRITO, no el inferido.
   * Y la segunda es peor que un `as`: parece código de hidratación normal.
   *
   * `#campo in valor` es la comprobación de marca REAL de TypeScript: los campos
   * privados los instala el CONSTRUCTOR, nunca están en el prototipo. Así que
   * `Object.create(ContextoUsuario.prototype)` da `false`, y `JSON.parse`
   * también.
   *
   * El `typeof`/`!== null` no es paranoia: `#campo in v` LANZA TypeError con
   * `null`, `undefined` y primitivos en vez de devolver `false`.
   * ══════════════════════════════════════════════════════════════════════════
   */
  static esAutentico(valor: unknown): valor is ContextoUsuario {
    return typeof valor === "object" && valor !== null && #deSesionVerificada in valor;
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
 * Se lanza cuando llega algo que dice ser un contexto y no lo es.
 *
 * NO es un error de negocio: es un intento de saltarse el contrato, o un bug de
 * hidratación que habría acabado consultando con el uuid de otro. Se trata como
 * lo que es.
 */
export class ErrorContextoFalsificado extends Error {
  override readonly name = "ErrorContextoFalsificado";

  constructor(detalle?: string) {
    super(
      detalle ??
        "El contexto de usuario no es auténtico. Un ContextoUsuario solo sale de " +
          "exigirSesionParaLeer() o exigirSesionParaMutar(): no se deserializa, " +
          "no se reconstruye, no se castea y no se construye con Reflect.",
    );
  }
}

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
