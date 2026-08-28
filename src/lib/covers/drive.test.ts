import { describe, expect, it } from "vitest";

import {
  configuracionDeDrive,
  cuerpoMultiparte,
  normalizarClavePrivada,
  reclamacionesDelToken,
} from "./drive";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ESPEJO EN DRIVE — lote C4.
 *
 * ── LO QUE SE PUEDE PROBAR SIN CREDENCIALES, Y LO QUE NO ────────────────
 *
 * Aquí no hay cuenta de servicio, así que **la subida real no se ejercita**.
 * Lo que sí se prueba es todo lo que se decide antes de tocar la red, que es
 * donde están los fallos que dan la cara en silencio:
 *
 * · si la configuración está o no está —y qué significa «a medias»—;
 * · la clave privada, que llega de una variable de entorno con los saltos de
 *   línea escapados y **no funciona** si nadie los deshace;
 * · las reclamaciones del JWT, que si se equivocan devuelven un 400 opaco;
 * · el cuerpo multiparte, que si se arma mal sube un fichero corrupto.
 *
 * Está dicho sin adornos en el módulo: mientras no haya credenciales, este
 * camino está **escrito y no ejecutado**. Decirlo es parte del trabajo.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const ENTORNO_COMPLETO = {
  GOOGLE_DRIVE_FOLDER_ID: "1hjIiVE7f3oxlCsnF0",
  GOOGLE_DRIVE_CLIENT_EMAIL: "vault@proyecto.iam.gserviceaccount.com",
  GOOGLE_DRIVE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMIIE\\n-----END PRIVATE KEY-----\\n",
};

describe("configuracionDeDrive", () => {
  it("sin ninguna variable, el espejo simplemente no está", () => {
    expect(configuracionDeDrive({})).toEqual({ estado: "APAGADO" });
  });

  it("con las tres, está configurado", () => {
    const c = configuracionDeDrive(ENTORNO_COMPLETO);

    expect(c.estado).toBe("LISTO");
    if (c.estado !== "LISTO") return;
    expect(c.carpeta).toBe("1hjIiVE7f3oxlCsnF0");
    expect(c.cliente).toBe("vault@proyecto.iam.gserviceaccount.com");
  });

  it("CON ALGUNA A MEDIAS NO ES «APAGADO»: es una configuración rota, y se dice", () => {
    // Es la diferencia entre «el dueño no quiere Drive» y «el dueño lo quiere y
    // se le olvidó una variable». Tratar las dos igual deja el segundo caso en
    // silencio para siempre. `security.md`: la configuración falla en voz alta.
    const c = configuracionDeDrive({ GOOGLE_DRIVE_FOLDER_ID: "1hj" });

    expect(c.estado).toBe("INCOMPLETO");
    if (c.estado !== "INCOMPLETO") return;
    expect(c.faltan).toContain("GOOGLE_DRIVE_CLIENT_EMAIL");
    expect(c.faltan).toContain("GOOGLE_DRIVE_PRIVATE_KEY");
    expect(c.faltan).not.toContain("GOOGLE_DRIVE_FOLDER_ID");
  });

  it("una variable puesta pero vacía cuenta como ausente", () => {
    expect(configuracionDeDrive({ GOOGLE_DRIVE_FOLDER_ID: "   " })).toEqual({ estado: "APAGADO" });
  });
});

describe("normalizarClavePrivada", () => {
  it("deshace los saltos de línea escapados que trae el entorno", () => {
    // Una clave PEM en una variable de entorno viaja con `\\n` literales. Sin
    // deshacerlos, `crypto` la rechaza con «no se pudo parsear la clave», que
    // parece una clave mala y es sólo un formato.
    const clave = normalizarClavePrivada("-----BEGIN PRIVATE KEY-----\\nABC\\n-----END-----");

    expect(clave).toBe("-----BEGIN PRIVATE KEY-----\nABC\n-----END-----");
    expect(clave).not.toContain("\\n");
  });

  it("una clave que ya trae saltos reales no se toca", () => {
    const original = "-----BEGIN PRIVATE KEY-----\nABC\n-----END-----";

    expect(normalizarClavePrivada(original)).toBe(original);
  });

  it("quita las comillas si alguien las pegó con el valor", () => {
    expect(normalizarClavePrivada('"-----BEGIN-----\\nABC"')).toBe("-----BEGIN-----\nABC");
  });
});

describe("reclamacionesDelToken", () => {
  const ahora = new Date("2026-08-28T10:00:00Z");

  it("pide EXACTAMENTE el permiso que hace falta y ninguno más", () => {
    // `drive.file` sólo da acceso a los ficheros que crea esta aplicación. Con
    // `drive` a secas, una credencial filtrada abre el Drive entero del dueño.
    expect(reclamacionesDelToken("vault@x.iam.gserviceaccount.com", ahora).scope).toBe(
      "https://www.googleapis.com/auth/drive.file",
    );
  });

  it("caduca en una hora, que es el máximo que acepta Google", () => {
    const c = reclamacionesDelToken("vault@x.iam.gserviceaccount.com", ahora);

    expect(c.exp - c.iat).toBe(3600);
    expect(c.iat).toBe(Math.floor(ahora.getTime() / 1000));
  });

  it("va dirigido al endpoint de token, no a la API", () => {
    // `aud` equivocado devuelve un 400 sin explicación útil.
    expect(reclamacionesDelToken("v@x.test", ahora).aud).toBe(
      "https://oauth2.googleapis.com/token",
    );
  });
});

describe("cuerpoMultiparte", () => {
  const bytes = Buffer.from([0x52, 0x49, 0x46, 0x46]);

  it("mete los metadatos y DESPUÉS los bytes, que es el orden que Drive exige", () => {
    const { cuerpo, frontera } = cuerpoMultiparte(
      { name: "portada.webp", parents: ["carpeta"] },
      bytes,
      "image/webp",
    );
    const texto = cuerpo.toString("latin1");

    expect(texto.indexOf("application/json")).toBeLessThan(texto.indexOf("image/webp"));
    expect(texto).toContain('"name":"portada.webp"');
    expect(texto).toContain(frontera);
  });

  it("los bytes viajan intactos: no se codifican ni se recortan", () => {
    const { cuerpo } = cuerpoMultiparte({ name: "x" }, bytes, "image/webp");

    expect(cuerpo.includes(bytes)).toBe(true);
  });

  it("la frontera es distinta en cada llamada", () => {
    // Una frontera fija que apareciera dentro de los bytes de una imagen
    // partiría el cuerpo por la mitad. Con una aleatoria por subida, la
    // probabilidad deja de importar.
    const a = cuerpoMultiparte({ name: "x" }, bytes, "image/webp").frontera;
    const b = cuerpoMultiparte({ name: "x" }, bytes, "image/webp").frontera;

    expect(a).not.toBe(b);
  });

  it("cierra con la frontera final, o Drive rechaza el cuerpo", () => {
    const { cuerpo, frontera } = cuerpoMultiparte({ name: "x" }, bytes, "image/webp");

    expect(cuerpo.toString("latin1").endsWith(`--${frontera}--`)).toBe(true);
  });
});
