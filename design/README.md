# ANIME VAULT — paquete de diseño

Sistema visual completo y las doce pantallas, listo para llevar a código.
Todo el paquete funciona con **rutas relativas**: descomprime la carpeta, abre
`ANIME-VAULT.dc.html` con doble clic y se ve entero desde tu disco.

---

## Qué hay en cada archivo

```
anime-vault-design/
├── ANIME-VAULT.dc.html     el lienzo con los 12 artboards, interactivo
├── tokens.css              todas las variables CSS finales
├── tokens.json             los mismos tokens en JSON plano para Tailwind v4
├── DESIGN-SPEC.md          medidas, rejillas, tipografía y estados por artboard
├── README.md               este archivo
├── screens/                un PNG por artboard, en el orden del lienzo
├── assets/                 texturas y piezas kintsugi en resolución original
│   └── web/                las mismas, optimizadas: son las que carga el HTML
└── scripts/                support.js e image-slot.js
```

| Archivo | Qué es | Para qué sirve |
|---|---|---|
| `ANIME-VAULT.dc.html` | El lienzo completo. Doce artboards en vertical con pan y zoom. | Ver el diseño vivo: los filtros, pestañas, conmutador rejilla/lista, el − / + de la ficha y el aviso de duplicado funcionan de verdad. Es la referencia de comportamiento. |
| `tokens.css` | Custom properties bajo `:root`. Ningún color literal fuera de aquí. | Importar tal cual en el proyecto. Los nombres son los mismos que usa `DESIGN-SPEC.md`. |
| `tokens.json` | Los mismos valores, planos, con la convención de nombres de Tailwind v4 (`--color-*`, `--text-*`, `--radius-*`…). | Pegar dentro del bloque `@theme { … }` del CSS de entrada. |
| `DESIGN-SPEC.md` | La especificación de implementación. | Medidas y rejillas por artboard, tabla componente → variantes → estados, breakpoints y la sección «Qué NO hacer». |
| `screens/` | 12 PNG a 1× (1443 px de ancho), numerados en el orden del lienzo. | Comparar el resultado con el diseño sin abrir el HTML. |
| `assets/` | Las 4 texturas de laja y las 5 piezas kintsugi originales, en PNG y a resolución completa. | Recortar, reencuadrar o reexportar. Pesan mucho: no las sirvas tal cual. **No están en el repo — ver la nota de abajo.** |
| `assets/web/` | Las versiones optimizadas en JPG que carga el HTML. | Copiar directamente al proyecto. Estas **sí** están en el repo. |

---

## Dónde están los PNG originales

> **Si has clonado este repositorio, `design/assets/*.png` estará vacío. No se han perdido:
> nunca se subieron, y fue una decisión deliberada.**

Los nueve PNG a resolución completa (4 texturas de laja + 5 piezas kintsugi) pesan **~85 MB**
—unos 9 MB cada uno—. Meterlos en git significaría que cada clon y cada despliegue arrastran
85 MB que **la aplicación no usa jamás**: lo que la app sirve son las versiones optimizadas de
`assets/web/` (1,6 MB en total), ya copiadas a `public/texturas/`.

Por eso `.gitignore` lleva:

```gitignore
design/assets/*.png
!design/assets/web/
```

**El original completo, intacto, vive fuera del repositorio en la máquina del autor:**

```
J:\Code\Anime_Organize\anime-vault-design\assets\
```

Ese directorio es la copia maestra del paquete de diseño tal y como se exportó de Claude
Design, y **no se ha modificado**. Si necesitas recortar, reencuadrar o reexportar una
textura, sácala de ahí.

Si trabajas en otra máquina y necesitas los originales, pídeselos al autor o vuelve a
exportar el paquete desde Claude Design. Para implementar la interfaz **no hacen falta**:
`tokens.css`, `DESIGN-SPEC.md`, `screens/` y `assets/web/` son suficientes y sí están en
el repositorio.
| `scripts/support.js` | Runtime del lienzo. | Solo lo necesita `ANIME-VAULT.dc.html`. No hace falta en tu app. |
| `scripts/image-slot.js` | El componente de hueco soltable de las portadas. | Solo para el lienzo. En producción, un `<img>` normal con `aspect-ratio: 2/3`. |

### Cómo se relacionan

`tokens.css` es la fuente de verdad. `tokens.json` es su traducción a Tailwind v4;
si cambias uno, cambia el otro. `DESIGN-SPEC.md` nombra los tokens, nunca repite
valores sueltos. El `.dc.html` es el prototipo: por cómo está construido lleva los
valores literales en línea, así que **si hay discrepancia, manda `tokens.css`**.
`screens/` es una foto del lienzo en el momento de la entrega.

---

## Fuentes

Tres familias de Google Fonts. Cárgalas con estos pesos y ninguno más:

| Familia | Pesos | Uso |
|---|---|---|
| **Cormorant Garamond** | 300, 400 (500 opcional) | Titulares, números grandes, logotipo |
| **Inter** | 400, 500, 600 | Toda la interfaz |
| **IBM Plex Mono** | 400 (500 opcional) | Datos y meta: episodios, fechas, contadores |

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap" rel="stylesheet">
```

O autoalojadas, que es lo recomendable en producción:

```css
@font-face { font-family:'Cormorant Garamond'; src:url('./fonts/cormorant-garamond-300.woff2') format('woff2'); font-weight:300; font-display:swap }
```

**Nota offline:** el lienzo pide las fuentes a Google. Sin conexión se ve completo
—maquetación, colores y texturas son locales— pero cae a los sustitutos declarados
en `tokens.css` (Georgia para display, system-ui para UI, Menlo para mono). Si lo
quieres idéntico sin internet, descarga los `.woff2` a `fonts/` y sustituye el
`<link>` del `<helmet>` por `@font-face`.

---

## Empezar con Tailwind v4

```css
@import "tailwindcss";

@theme {
  /* pega aquí el contenido de tokens.json, sin las llaves ni el $comment */
  --color-gold-400: #C9A227;
  --font-display: 'Cormorant Garamond', Georgia, serif;
  /* … */
}
```

Y el botón primario del sistema queda así:

```html
<button class="rounded-boton border border-gold-400 bg-slate-950 px-6 py-3
               font-ui text-ui font-medium tracking-boton text-gold-200
               transition-colors duration-base
               hover:border-transparent hover:text-gold-100
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-400">
  Entrar al Vault
</button>
```

El borde de pan de oro en hover necesita doble fondo (no se puede con un solo borde):

```css
.boton-primario:hover {
  border-color: transparent;
  background-image: linear-gradient(var(--slate-950), var(--slate-950)), var(--gold-leaf);
  background-origin: border-box;
  background-clip: padding-box, border-box;
  box-shadow: var(--glow-oro);
}
```

---

## Sobre las portadas

Los huecos 2:3 van **vacíos a propósito**: las imágenes que se arrastraron durante
el diseño eran de prueba y no forman parte del paquete. La proporción, el radio, el
borde y el tratamiento en reposo y en hover están documentados en
`DESIGN-SPEC.md § 5`.

---

## Antes de escribir la primera línea

Lee `DESIGN-SPEC.md § 8 · Qué NO hacer`. Resumen: el oro nunca pasa del 10 % del
área, nunca hay oro sobre oro, y como mucho un botón de relleno dorado por pantalla.
Todo lo demás del sistema se sostiene sobre eso.
