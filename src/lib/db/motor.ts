/**
 * ¿Con qué clase de Postgres estamos hablando?
 *
 * NO lleva `server-only` a propósito: lo importan también los scripts de
 * `scripts/**`, que corren fuera de Next.
 *
 * ── POR QUÉ ESTO EXISTE ────────────────────────────────────────────────────
 *
 * Hay DOS clases de Postgres en este proyecto y no se hablan igual:
 *
 *   · **Neon** entiende su protocolo por WebSocket (`@neondatabase/serverless`)
 *     y su endpoint HTTP `https://<host>/sql`.
 *   · **Un Postgres normal** —el contenedor `postgres:18` de CI, o uno local—
 *     no entiende ninguno de los dos. Ahí se usa `pg`.
 *
 * La misma pregunta se estaba respondiendo en CUATRO sitios, y solo tres de
 * ellos la tenían. Las migraciones y la verificación del esquema fallaron en CI
 * durante veintiuna ejecuciones seguidas por esto exactamente: `cliente-test.ts`
 * sabía distinguirlos y los scripts no.
 *
 * Un concepto, un dueño. Si mañana Neon cambia de dominio, se cambia aquí.
 */
export function esNeon(cadena: string): boolean {
  return cadena.includes("neon.tech") || cadena.includes("neon.build");
}

/**
 * ¿Puede la APLICACIÓN usar esta base?
 *
 * No es la misma pregunta que `esNeon`, aunque hoy dé la misma respuesta, y por
 * eso tiene su propio nombre. Los scripts y los tests de integración pueden
 * hablar con cualquier Postgres porque eligen driver. **La aplicación no**:
 * `src/lib/db/interno.ts` usa el driver HTTP de Neon y no es configurable.
 *
 * Comprobado ejecutándolo: `neon("postgres://…@localhost:5432/…")` construye el
 * cliente SIN QUEJARSE y solo revienta en la primera consulta, con un
 * «fetch failed» que no menciona ni a Neon ni a HTTP. Por eso hace falta poder
 * preguntarlo ANTES, en vez de descubrirlo a mitad de un test.
 */
export function laAppPuedeUsar(cadena: string): boolean {
  return esNeon(cadena) || proxyHttpDeNeon() !== undefined;
}

/**
 * Endpoint HTTP alternativo para el driver de Neon, si lo hay.
 *
 * Existe por CI: delante del contenedor `postgres:18` corre un proxy que
 * habla el protocolo HTTP de Neon por un lado y Postgres por el otro. Con
 * esto, la APLICACIÓN arranca contra un Postgres normal **sin cambiar de
 * driver** — que es justo lo que hace que los tests sigan verificando lo
 * mismo que corre en producción, en vez de una variante.
 *
 * En producción esta variable NO existe, y entonces todo esto es un `if` que
 * no se cumple: el driver usa su endpoint de siempre, `https://<host>/sql`.
 */
export function proxyHttpDeNeon(): string | undefined {
  const valor = process.env.NEON_HTTP_PROXY;
  return valor !== undefined && valor.trim().length > 0 ? valor.trim() : undefined;
}
