/**
 * EL VACÍO DE LA TABLA — DESIGN-SPEC §6, fila «Fila de tabla», columna «vacío»:
 * «sin resultados» centrado.
 *
 * ── DOS VACÍOS, NO UNO ────────────────────────────────────────────────────
 *
 * «No tienes nada» y «este filtro no devuelve nada» son dos situaciones
 * distintas y necesitan dos salidas distintas: en la primera hay que añadir
 * series, en la segunda hay que quitar un chip. Un único mensaje genérico deja a
 * quien acaba de filtrar creyendo que ha perdido su vault.
 */
export function Vacio({ conFiltros }: { conFiltros: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-[var(--e-1-5)] px-[var(--e-3)] py-[var(--e-12)] text-center"
      role="status"
    >
      <h2 className="font-display text-titulo-l font-[var(--fw-display-light)] tracking-display text-[var(--porcelain-050)]">
        {conFiltros ? "Sin resultados" : "Tu vault está vacío"}
      </h2>

      <p className="max-w-[46ch] font-ui text-cuerpo-s leading-cuerpo text-[var(--porcelain-200)]">
        {conFiltros
          ? "Ninguna serie de tu vault cumple estos filtros. Quita alguno de los chips de arriba para ver más."
          : "Todavía no has añadido ninguna serie. Cuando lo hagas, aparecerán aquí con su portada, su estado y su progreso."}
      </p>
    </div>
  );
}
