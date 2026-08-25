/**
 * FORTALEZA DE UNA CONTRASEÑA — pura, sin red y sin dependencias.
 *
 * ── QUÉ ES Y QUÉ NO ES ─────────────────────────────────────────────────────
 * Es una **pista visual para el usuario mientras escribe**. No es la política
 * de contraseñas: la política la aplica el servidor, con Zod, y no se fía de
 * esto ni de nada que venga del cliente. Si alguna vez alguien decide un
 * registro a partir de este número, el fallo estará en quien lo decida.
 *
 * ── POR QUÉ NO CUENTA «TIPOS DE CARÁCTER» Y YA ─────────────────────────────
 * El clásico «una mayúscula, un número y un símbolo» premia `Passw0rd!` —que
 * está en cualquier diccionario de ataque— y castiga `caballo grapa batería`,
 * que es órdenes de magnitud más difícil de romper. Aquí manda la **longitud**,
 * la variedad solo acompaña, y hay penalizaciones explícitas para los patrones
 * que un atacante prueba primero.
 *
 * Deliberadamente NO es un estimador de entropía real (zxcvbn y compañía): eso
 * son cientos de kB de diccionarios en el bundle para pintar cuatro segmentos.
 */

/** 0 = vacía · 4 = los cuatro segmentos llenos. */
export type NivelFortaleza = 0 | 1 | 2 | 3 | 4;

export type Fortaleza = {
  nivel: NivelFortaleza;
  /** Texto en español, apto para enseñar tal cual. Nunca `undefined`. */
  etiqueta: string;
};

const ETIQUETAS: Record<NivelFortaleza, string> = {
  0: "Escribe una contraseña",
  1: "Muy débil",
  2: "Débil",
  3: "Aceptable",
  4: "Fuerte",
};

/** Los que un ataque por diccionario prueba en los primeros segundos. */
const PATRONES_POBRES = [
  /^(.)\1+$/, //                       un solo carácter repetido
  /12345|23456|34567|45678|56789/, //  secuencia numérica
  /qwerty|asdfgh|zxcvbn|123456/i, //   recorridos de teclado
  /password|contrasena|contraseña|admin|letmein/i,
  /anime|vault|animevault/i, //        el nombre del propio sitio
];

export function calcularFortaleza(password: string): Fortaleza {
  if (password.length === 0) return { nivel: 0, etiqueta: ETIQUETAS[0] };

  let puntos = 0;

  // La longitud es el factor que más pesa, y con diferencia.
  if (password.length >= 8) puntos += 1;
  if (password.length >= 12) puntos += 1;
  if (password.length >= 16) puntos += 1;
  if (password.length >= 20) puntos += 1;

  // La variedad acompaña: como mucho suma uno.
  const familias = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) =>
    r.test(password),
  ).length;
  if (familias >= 3) puntos += 1;

  // ── UN PATRÓN POBRE TOPA EL NIVEL, NO LE RESTA UNOS PUNTOS ────────────────
  // Restar era insuficiente y lo demostró el test: `PasswordPassword1234` suma
  // 20 caracteres y tres familias, así que incluso con la penalización se
  // quedaba en «Aceptable». Es una de las primeras que prueba un ataque por
  // diccionario, y llamarla aceptable es peor que no medir nada.
  //
  // Con tope, la longitud ya no puede comprar la puntuación: si la contraseña
  // contiene un patrón conocido, no pasa de «Débil» mida lo que mida.
  const tope: NivelFortaleza = PATRONES_POBRES.some((r) => r.test(password)) ? 2 : 4;

  const nivel = Math.min(tope, Math.max(1, puntos)) as NivelFortaleza;
  return { nivel, etiqueta: ETIQUETAS[nivel] };
}
