---
description: Crear una pantalla nueva respetando el diseño aprobado y los tokens
argument-hint: "<nombre de la pantalla> [nº de artboard en design/screens/]"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(npm *), Bash(npx *), Task
---

# /project:new-screen — pantalla nueva con el diseño aprobado

Pantalla: **$ARGUMENTS**

## 1. Consultar el diseño ANTES de escribir nada

En este orden de autoridad:

1. `design/tokens.css` y `design/tokens.json` — **mandan** sobre color, tipografía,
   espaciado, radio, sombra y duración.
2. `design/DESIGN-SPEC.md` — manda sobre medidas, rejillas, estados de componente y
   breakpoints. Busca la sección §4 del artboard correspondiente.
3. `design/screens/NN-*.png` — **léelo con la herramienta de imagen**. Es la referencia visual.
4. `design/ANIME-VAULT.dc.html` — solo si algo no está en los anteriores. Ojo: lleva valores
   literales en línea; si contradice a `tokens.css`, gana `tokens.css`.

Si después de los cuatro sigue sin estar claro (una medida, un estado, un
comportamiento), **pregunta al usuario**. No improvises una interpretación.

## 2. Reunir la información que necesitas

- ¿Qué artboard es? ¿Qué mide? ¿Qué padding y qué rejilla?
- ¿Qué componentes reutiliza de `src/components/ui/`? **Reutiliza; no clones.**
  Si un componente existe con otra variante, añade la variante en vez de duplicar.
- ¿Qué cambia en `laptop` / `tablet` / `movil`? (§3 de la spec, tabla de breakpoints.)
- ¿Qué estados hay que cubrir? (§6: default, hover, focus, active, disabled, loading,
  error, vacío.) **Los ocho, no solo el feliz.**

## 3. Implementar

- **Server Component por defecto.** `"use client"` solo en las hojas que necesiten estado
  o eventos, lo más abajo posible del árbol.
- **Cero hex.** Utilidades de token (`bg-slate-850`, `text-gold-300`) o
  `var(--token)` en arbitrarios. Ver `@.claude/rules/design-tokens.md`.
- **Las reglas del oro:** ≤10 % de oro por pantalla, nunca oro sobre oro, **un solo botón
  de relleno dorado sólido** por pantalla como máximo.
- Accesibilidad desde el principio, no como parche: foco visible (anillo 2 px `--gold-400`
  con 2 px de offset), navegación completa por teclado, `aria-label` en los iconos sin
  texto, área táctil ≥44 px en móvil, y el estado **nunca** comunicado solo por color.
- Estados de carga con los **skeletons diseñados** (artboard 11): shimmer dorado,
  `--dur-shimmer`, desfase 0 / .3 / .6 s por columna.
- `error.tsx` y `not-found.tsx` con la estética del sistema si la ruta los necesita.
- Nada de `transform: scale()` en hover de cards.

## 4. Verificar contra el diseño

```
!npm run typecheck && npm run lint && npm run lint:tokens
```

Y después, **obligatorio antes de dar la pantalla por cerrada**:
lanza el subagente **`ui-fidelity-checker`** con la ruta implementada y el PNG del artboard.
Corrige lo que reporte antes de seguir.

## 5. Entregar

Di qué archivos creaste, qué componentes reutilizaste, qué breakpoints cubriste,
qué estados quedan implementados y **qué quedó fuera** (si algo quedó fuera).
