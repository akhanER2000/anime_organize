import { describe, expect, it } from "vitest";

import { clavePorEmail, clavePorIp, clavePorUsuario, ipDelCliente } from "./claves";
import {
  LIMITES,
  evaluar,
  inicioVentana,
  solapamiento,
  ventanaAnterior,
  type Limite,
} from "./politica";

const LIMITE: Limite = { maximo: 5, ventanaMs: 15 * 60_000 };

describe("ventanas", () => {
  it("trunca el inicio al tamaño de ventana", () => {
    const inicio = inicioVentana(new Date("2026-08-23T12:07:33.500Z"), 15 * 60_000);
    expect(inicio.toISOString()).toBe("2026-08-23T12:00:00.000Z");
  });

  it("dos momentos de la misma ventana comparten inicio", () => {
    const a = inicioVentana(new Date("2026-08-23T12:00:01Z"), 15 * 60_000);
    const b = inicioVentana(new Date("2026-08-23T12:14:59Z"), 15 * 60_000);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("la ventana anterior está exactamente un tamaño atrás", () => {
    const inicio = new Date("2026-08-23T12:15:00Z");
    expect(ventanaAnterior(inicio, 15 * 60_000).toISOString()).toBe("2026-08-23T12:00:00.000Z");
  });
});

describe("solapamiento con la ventana anterior", () => {
  it("al empezar la ventana, la anterior cuenta entera", () => {
    const inicio = new Date("2026-08-23T12:00:00Z");
    expect(solapamiento(inicio, inicio, 15 * 60_000)).toBe(1);
  });

  it("a mitad de ventana, la anterior cuenta la mitad", () => {
    const inicio = new Date("2026-08-23T12:00:00Z");
    const mitad = new Date("2026-08-23T12:07:30Z");
    expect(solapamiento(mitad, inicio, 15 * 60_000)).toBeCloseTo(0.5, 5);
  });

  it("al final de la ventana, la anterior ya no cuenta", () => {
    const inicio = new Date("2026-08-23T12:00:00Z");
    const fin = new Date("2026-08-23T12:15:00Z");
    expect(solapamiento(fin, inicio, 15 * 60_000)).toBe(0);
  });

  it("nunca sale del rango [0,1] aunque el reloj se vaya", () => {
    const inicio = new Date("2026-08-23T12:00:00Z");
    expect(solapamiento(new Date("2026-08-23T11:00:00Z"), inicio, 15 * 60_000)).toBe(1);
    expect(solapamiento(new Date("2026-08-23T23:00:00Z"), inicio, 15 * 60_000)).toBe(0);
  });
});

describe("decisión dentro de una ventana", () => {
  const inicio = new Date("2026-08-23T12:00:00Z");
  const ahora = new Date("2026-08-23T12:05:00Z");

  it("permite mientras no se supera el máximo", () => {
    const v = evaluar({ limite: LIMITE, contadorActual: 3, contadorAnterior: 0, ahora, inicio });

    expect(v.permitido).toBe(true);
    expect(v.restantes).toBe(2);
    expect(v.reintentarEnSegundos).toBe(0);
  });

  it("permite justo en el máximo", () => {
    const v = evaluar({ limite: LIMITE, contadorActual: 5, contadorAnterior: 0, ahora, inicio });
    expect(v.permitido).toBe(true);
    expect(v.restantes).toBe(0);
  });

  it("bloquea al pasarse", () => {
    const v = evaluar({ limite: LIMITE, contadorActual: 6, contadorAnterior: 0, ahora, inicio });

    expect(v.permitido).toBe(false);
    expect(v.restantes).toBe(0);
    expect(v.reintentarEnSegundos).toBeGreaterThan(0);
  });

  it("Retry-After nunca es 0 cuando se bloquea", () => {
    // Un Retry-After de 0 invita a reintentar de inmediato, que es justo lo que
    // no queremos.
    const casiFin = new Date("2026-08-23T12:14:59.900Z");
    const v = evaluar({
      limite: LIMITE,
      contadorActual: 99,
      contadorAnterior: 0,
      ahora: casiFin,
      inicio,
    });

    expect(v.permitido).toBe(false);
    expect(v.reintentarEnSegundos).toBeGreaterThanOrEqual(1);
  });
});

describe("EL BORDE DE VENTANA · lo que arregla la ventana deslizante", () => {
  it("una ventana fija dejaría pasar el doble en el borde", () => {
    // Escenario: 5 intentos al final de la ventana anterior, y 5 más justo al
    // empezar la siguiente. Con ventana FIJA eso son 10 intentos en segundos.
    const inicio = new Date("2026-08-23T12:15:00Z");
    const reciénEmpezada = new Date("2026-08-23T12:15:01Z");

    const v = evaluar({
      limite: LIMITE,
      contadorActual: 1,
      contadorAnterior: 5, // se agotó la ventana anterior
      ahora: reciénEmpezada,
      inicio,
    });

    // La anterior cuenta casi entera, así que ya se está por encima del máximo.
    expect(v.permitido).toBe(false);
  });

  it("pero a mitad de la ventana siguiente, la anterior pesa menos", () => {
    const inicio = new Date("2026-08-23T12:15:00Z");
    const mitad = new Date("2026-08-23T12:22:30Z");

    // 5 anteriores * 0.5 = 2.5, más 2 actuales = 4.5 <= 5
    const v = evaluar({
      limite: LIMITE,
      contadorActual: 2,
      contadorAnterior: 5,
      ahora: mitad,
      inicio,
    });

    expect(v.permitido).toBe(true);
  });

  it("el cupo disponible CRECE conforme la ventana anterior envejece", () => {
    // Con 5 gastados en la ventana anterior, cuánto cabe ahora depende de lo que
    // haya avanzado la actual. Es el comportamiento que distingue a la ventana
    // deslizante de la fija.
    const inicio = new Date("2026-08-23T12:15:00Z");
    const enMomento = (iso: string, actual: number) =>
      evaluar({
        limite: LIMITE,
        contadorActual: actual,
        contadorAnterior: 5,
        ahora: new Date(iso),
        inicio,
      }).permitido;

    // Recién empezada: la anterior cuenta casi entera, no cabe casi nada.
    expect(enMomento("2026-08-23T12:15:01Z", 1)).toBe(false);
    // A mitad: la anterior pesa 2,5, caben ~2 más.
    expect(enMomento("2026-08-23T12:22:30Z", 2)).toBe(true);
    expect(enMomento("2026-08-23T12:22:30Z", 3)).toBe(false);
    // Casi al final: la anterior ya casi no pesa, caben 4.
    expect(enMomento("2026-08-23T12:29:59Z", 4)).toBe(true);
  });

  it("un residuo mínimo de la ventana anterior aún cuenta", () => {
    // A un segundo del final, la anterior pesa 0,1 %: 5*0.0011 + 5 = 5,0055 > 5.
    // No es un fallo del cálculo, es que la ventana deslizante no perdona el
    // borde. Se documenta porque a primera vista parece un off-by-one.
    const inicio = new Date("2026-08-23T12:15:00Z");
    const v = evaluar({
      limite: LIMITE,
      contadorActual: 5,
      contadorAnterior: 5,
      ahora: new Date("2026-08-23T12:29:59Z"),
      inicio,
    });

    expect(v.permitido).toBe(false);
    expect(v.usado).toBeGreaterThan(5);
    expect(v.usado).toBeLessThan(5.1);
  });

  it("sin nada en la ventana anterior, el cupo es el máximo limpio", () => {
    const inicio = new Date("2026-08-23T12:15:00Z");
    const v = evaluar({
      limite: LIMITE,
      contadorActual: 5,
      contadorAnterior: 0,
      ahora: new Date("2026-08-23T12:15:01Z"),
      inicio,
    });

    expect(v.permitido).toBe(true);
    expect(v.usado).toBe(5);
  });
});

describe("los límites del proyecto", () => {
  it("login se limita por IP Y por email por separado", () => {
    // Solo por email: un atacante barre muchas cuentas desde una IP.
    // Solo por IP: la fuerza bruta distribuida contra una cuenta pasa.
    expect(LIMITES["login:email"]).toBeDefined();
    expect(LIMITES["login:ip"]).toBeDefined();
  });

  it("el límite por email es más estricto que el de IP", () => {
    // Una IP puede ser una oficina entera compartiendo salida; un email es una
    // sola cuenta.
    expect(LIMITES["login:email"].maximo).toBeLessThan(LIMITES["login:ip"].maximo);
  });

  it("las acciones de auth del encargo están cubiertas", () => {
    for (const clave of [
      "login:email",
      "registro:ip",
      "recuperar:email",
      "reenviar-verificacion:email",
    ] as const) {
      expect(LIMITES[clave]).toBeDefined();
    }
  });

  it("ningún límite es absurdo", () => {
    for (const [nombre, limite] of Object.entries(LIMITES)) {
      expect(limite.maximo, nombre).toBeGreaterThan(0);
      expect(limite.ventanaMs, nombre).toBeGreaterThanOrEqual(60_000);
    }
  });
});

describe("claves · el email no se guarda en claro", () => {
  it("la clave por email va hasheada", () => {
    const clave = clavePorEmail("login", "yo@ejemplo.test");

    // La tabla no puede ser un censo de direcciones registradas.
    expect(clave).not.toContain("yo@ejemplo.test");
    expect(clave).not.toContain("ejemplo");
    expect(clave).toMatch(/^login:email:[0-9a-f]{32}$/);
  });

  it("el mismo email da siempre la misma clave", () => {
    expect(clavePorEmail("login", "a@b.test")).toBe(clavePorEmail("login", "a@b.test"));
  });

  it("mayúsculas y espacios NO permiten saltarse el límite", () => {
    // users.email es citext: para la base son la misma cuenta, y el limitador
    // tiene que coincidir con eso o se salta escribiendo A@B.test.
    const base = clavePorEmail("login", "a@b.test");

    expect(clavePorEmail("login", "A@B.TEST")).toBe(base);
    expect(clavePorEmail("login", "  a@b.test  ")).toBe(base);
  });

  it("dos emails distintos dan claves distintas", () => {
    expect(clavePorEmail("login", "a@b.test")).not.toBe(clavePorEmail("login", "c@d.test"));
  });

  it("acciones distintas no comparten cubo", () => {
    expect(clavePorEmail("login", "a@b.test")).not.toBe(clavePorEmail("recuperar", "a@b.test"));
  });

  it("la IP sí va en claro: sirve para diagnosticar un ataque", () => {
    expect(clavePorIp("login", "203.0.113.7")).toBe("login:ip:203.0.113.7");
  });

  it("la clave por usuario lleva el uuid", () => {
    expect(clavePorUsuario("covers", "abc-123")).toBe("covers:user:abc-123");
  });
});

describe("ipDelCliente · orden de preferencia por fiabilidad", () => {
  it("x-vercel-forwarded-for gana sobre todas", () => {
    // Es la única que Vercel NO deja sobrescribir aunque el usuario ponga otro
    // proxy por delante.
    const h = new Headers({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-real-ip": "10.0.0.1",
      "x-forwarded-for": "1.2.3.4",
    });

    expect(ipDelCliente(h)).toBe("203.0.113.7");
  });

  it("x-real-ip gana sobre x-forwarded-for", () => {
    const h = new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" });
    expect(ipDelCliente(h)).toBe("203.0.113.7");
  });

  it("x-forwarded-for es el último recurso", () => {
    expect(ipDelCliente(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("de x-forwarded-for toma la primera entrada", () => {
    // OJO CON EL PORQUÉ: no es que la primera sea "la buena" en general —en una
    // cadena real de proxies la primera es justo la que el cliente puede
    // falsificar—. Es aceptable aquí SOLO porque Vercel reescribe la cabecera y
    // no reenvía valores externos, así que llega con un único valor.
    // Fuera de Vercel hay que revisar esta función.
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(ipDelCliente(h)).toBe("203.0.113.7");
  });

  it("x-vercel-forwarded-for con varias entradas también toma la primera", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "203.0.113.7, 70.41.3.18" });
    expect(ipDelCliente(h)).toBe("203.0.113.7");
  });

  it("devuelve null si no hay cabecera, en vez de inventar un cubo común", () => {
    // Un "desconocido" compartido haría que todos los clientes sin cabecera se
    // bloqueasen entre sí.
    expect(ipDelCliente(new Headers())).toBeNull();
  });

  it.each([
    ["x-vercel-forwarded-for", "   "],
    ["x-real-ip", "   "],
    ["x-forwarded-for", "   "],
  ])("una %s vacía no cuenta como IP", (cabecera, valor) => {
    expect(ipDelCliente(new Headers({ [cabecera]: valor }))).toBeNull();
  });

  it("si la de Vercel viene vacía, se cae a la siguiente", () => {
    const h = new Headers({ "x-vercel-forwarded-for": "  ", "x-real-ip": "203.0.113.7" });
    expect(ipDelCliente(h)).toBe("203.0.113.7");
  });
});
