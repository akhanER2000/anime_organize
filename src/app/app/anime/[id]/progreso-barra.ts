/**
 * La regla del relleno y de la etiqueta viven en `@/lib/domain/progreso`.
 *
 * Estaban aquí, en la carpeta de UNA pantalla, y por eso las otras dos no
 * podían usarlas: pasaban `null` a mano y pintaban la pista vacía. 69 de 83
 * barras salían sin relleno teniendo el dato en la base.
 *
 * Este fichero se conserva solo como puerta para no reescribir los imports de
 * la ficha; el dueño es `domain/`.
 */
export {
  etiquetaDeProgreso,
  rellenoDeBarra,
  rellenoDeFila,
  type ProgresoDeFicha,
  type TotalesDelAnime,
} from "@/lib/domain/progreso";
