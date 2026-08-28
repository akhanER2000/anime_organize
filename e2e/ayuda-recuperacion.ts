import { readFileSync } from "node:fs";
import { join } from "node:path";

import { neon } from "@neondatabase/serverless";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL TOKEN DE RECUPERACIÓN, PARA EL RECORRIDO EN NAVEGADOR
 *
 * ── POR QUÉ NO SE LEE DEL CORREO ──────────────────────────────────────────
 *
 * Porque no hay correo: sin `RESEND_API_KEY` el enlace se imprime en el log del
 * servidor, y desde Chromium no hay forma de leerlo. La alternativa sería un
 * fichero de volcado solo para tests, que es superficie nueva en el código de
 * producción para probar algo que ya está probado.
 *
 * ── LO QUE ESTO **NO** FABRICA ────────────────────────────────────────────
 *
 * Solo el token. Todo lo que falla se recorre de verdad: el formulario de
 * `/recuperar` se envía, la contraseña nueva se escribe en `/recuperar/nueva` y
 * el login posterior se teclea en su formulario.
 *
 * La emisión es el único eslabón reconstruido, y es el único que ya tenía
 * pruebas —incluida la de tiempo, que compara los dos caminos contra Postgres
 * real para que no se pueda averiguar qué correos tienen cuenta cronometrando—.
 *
 * ── SE HABLA CON LA BASE, NO CON EL MÓDULO DE LA APLICACIÓN ───────────────
 *
 * Importar `emitirEnlaceDeReset` desde un spec arrastraría `server-only` y el
 * cliente de la aplicación dentro del proceso de Playwright. Se hace la misma
 * escritura que hace ese módulo —token aleatorio, sha256 guardado, caducidad de
 * una hora— con el driver a pelo. Si el esquema de `password_reset_tokens`
 * cambiara, esto deja de funcionar y el test se pone rojo, que es lo correcto.
 * ═══════════════════════════════════════════════════════════════════════════
 */

function cadenaDeConexion(): string | null {
  const deEntorno = process.env.DATABASE_URL;
  if (deEntorno !== undefined && deEntorno !== "") return deEntorno;

  try {
    const contenido = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
    const encontrada = /^DATABASE_URL=(.+)$/m.exec(contenido)?.[1];
    return encontrada === undefined ? null : encontrada.trim().replace(/^["']|["']$/g, "");
  } catch {
    return null;
  }
}

export function hayBase(): boolean {
  return cadenaDeConexion() !== null;
}

export function esperarSinBase(): string {
  return (
    "OMITIDO: falta DATABASE_URL. Este recorrido comprueba que restablecer la " +
    "contraseña te devuelve el acceso. Omitirlo NO es aprobarlo."
  );
}

/** Emite un token de recuperación para ese correo y lo devuelve EN CLARO. */
export async function emitirTokenDeReset(email: string): Promise<string> {
  const url = cadenaDeConexion();
  if (url === null) throw new Error("sin DATABASE_URL no se puede emitir el token");

  const { createHash, randomBytes } = await import("node:crypto");
  const sql = neon(url);

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const caduca = new Date(Date.now() + 3_600_000);

  const filas = await sql`select id from users where email = ${email} limit 1`;
  const userId = (filas[0] as { id?: string } | undefined)?.id;
  if (userId === undefined) throw new Error(`no existe la cuenta ${email}`);

  await sql`
    insert into password_reset_tokens (user_id, token_hash, expires_at)
    values (${userId}, ${hash}, ${caduca})`;

  return token;
}

/**
 * Vacía el cubo de `registro:ip` antes de este recorrido.
 *
 * ── POR QUÉ, Y POR QUÉ NO ES HACER TRAMPA ─────────────────────────────────
 *
 * El límite de registro es **5 por hora y por IP**, y toda la suite sale de la
 * misma máquina. Entre `auth-humo`, el vault vacío de la biblioteca, la ficha
 * ajena, la vista lista y los dos recorridos de aquí, una pasada crea seis
 * cuentas: la sexta falla, y el fallo se lee como «el registro no funciona»
 * cuando lo que pasa es que la suite se está probando a sí misma.
 *
 * Es exactamente el razonamiento que ya está escrito en `preparar-suite.ts`, y
 * la misma conclusión: **una suite que prueba PANTALLAS no debe estar probando
 * el limitador de paso**. El limitador tiene sus propios tests —ocho contra
 * Postgres real, más los del camino real que martillean el endpoint— y son
 * mejores que este uso accidental.
 *
 * Lo que este fichero SÍ prueba del limitador es el de LOGIN, y ese no se toca:
 * el segundo recorrido lo agota a propósito para comprobar que restablecer la
 * contraseña devuelve el acceso.
 */
export async function liberarLimiteDeRegistro(): Promise<void> {
  const url = cadenaDeConexion();
  if (url === null) return;

  const sql = neon(url);
  await sql`delete from rate_limit_bucket where clave like 'registro:%'`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VACIAR TAMBIÉN EL CUBO DE **LOGIN**, para los specs que solo necesitan entrar.
 *
 * ── POR QUÉ HIZO FALTA ────────────────────────────────────────────────────
 *
 * `login:ip` son 20 cada 15 minutos, y **todos los specs salen de la misma
 * máquina**, así que comparten cubo. La suite creció —el recorrido de Ajustes
 * hace tres autenticaciones y el de borrado hace cinco— y el que corre último
 * se queda sin.
 *
 * El fallo no se lee como lo que es: `vista-lista` decía «un vault recién creado
 * no carga» y `recuperar-y-entrar` decía «sigues bloqueado después de
 * restablecer: el callejón sin salida ha vuelto», que es un mensaje de alarma
 * sobre un fallo que no había ocurrido.
 *
 * ── QUIÉN DEBE USARLA Y QUIÉN NO ──────────────────────────────────────────
 *
 * Los specs que **solo necesitan estar dentro** para probar otra cosa. Es la
 * misma lógica que ya está escrita arriba: una suite que prueba PANTALLAS no
 * debe estar probando el limitador de paso.
 *
 * **`recuperar-y-entrar.spec.ts` la usa al EMPEZAR cada test y no después**:
 * ese sí prueba el limitador, y lo que necesita es partir de un cubo limpio para
 * agotarlo a propósito. Vaciarlo a mitad de su recorrido invalidaría lo que
 * comprueba.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function liberarLimiteDeLogin(): Promise<void> {
  const url = cadenaDeConexion();
  if (url === null) return;

  const sql = neon(url);
  await sql`delete from rate_limit_bucket where clave like 'login:%'`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VACIAR EL CUBO DE **IMPORTACIÓN**.
 *
 * `import:user` son **5 por hora** (`security.md` §5), y el recorrido de
 * importación gasta dos por ejecución: el fichero que se rechaza por no ser
 * una hoja y el que sí lo es. A la tercera pasada seguida —depurando, que es
 * cuando más se ejecuta— el spec falla con «Has importado demasiadas veces»,
 * que se lee como un fallo de la importación y no lo es.
 *
 * Misma lógica que los otros dos: una suite que prueba PANTALLAS no debe estar
 * probando el limitador de paso. El límite de importación **no** tiene un spec
 * que lo compruebe a propósito; el día que lo tenga, ese spec no debe llamar a
 * esta función.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function liberarLimiteDeImportacion(): Promise<void> {
  const url = cadenaDeConexion();
  if (url === null) return;

  const sql = neon(url);
  await sql`delete from rate_limit_bucket where clave like 'import:%'`;
}
