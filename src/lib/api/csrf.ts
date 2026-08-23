/**
 * Protección CSRF para Route Handlers.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA ELECCIÓN DEL PROYECTO: **Server Actions para todo lo que muta estado de
 * cuenta.** Route Handlers solo para lo que necesita semántica HTTP de verdad
 * (binarios, subidas, descargas, procesos largos), y esos llevan esta guarda.
 *
 * POR QUÉ:
 *
 *  1. **Next comprueba el origen de las Server Actions por su cuenta.** Compara
 *     la cabecera `Origin` con el `Host` y rechaza si no casan. Es protección
 *     por defecto, sin código propio que se pueda olvidar en la ruta número 12.
 *  2. **Un Route Handler no tiene NADA de eso.** `POST /api/cuenta` con una
 *     cookie de sesión se ejecuta igual venga de donde venga.
 *  3. Cambiar contraseña, borrar cuenta y desvincular un proveedor **nacen de un
 *     formulario de la interfaz**, que es justo el caso para el que existen las
 *     Server Actions. No hay motivo para bajarlos a HTTP.
 *
 * La excepción práctica: el borrado de cuenta tiene que entregar un `.json` de
 * export ANTES de borrar. Se resuelve con la Server Action devolviendo los datos
 * y el cliente provocando la descarga, no con un `GET` que exponga el export.
 *
 * DEFENSA EN PROFUNDIDAD: las cookies de sesión de Auth.js son `SameSite=Lax`,
 * lo que ya bloquea el POST entre sitios en los navegadores actuales. Esto es la
 * segunda capa, no la única: `Lax` no cubre navegadores viejos ni algunos flujos
 * de subdominio.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Módulo PURO: recibe cabeceras y orígenes permitidos. Sin `server-only` para
 * poder testearlo, pero solo tiene sentido en el servidor.
 */

export type VeredictoCsrf =
  | { permitido: true }
  | { permitido: false; motivo: "SIN_ORIGEN" | "ORIGEN_NO_PERMITIDO" };

/** Métodos que mutan. `GET`/`HEAD`/`OPTIONS` no necesitan esta comprobación. */
const METODOS_QUE_MUTAN = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Normaliza a `esquema://host[:puerto]`, o `null` si no es una URL usable. */
function aOrigen(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = valor.trim();
  if (limpio.length === 0 || limpio === "null") return null;

  try {
    return new URL(limpio).origin;
  } catch {
    return null;
  }
}

/**
 * ¿Puede esta petición mutar estado?
 *
 * @param origenesPermitidos  normalmente `[AUTH_URL]`. En desarrollo se añade
 *                            el `localhost` del servidor.
 */
export function comprobarOrigen(peticion: {
  metodo: string;
  cabeceras: Headers;
  origenesPermitidos: readonly string[];
}): VeredictoCsrf {
  if (!METODOS_QUE_MUTAN.has(peticion.metodo.toUpperCase())) {
    return { permitido: true };
  }

  const permitidos = new Set(
    peticion.origenesPermitidos.map((o) => aOrigen(o)).filter((o): o is string => o !== null),
  );

  // `Origin` es la fuente principal: el navegador la envía en toda petición que
  // mute y el script de la página NO puede falsificarla.
  const origen = aOrigen(peticion.cabeceras.get("origin"));
  if (origen !== null) {
    return permitidos.has(origen)
      ? { permitido: true }
      : { permitido: false, motivo: "ORIGEN_NO_PERMITIDO" };
  }

  // Respaldo: `Referer`. Algunos clientes y configuraciones de privacidad
  // omiten `Origin`; el `Referer` lleva la URL completa y su origen sirve igual.
  const referer = aOrigen(peticion.cabeceras.get("referer"));
  if (referer !== null) {
    return permitidos.has(referer)
      ? { permitido: true }
      : { permitido: false, motivo: "ORIGEN_NO_PERMITIDO" };
  }

  // Sin ninguna de las dos NO se deja pasar.
  //
  // Es tentador permitirlo «porque algunos clientes legítimos no las mandan»,
  // y es justo el agujero: un formulario CSRF puede provocar una petición sin
  // `Origin` en escenarios concretos, y una API sin navegador no es nuestro caso
  // de uso. Fallar cerrado cuesta un `curl` incómodo; fallar abierto cuesta la
  // cuenta de un usuario.
  return { permitido: false, motivo: "SIN_ORIGEN" };
}

/**
 * Los orígenes que valen, a partir del entorno.
 *
 * En producción, solo `AUTH_URL`. En desarrollo se añaden los `localhost`
 * habituales, porque ahí `AUTH_URL` suele estar vacío.
 */
export function origenesPermitidos(entorno: {
  authUrl?: string | undefined;
  esProduccion: boolean;
}): string[] {
  const lista: string[] = [];

  const declarado = aOrigen(entorno.authUrl);
  if (declarado !== null) lista.push(declarado);

  if (!entorno.esProduccion) {
    lista.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return lista;
}
