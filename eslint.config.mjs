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
];

export default configuracion;
