import { describe, expect, it } from "vitest";

import { esIpPrivada } from "./ip-privada";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CASO POR BYPASS CONOCIDO — `.claude/rules/testing.md` Nivel 1.
 *
 * Esto es lógica pura, así que cada caso cuesta cero y no hay excusa para no
 * cubrirlos todos. Lo que decide esta función es si el servidor va a conectarse
 * a la red interna, y ahí un falso negativo no es un bug: es una filtración.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("esIpPrivada · lo que hay que BLOQUEAR", () => {
  const BLOQUEADAS = [
    // El propio servidor
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "todo el 127/8, no solo el .0.1"],
    ["::1", "loopback IPv6"],
    ["0.0.0.0", "«esta red» — en Linux resuelve a localhost"],
    ["0.1.2.3", "todo el 0/8"],

    // EL objetivo de un SSRF en la nube
    ["169.254.169.254", "metadata de AWS/GCP: devuelve CREDENCIALES"],
    ["169.254.1.1", "todo el enlace local"],

    // Redes privadas
    ["10.0.0.1", "privada 10/8"],
    ["10.255.255.254", "el otro extremo del 10/8"],
    ["172.16.0.1", "privada 172.16/12 · primer octeto del rango"],
    ["172.31.255.254", "privada 172.16/12 · último octeto del rango"],
    ["192.168.1.1", "privada 192.168/16"],
    ["100.64.0.1", "CGNAT: la red del operador"],

    // Rangos especiales
    ["198.18.0.1", "banco de pruebas de rendimiento"],
    ["192.0.0.1", "asignaciones especiales de IETF"],
    ["224.0.0.1", "multicast"],
    ["255.255.255.255", "broadcast"],

    // IPv4 disfrazada de IPv6 — el bypass que más se olvida
    ["::ffff:127.0.0.1", "loopback mapeado a IPv6"],
    ["::ffff:169.254.169.254", "el metadata, mapeado a IPv6"],
    ["::ffff:10.0.0.1", "privada mapeada a IPv6"],

    // IPv6 interna
    ["fc00::1", "únicas locales fc00::/7"],
    ["fd12:3456::1", "únicas locales, el otro prefijo"],
    ["fe80::1", "enlace local"],
    ["ff02::1", "multicast IPv6"],
    ["::", "sin especificar"],

    // Basura: ante la duda, fuera
    ["", "cadena vacía"],
    ["   ", "solo espacios"],
    ["no-es-una-ip", "texto"],
    ["999.999.999.999", "octetos imposibles"],
    ["1.2.3", "faltan octetos"],
    ["0177.0.0.1", "notación octal — algunos resolutores la aceptan"],
    ["2130706433", "127.0.0.1 en decimal · no es una IP válida para nosotros"],
  ] as const;

  it.each(BLOQUEADAS)("bloquea %s (%s)", (ip) => {
    expect(esIpPrivada(ip)).toBe(true);
  });
});

describe("esIpPrivada · lo que NO puede bloquear", () => {
  const PERMITIDAS = [
    ["8.8.8.8", "Google DNS"],
    ["1.1.1.1", "Cloudflare"],
    ["142.250.185.14", "un servidor real de Google"],
    ["172.15.255.255", "JUSTO por debajo del 172.16/12"],
    ["172.32.0.1", "JUSTO por encima del 172.16/12"],
    ["11.0.0.1", "justo por encima del 10/8"],
    ["9.255.255.255", "justo por debajo del 10/8"],
    ["100.63.255.255", "justo por debajo del CGNAT"],
    ["100.128.0.1", "justo por encima del CGNAT"],
    ["126.255.255.255", "justo por debajo del 127/8"],
    ["128.0.0.1", "justo por encima del 127/8"],
    ["169.253.255.255", "justo por debajo del enlace local"],
    ["169.255.0.1", "justo por encima del enlace local"],
    ["2001:4860:4860::8888", "Google DNS por IPv6"],
  ] as const;

  it.each(PERMITIDAS)("permite %s (%s)", (ip) => {
    // El control positivo, y es imprescindible: una función que devolviera
    // `true` siempre pasaría el bloque de arriba entero y rompería la
    // aplicación sin que ningún test se enterara.
    expect(esIpPrivada(ip)).toBe(false);
  });

  it("los BORDES exactos de cada rango caen del lado correcto", () => {
    // Un `<=` donde tocaba `<` deja pasar una dirección interna, o bloquea una
    // pública. Los bordes son donde vive ese error.
    expect(esIpPrivada("10.0.0.0")).toBe(true);
    expect(esIpPrivada("10.255.255.255")).toBe(true);
    expect(esIpPrivada("9.255.255.255")).toBe(false);
    expect(esIpPrivada("11.0.0.0")).toBe(false);

    expect(esIpPrivada("172.16.0.0")).toBe(true);
    expect(esIpPrivada("172.31.255.255")).toBe(true);
    expect(esIpPrivada("172.15.255.255")).toBe(false);
    expect(esIpPrivada("172.32.0.0")).toBe(false);
  });
});
