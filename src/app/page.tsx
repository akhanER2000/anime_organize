/**
 * Marcador de posición de la landing. La landing real es la FASE 6
 * (artboard 02). Existe ahora para que `npm run build` tenga una ruta que
 * compilar y para verificar el cableado de tokens y fuentes.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-[var(--contenedor-max)] px-[var(--gutter-l)] py-[var(--e-12)]">
      <p className="font-ui text-etiqueta font-[600] uppercase tracking-etiqueta text-gold-300">
        Fase 1 · cimientos
      </p>

      <h1 className="mt-[var(--e-3)] font-display text-display-l text-porcelain-050">
        Anime Vault
      </h1>

      <div
        className="mt-[var(--e-5)] h-px w-full bg-[image:var(--veta-horizontal)]"
        style={{ boxShadow: "var(--halo-veta)" }}
        aria-hidden="true"
      />

      <p className="mt-[var(--e-5)] max-w-[640px] font-ui text-cuerpo-l leading-cuerpo-l text-porcelain-200">
        Obsidiana y oro. Una losa de laja negra partida y reparada con kintsugi: el oro es la
        reparación, no el relleno.
      </p>

      <p className="mt-[var(--e-3)] font-mono text-mono text-ash-400">
        Esquema, migraciones y autenticación en construcción.
      </p>
    </main>
  );
}
