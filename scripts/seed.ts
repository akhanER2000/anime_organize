/**
 * Carga inicial del vault: los 83 animes de `animes-seed.json` y sus portadas.
 *
 * TODAVÍA NO IMPLEMENTADO — es trabajo de la FASE 5 (importación).
 *
 * Este fichero existe para que `npm run seed` dé un mensaje claro en vez de un
 * `MODULE_NOT_FOUND`, y para que `npm run lint:scripts` no señale un script
 * declarado que apunta al vacío. Ver `.claude/commands/seed.md` para el contrato
 * completo que tendrá que cumplir.
 */
import { cargarEntorno } from "./cargar-entorno";

cargarEntorno();

console.error(
  [
    "",
    "  `npm run seed` todavía no está implementado.",
    "",
    "  Es trabajo de la FASE 5. Cuando exista, cargará los 83 animes de",
    "  animes-seed.json y descargará cada portada desde Drive por el mismo",
    "  pipeline que /api/covers, de forma idempotente.",
    "",
    "  El contrato está en .claude/commands/seed.md",
    "",
  ].join("\n"),
);

process.exit(1);
