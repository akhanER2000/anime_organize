import base from "./eslint.config.mjs";

/**
 * Config de `scripts/verificar-contrato.mjs`, y SOLO de él.
 *
 * `eslint.config.mjs` ignora `verificacion-contrato/` para que un `npm run
 * lint` ajeno no tropiece con los ficheros temporales del verificador. Aquí se
 * levanta **ese ignore y nada más**: las reglas son literalmente las mismas
 * porque se importa la configuración real y solo se filtra una entrada.
 *
 * Es deliberado que no haya reglas copiadas en este fichero: una copia se
 * desincroniza, y el día que se desincronizara el verificador diría «contrato
 * intacto» comprobando unas reglas que ya no son las que corren en CI.
 */
const CARPETA_TEMPORAL = "verificacion-contrato/**";

export default base.map((bloque) =>
  Array.isArray(bloque.ignores)
    ? { ...bloque, ignores: bloque.ignores.filter((patron) => patron !== CARPETA_TEMPORAL) }
    : bloque,
);
