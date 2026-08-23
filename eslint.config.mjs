import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * ESLint 9 (flat config) para Anime Vault.
 *
 * Las reglas duras de `.claude/rules/code-style.md` que se pueden verificar
 * mecánicamente se verifican aquí; el resto son revisión humana.
 */
const configuracion = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "design/**",
      ".claude/**",
      "drizzle/**",
      "next-env.d.ts",
    ],
  },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // `any` está prohibido (code-style.md). No es un aviso: es un error.
      "@typescript-eslint/no-explicit-any": "error",
      // El `!` de non-null es una excepción en producción esperando su turno.
      "@typescript-eslint/no-non-null-assertion": "error",
      // Un `eslint-disable` sin motivo no dice nada dentro de seis meses.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // console.log fuera de producción; warn y error sí son trazas legítimas.
      "no-console": ["error", { allow: ["warn", "error", "info"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },

  {
    // Los scripts de CLI SÍ imprimen por consola: es su interfaz.
    files: ["scripts/**", "*.config.*", "e2e/**"],
    rules: { "no-console": "off" },
  },

  // ═══════════════════════════════════════════════════════════════════════
  // EL CONTRATO DE DATOS, HECHO CUMPLIR POR EL LINTER
  //
  // El compilador ya impide falsificar un `ContextoUsuario` y llamar al vault
  // sin él. Lo que el compilador NO puede hacer es impedir que alguien alcance
  // la tabla cruda por su cuenta, ni bloquear un `as`. Eso lo hace esto, y
  // corre en el hook de pre-commit y en CI.
  //
  // Ver `src/lib/db/contexto.ts` para las cuatro capas y sus garantías.
  // ═══════════════════════════════════════════════════════════════════════
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      // La capa de datos ES quien puede tocar las tablas: para eso existe.
      "src/lib/db/**",
      // Autentica por `users.id` ANTES de que exista un contexto: no puede
      // haberlo, porque es justo lo que está creando.
      "src/auth.ts",
      // `rate_limit_bucket` no pertenece a ningún usuario: no tiene `user_id`.
      "src/lib/rate-limit/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db/schema", "@/lib/db/schema/*", "**/db/schema", "**/db/schema/*"],
              message:
                "Las tablas de Drizzle no se importan desde la aplicacion. " +
                "Usa `vaultDe(ctx)` de @/lib/db: el filtro por usuario viene dado " +
                "por la forma de la API en vez de por acordarse. " +
                "Si necesitas una consulta que no existe, se anade AL VAULT.",
            },
            {
              group: ["@/lib/db/interno", "**/db/interno"],
              message:
                "`dbInterna()` es el cliente SIN filtro por usuario. No se usa " +
                "desde la aplicacion. Usa `vaultDe(ctx)` de @/lib/db.",
            },
            {
              group: ["@/lib/db/vault", "**/db/vault"],
              message:
                "Importa desde @/lib/db, no del modulo interno: la puerta publica " +
                "es la que documenta el contrato.",
            },
            {
              // HALLAZGO DEL ATAQUE ADVERSARIAL: `ownership.ts` exportaba
              // `exigirAnimePropio(db, { userId })`, que recibe el userId como
              // string SUELTO. Cualquiera podia pasar el de otro.
              group: ["@/lib/db/ownership", "**/db/ownership"],
              message:
                "`ownership.ts` recibia el userId como string suelto. Esta " +
                "sustituido por `vaultDe(ctx)`, donde el filtro no se puede omitir.",
            },
            {
              // HALLAZGO DEL ATAQUE: `cliente-test.ts` devuelve un drizzle con el
              // esquema completo. `db.query.anime.findMany()` sin filtro alguno.
              group: ["@/lib/db/cliente-test", "**/db/cliente-test"],
              message: "El cliente de pruebas no lleva filtro por usuario. Solo en tests.",
            },
            {
              // HALLAZGO DEL ATAQUE: `paraPruebas()` era un estatico publico de la
              // clase y minteaba un contexto de CUALQUIER usuario.
              group: ["@/lib/db/contexto-pruebas", "**/db/contexto-pruebas"],
              message:
                "`contextoDePrueba()` fabrica un contexto de cualquier usuario. " +
                "Solo en ficheros *.test.ts.",
            },
            {
              // HALLAZGO DEL ATAQUE: nada impedia `neon(URL)` y lanzar SQL crudo.
              // Sin tablas, sin vault, sin contexto: el vault entero de todos.
              group: [
                "@neondatabase/serverless",
                "drizzle-orm/neon-http",
                "drizzle-orm/neon-serverless",
                "drizzle-orm/node-postgres",
                "pg",
              ],
              message:
                "El driver de base de datos no se importa desde la aplicacion: " +
                "conectar a pelo saltaria el contrato entero. Usa `vaultDe(ctx)`.",
            },
          ],
        },
      ],

      "no-restricted-syntax": [
        "error",
        {
          // El unico hueco que el compilador deja abierto: `{...} as ContextoUsuario`.
          // TypeScript permite la asercion porque ContextoUsuario SI es asignable
          // a { userId: string }, asi que los tipos "se solapan" lo suficiente.
          selector: "TSAsExpression > TSTypeReference > Identifier[name='ContextoUsuario']",
          message:
            "Prohibido castear a ContextoUsuario. Es el unico modo de falsificarlo " +
            "y por eso esta cerrado aqui. Un contexto SOLO sale de " +
            "exigirSesionParaLeer() o exigirSesionParaMutar().",
        },
        {
          // Crear contextos a mano fuera de auth.ts.
          selector:
            "CallExpression[callee.object.name='ContextoUsuario'][callee.property.name='desdeSesionVerificada']",
          message:
            "Solo `src/auth.ts` crea contextos, y despues de verificar la sesion " +
            "contra la base. En un test, `contextoDePrueba()`.",
        },
        {
          // HALLAZGO DEL ATAQUE ADVERSARIAL: `await import("@/lib/db/interno")`
          // esquivaba `no-restricted-imports`, que solo mira los imports
          // ESTÁTICOS. Un import dinámico llega al mismo módulo por la puerta
          // de atrás.
          selector:
            "ImportExpression > Literal[value=/db[/](interno|schema|ownership|cliente-test|contexto-pruebas)/]",
          message: "Un import dinamico no esquiva el contrato de datos. Usa `vaultDe(ctx)`.",
        },
        {
          // Y lo mismo para el driver a pelo.
          selector:
            "ImportExpression > Literal[value=/^(@neondatabase|pg|drizzle-orm[/](neon|node))/]",
          message: "Un import dinamico del driver tampoco esquiva el contrato. Usa `vaultDe(ctx)`.",
        },
      ],
    },
  },

  {
    // En los tests SI se puede fabricar un contexto y usar el cliente de
    // pruebas: para eso existen. Lo que NO se relaja es el casteo — un test que
    // falsifica un contexto no esta probando el sistema real.
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];

export default configuracion;
