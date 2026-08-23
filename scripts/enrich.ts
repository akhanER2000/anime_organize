/**
 * Enriquecimiento masivo: AniList + Claude.
 *
 * TODAVÍA NO IMPLEMENTADO — es trabajo de la FASE 4.
 *
 * Este fichero existe para que `npm run enrich` dé un mensaje claro en vez de un
 * `MODULE_NOT_FOUND`, y para que `npm run lint:scripts` no señale un script
 * declarado que apunta al vacío. Ver `.claude/commands/enrich.md` para el
 * contrato completo.
 */
import { cargarEntorno } from "./cargar-entorno";

cargarEntorno();

console.error(
  [
    "",
    "  `npm run enrich` todavía no está implementado.",
    "",
    "  Es trabajo de la FASE 4. Cuando exista, hará el pipeline de dos pasos:",
    "  AniList (público, sin clave) y Claude (opcional; sin ANTHROPIC_API_KEY",
    "  el paso 2 se salta con aviso y el paso 1 sigue funcionando).",
    "",
    "  El contrato está en .claude/commands/enrich.md",
    "",
  ].join("\n"),
);

process.exit(1);
