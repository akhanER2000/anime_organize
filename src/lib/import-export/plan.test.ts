import { describe, expect, it } from "vitest";

import { normalizarTitulo } from "@/lib/domain/normalizar";

import { planificar, resumirPlan } from "./plan";

import type { FilaLeida } from "./mapeo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL PLAN: QUÉ SE VA A ESCRIBIR, ANTES DE ESCRIBIRLO.
 *
 * ── LA REGLA CRÍTICA DE LA SKILL §2, Y POR QUÉ ES CRÍTICA ───────────────
 *
 * «Los procesos por lotes (seed, importación) bloquean **SOLO** por
 * coincidencia exacta y por `anilist_id`. **Nunca por similitud**: si el seed
 * descartara por trigram, tiraría los tres *Higurashi* legítimos.»
 *
 * No es una preferencia de umbral: los tres *Higurashi* y los dos *White Album*
 * están en la lista del dueño **a propósito** y son series distintas. Una
 * importación que los colapse le borra datos suyos sin preguntar, y él sólo lo
 * descubre cuando echa uno de menos.
 *
 * La similitud es para el flujo interactivo, donde hay una persona decidiendo.
 * Aquí no la hay: hay 300 filas y un botón.
 *
 * ── Y EL DUPLICADO DENTRO DEL PROPIO FICHERO ────────────────────────────
 *
 * `testing.md` nivel 2 lo pide explícitamente. Una hoja con la misma serie dos
 * veces no puede intentar insertarla dos veces: la segunda chocaría contra el
 * `UNIQUE` y la importación acabaría con un error que no es culpa de nadie.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fila = (titulo: string, extra: Partial<FilaLeida> = {}): FilaLeida => ({
  titulo,
  estado: "PENDIENTE",
  progreso: null,
  notas: null,
  esFavorito: false,
  portada: null,
  enlace: null,
  errores: [],
  avisos: [],
  ...extra,
});

describe("planificar", () => {
  it("una fila nueva se marca como NUEVA y viene seleccionada", () => {
    const plan = planificar([fila("Monster")], new Set());

    expect(plan[0]?.veredicto).toBe("NUEVA");
    // Seleccionada por defecto: el caso normal es querer importarlas todas.
    expect(plan[0]?.seleccionada).toBe(true);
  });

  it("una que YA está en el vault se marca DUPLICADA y viene deseleccionada", () => {
    const plan = planificar([fila("Monster")], new Set([normalizarTitulo("Monster")]));

    expect(plan[0]?.veredicto).toBe("DUPLICADA");
    expect(plan[0]?.seleccionada).toBe(false);
  });

  it("la coincidencia es por título NORMALIZADO, no por texto literal", () => {
    // `MONSTER  ` y `Monster` son el mismo anime para el `UNIQUE` de la base.
    const plan = planificar([fila("MONSTER  ")], new Set([normalizarTitulo("Monster")]));

    expect(plan[0]?.veredicto).toBe("DUPLICADA");
  });

  it("LOS TRES HIGURASHI SOBREVIVEN: no se bloquea por similitud", () => {
    const filas = [
      fila("Higurashi no Naku Koro Ni"),
      fila("Higurashi no Naku Koro ni (2020)"),
      fila("Higurashi no Naku Koro ni Sotsu"),
    ];

    const plan = planificar(filas, new Set());

    // Los tres normalizan distinto y los tres entran. Con un filtro por trigram
    // al 0.55 —el del flujo interactivo— dos de ellos se perderían.
    expect(plan.map((p) => p.veredicto)).toEqual(["NUEVA", "NUEVA", "NUEVA"]);
  });

  it("y los dos White Album también", () => {
    const plan = planificar([fila("White Album"), fila("White Album 2")], new Set());

    expect(plan.map((p) => p.veredicto)).toEqual(["NUEVA", "NUEVA"]);
  });

  it("una serie repetida DENTRO del fichero: la primera entra, la segunda no", () => {
    const plan = planificar([fila("Monster"), fila("  monster ")], new Set());

    expect(plan[0]?.veredicto).toBe("NUEVA");
    expect(plan[1]?.veredicto).toBe("REPETIDA_EN_EL_FICHERO");
    expect(plan[1]?.seleccionada).toBe(false);
    // Y se dice CUÁL era la primera POR EL NÚMERO QUE EL USUARIO VE en su
    // hoja: la primera fila de datos es la 2, porque la 1 es la cabecera.
    expect(plan[1]?.motivo).toContain("fila 2");
  });

  it("una fila con errores de lectura se marca ERROR y no se puede seleccionar", () => {
    const plan = planificar([fila("", { errores: ["Falta el título"] })], new Set());

    expect(plan[0]?.veredicto).toBe("ERROR");
    expect(plan[0]?.seleccionada).toBe(false);
    expect(plan[0]?.motivo).toContain("Falta el título");
  });

  it("una fila con errores NO ocupa sitio en la deduplicación del fichero", () => {
    // Si una fila sin título contara como «ya visto», la siguiente fila sin
    // título se marcaría repetida en vez de errónea, y el reporte mentiría.
    const plan = planificar(
      [fila("", { errores: ["Falta el título"] }), fila("", { errores: ["Falta el título"] })],
      new Set(),
    );

    expect(plan.map((p) => p.veredicto)).toEqual(["ERROR", "ERROR"]);
  });

  it("conserva el número de fila de la HOJA, contando la cabecera", () => {
    // El usuario va a abrir su Excel y buscar la fila. Si le decimos «fila 1»
    // cuando en su pantalla es la 2, el reporte no sirve para nada.
    const plan = planificar([fila("A"), fila("B")], new Set());

    expect(plan[0]?.filaDeLaHoja).toBe(2);
    expect(plan[1]?.filaDeLaHoja).toBe(3);
  });

  it("los avisos viajan con la fila, sin impedir la importación", () => {
    const plan = planificar([fila("A", { avisos: ["estado «raro» no reconocido"] })], new Set());

    expect(plan[0]?.veredicto).toBe("NUEVA");
    expect(plan[0]?.avisos).toEqual(["estado «raro» no reconocido"]);
  });
});

describe("resumirPlan", () => {
  it("cuenta cada clase por separado", () => {
    const plan = planificar(
      [
        fila("Nueva uno"),
        fila("Nueva dos"),
        fila("Monster"),
        fila("Nueva uno"),
        fila("", { errores: ["Falta el título"] }),
      ],
      new Set([normalizarTitulo("Monster")]),
    );

    expect(resumirPlan(plan)).toEqual({
      total: 5,
      nuevas: 2,
      duplicadas: 1,
      repetidas: 1,
      errores: 1,
      seleccionadas: 2,
    });
  });

  it("el recuento de seleccionadas sigue a lo que el usuario haya tocado", () => {
    const plan = planificar([fila("A"), fila("B")], new Set());
    const conUnaFuera = plan.map((p, i) => (i === 0 ? { ...p, seleccionada: false } : p));

    expect(resumirPlan(conUnaFuera).seleccionadas).toBe(1);
  });
});
