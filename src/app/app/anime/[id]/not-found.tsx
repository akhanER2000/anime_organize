import { Pantalla404 } from "@/components/layout/pantalla-404";

import { PADDING_LATERAL } from "./medidas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 404 DE LA FICHA — artboard 11, celda «404».
 *
 * El aspecto lo pone `Pantalla404`, que es de donde salen también el 404 global
 * y cualquier otro que haga falta. Lo que vive aquí es **el texto**, y vive
 * aquí porque no es intercambiable con el de los demás.
 *
 * Lo pinta Next cuando `page.tsx` llama a `notFound()`, y la respuesta lleva
 * **status 404 de verdad**. Se llega por dos caminos que son INDISTINGUIBLES a
 * propósito (`security.md` §1):
 *
 *   · el anime no existe;
 *   · el anime existe y es **de otra persona**.
 *
 * Un 403 —o un texto distinto para cada caso, que es la misma fuga escrita en
 * español— confirmaría la existencia del recurso, y con eso se enumera el vault
 * ajeno un uuid cada vez. Por eso el texto no dice «no es tuyo» ni «no existe»:
 * dice que aquí no hay nada, que es lo único cierto en los dos casos.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export default function FichaNoEncontrada() {
  return (
    <Pantalla404 titular="Aquí no hay nada" className={PADDING_LATERAL}>
      Ese anime no está en tu vault. Puede que lo hayas borrado, que la dirección esté mal copiada,
      o que nunca haya existido.
    </Pantalla404>
  );
}
