import { describe, expect, it } from "vitest";

import { clavePorEmail, clavePorIp, clavePorUsuario } from "./claves";
import { claveBienFormada, registrarIntento } from "./index";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CLAVE TIENE QUE LLEVAR EL NOMBRE DEL LÍMITE.
 *
 * El fallo real: tres rutas nuevas pasaron `sesion.userId` pelado como clave.
 * No da error, no rompe nada visible y **junta en un solo cubo los tres
 * límites `*:user` de la misma persona**: importar una hoja le gastaba el
 * presupuesto de enriquecer y el de comprobar espejos.
 *
 * El efecto observable de cada ruta por separado es idéntico al correcto, así
 * que ningún test de esas rutas podía verlo. Lo destapó el helper del e2e que
 * vacía el cubo de importación: buscaba claves `import:%` y la tabla sólo tenía
 * uuids pelados.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("la forma de la clave", () => {
  it("rechaza una clave que no lleva el nombre del límite delante", async () => {
    await expect(
      registrarIntento("import:user", "8a7f2c31-0000-4000-8000-000000000000"),
    ).rejects.toThrow(/debe tener la forma/);
  });

  it("acepta un CUBO PROPIO con la política de otro, que es un uso legítimo", () => {
    // `/recuperar/nueva` aplica la política `recuperar:ip` a su propio cubo,
    // `recuperar-nueva:ip:<ip>`, para no compartir contador con «pedir el
    // enlace». La primera versión de la guarda lo rompía con un 500 y lo cazó
    // el recorrido en navegador del restablecimiento.
    //
    // Se comprueba contra `claveBienFormada` y NO contra `registrarIntento`:
    // este es el caso que la guarda ACEPTA, y aceptar significa seguir hasta
    // el insert. La versión anterior de este test llamaba a `registrarIntento`
    // y por eso pasaba en local —donde `DATABASE_URL` es un Neon real— y
    // reventaba en CI contra el contenedor. Era un test unitario con una
    // dependencia de base escondida; el rechazo de abajo sí puede seguir
    // yendo por `registrarIntento`, porque lanza antes de tocar nada.
    expect(claveBienFormada(clavePorIp("recuperar-nueva", "1.2.3.4"))).toBe(true);
  });

  it("acepta la que componen los constructores de `claves.ts`", () => {
    // No se ejecuta contra la base: sólo se comprueba que la forma cumple el
    // contrato que la guarda exige. Los tres constructores, por si alguno
    // cambiara de formato sin que nadie mirara esta relación.
    expect(clavePorUsuario("import:user", "u1").startsWith("import:user:")).toBe(true);
    expect(clavePorEmail("login:email", "a@b.test").startsWith("login:email:")).toBe(true);
    expect(clavePorIp("registro:ip", "1.2.3.4").startsWith("registro:ip:")).toBe(true);
  });
});
