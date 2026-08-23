/**
 * Política de rate limiting: los límites y el cálculo de ventanas.
 *
 * Módulo PURO: aquí vive toda la aritmética, para poder testear el
 * comportamiento de las ventanas sin base de datos ni relojes reales.
 *
 * ALGORITMO: ventana deslizante aproximada por dos contadores.
 *
 *   Una ventana FIJA («5 intentos cada 15 min») permite el doble en el borde: 5
 *   a las 14:59 y 5 más a las 15:01 son 10 intentos en dos minutos. Contar
 *   también la ventana anterior, ponderada por lo que queda de ella, cierra ese
 *   agujero sin guardar una fila por intento:
 *
 *     usado = contadorAnterior * solapamiento + contadorActual
 *
 *   Es la aproximación estándar; cuesta lo mismo (una fila por ventana) y no
 *   deja el borde abierto.
 */

export type Limite = {
  /** Peticiones permitidas por ventana. */
  maximo: number;
  /** Tamaño de la ventana en milisegundos. */
  ventanaMs: number;
};

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * Los límites del proyecto, en un solo sitio.
 *
 * Vienen de `.claude/rules/security.md` §5. Cada acción se limita por DOS claves
 * independientes cuando aplica —IP y email— porque protegen de cosas distintas:
 *
 *   · por EMAIL  → frena la fuerza bruta contra UNA cuenta concreta, aunque el
 *                  atacante rote direcciones IP (que es barato).
 *   · por IP     → frena el barrido de MUCHAS cuentas desde un mismo origen, y
 *                  el registro masivo de cuentas basura.
 *
 * Limitar solo por email deja pasar el barrido; limitar solo por IP deja pasar
 * la fuerza bruta distribuida. Hacen falta los dos.
 */
export const LIMITES = {
  "login:ip": { maximo: 20, ventanaMs: 15 * MINUTO },
  "login:email": { maximo: 5, ventanaMs: 15 * MINUTO },

  "registro:ip": { maximo: 5, ventanaMs: HORA },

  "recuperar:ip": { maximo: 10, ventanaMs: HORA },
  "recuperar:email": { maximo: 3, ventanaMs: HORA },

  "reenviar-verificacion:ip": { maximo: 10, ventanaMs: HORA },
  "reenviar-verificacion:email": { maximo: 3, ventanaMs: HORA },

  "covers:user": { maximo: 30, ventanaMs: HORA },
  "enrich:user": { maximo: 60, ventanaMs: HORA },
  "enrich-batch:user": { maximo: 2, ventanaMs: HORA },
  "import:user": { maximo: 5, ventanaMs: HORA },
  "borrar-cuenta:user": { maximo: 3, ventanaMs: HORA },
  "comprobar-espejos:user": { maximo: 10, ventanaMs: HORA },
} as const satisfies Record<string, Limite>;

export type NombreLimite = keyof typeof LIMITES;

/** Inicio de la ventana que contiene `ahora`, truncado al tamaño de ventana. */
export function inicioVentana(ahora: Date, ventanaMs: number): Date {
  return new Date(Math.floor(ahora.getTime() / ventanaMs) * ventanaMs);
}

/** La ventana inmediatamente anterior. */
export function ventanaAnterior(inicio: Date, ventanaMs: number): Date {
  return new Date(inicio.getTime() - ventanaMs);
}

/**
 * Fracción de la ventana anterior que todavía cuenta, en [0, 1].
 *
 * Justo al empezar una ventana nueva vale ~1 (la anterior cuenta entera); al
 * final vale ~0 (ya no cuenta).
 */
export function solapamiento(ahora: Date, inicio: Date, ventanaMs: number): number {
  const transcurrido = ahora.getTime() - inicio.getTime();
  const fraccion = 1 - transcurrido / ventanaMs;
  return Math.min(1, Math.max(0, fraccion));
}

export type Veredicto = {
  permitido: boolean;
  /** Cuántas peticiones quedan (nunca negativo). */
  restantes: number;
  /** Segundos que hay que esperar. Para la cabecera `Retry-After`. */
  reintentarEnSegundos: number;
  /** Consumo estimado en la ventana deslizante. */
  usado: number;
};

/**
 * Decide con los dos contadores ya leídos.
 *
 * @param contadorActual    peticiones en la ventana en curso, INCLUIDA la actual
 * @param contadorAnterior  peticiones en la ventana previa
 */
export function evaluar(parametros: {
  limite: Limite;
  contadorActual: number;
  contadorAnterior: number;
  ahora: Date;
  inicio: Date;
}): Veredicto {
  const { limite, contadorActual, contadorAnterior, ahora, inicio } = parametros;

  const peso = solapamiento(ahora, inicio, limite.ventanaMs);
  const usado = contadorAnterior * peso + contadorActual;
  const permitido = usado <= limite.maximo;

  // Cuándo bajará el consumo por debajo del máximo: al vaciarse la ventana
  // actual, como mucho. Se redondea hacia arriba para no invitar a reintentar
  // un milisegundo antes de tiempo.
  const restanteVentanaMs = limite.ventanaMs - (ahora.getTime() - inicio.getTime());
  const reintentarEnSegundos = permitido ? 0 : Math.max(1, Math.ceil(restanteVentanaMs / 1000));

  return {
    permitido,
    restantes: Math.max(0, Math.floor(limite.maximo - usado)),
    reintentarEnSegundos,
    usado,
  };
}
