/**
 * Orquestación del login.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * EL ORDEN NO ES NEGOCIABLE:  parsear → RATE LIMIT → hash
 *
 * Argon2id está diseñado para ser **caro en CPU y en memoria** (19 MiB por
 * verificación). Si el límite se comprobara después de verificar la contraseña,
 * el login sería un **amplificador de denegación de servicio**: peticiones
 * baratísimas para el atacante, carísimas para la función serverless, que
 * además cobra por milisegundo de CPU.
 *
 * Comprobar el límite ANTES convierte una avalancha en unas cuantas escrituras
 * de contador, que es exactamente lo que se quiere.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Módulo PURO: recibe las dependencias como parámetros. Así el orden se puede
 * testear sin base de datos, sin Argon2 real y sin Auth.js, y —más importante—
 * se puede afirmar que el hash NO se llegó a llamar.
 */

export type ResultadoLogin =
  | { estado: "OK"; userId: string }
  | { estado: "CREDENCIALES_INVALIDAS" }
  | { estado: "LIMITE_EXCEDIDO"; reintentarEnSegundos: number }
  | { estado: "EMAIL_SIN_VERIFICAR"; userId: string };

/** Lo que el orquestador necesita saber hacer. Todo inyectable. */
export type DependenciasLogin = {
  /** Comprueba el límite. Devuelve el veredicto SIN tocar el hash. */
  comprobarLimite: () => Promise<{ permitido: boolean; reintentarEnSegundos: number }>;
  /** Busca al usuario. `null` si no existe. */
  buscarUsuario: (email: string) => Promise<{
    id: string;
    passwordHash: string | null;
    emailVerified: Date | null;
    deletedAt: Date | null;
  } | null>;
  /** Verifica la contraseña. CARO: 19 MiB y decenas de ms. */
  verificarPassword: (password: string, hash: string | null) => Promise<boolean>;
  /** ¿La bandera de verificación de email está activa? */
  seExigeVerificacion: () => boolean;
};

export async function intentarLogin(
  credenciales: { email: string; password: string },
  deps: DependenciasLogin,
): Promise<ResultadoLogin> {
  // ── 1. RATE LIMIT ────────────────────────────────────────────────────────
  // Lo PRIMERO que toca la base, y antes de cualquier trabajo caro.
  const limite = await deps.comprobarLimite();
  if (!limite.permitido) {
    return { estado: "LIMITE_EXCEDIDO", reintentarEnSegundos: limite.reintentarEnSegundos };
  }

  // ── 2. Buscar al usuario ─────────────────────────────────────────────────
  const usuario = await deps.buscarUsuario(credenciales.email);

  // ── 3. Verificar la contraseña ───────────────────────────────────────────
  // SIEMPRE se llama, exista o no el usuario: `verificarPassword` usa un hash
  // señuelo cuando recibe `null`, así que los dos caminos cuestan lo mismo y el
  // reloj no delata qué cuentas existen. Ver `password.ts`.
  const passwordCorrecta = await deps.verificarPassword(
    credenciales.password,
    usuario?.passwordHash ?? null,
  );

  // Una cuenta desactivada se trata como credenciales inválidas: decir
  // «tu cuenta está desactivada» confirma que existe.
  if (usuario === null || usuario.deletedAt !== null || !passwordCorrecta) {
    return { estado: "CREDENCIALES_INVALIDAS" };
  }

  // ── 4. Verificación de email, si está activa ─────────────────────────────
  if (deps.seExigeVerificacion() && usuario.emailVerified === null) {
    // No es un fallo de credenciales: la contraseña era correcta. Se distingue
    // para poder ofrecer «reenviar verificación», y solo se llega aquí HABIENDO
    // acertado la contraseña, así que no filtra nada a quien no la sabe.
    return { estado: "EMAIL_SIN_VERIFICAR", userId: usuario.id };
  }

  return { estado: "OK", userId: usuario.id };
}
