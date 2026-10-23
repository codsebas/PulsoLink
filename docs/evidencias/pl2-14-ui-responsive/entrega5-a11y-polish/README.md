# PL2-14 entrega 5 — Pulido de accesibilidad (#74)

Fecha de ejecución: 2026-10-22. Responsable: `@AxelHerrera11`.
Entorno: macOS (zsh), Node.js 24.14.1, Google Chrome 155 con Playwright 1.64.1 (temporal), emuladores Auth/Firestore Standard nuevos en cada ejecución.
Medido sobre el árbol de trabajo encima de `c3af2bb` (el JSON registra ese commit porque los cambios aún no estaban confirmados).

**Cambios:**
- **Objetivos táctiles de 44 × 44 px por debajo de `lg`.** Es el mismo umbral que el menú móvil.
  - Botones, selectores y campos usan una regla global en `globals.css` con `:where`, de especificidad cero: cualquier clase que fije el tamaño la sustituye.
  - Los enlaces de bloque (logo, pie, "← Pacientes" y "Ver monitoreo") usan `max-lg:min-h-11`.
  - Los enlaces dentro de un párrafo no cambian.
- **Movimiento reducido.** Los indicadores giratorios (`LoadingState`, "Cargar más" de `DataTable` y "Actualizar" del panel) se detienen con `motion-reduce:animate-none`. Ya no queda ningún `animate-*` sin su variante.
- **Cifras tabulares.** `tabular-nums` en las tablas de `DataTable` y del historial: las columnas numéricas quedan alineadas.
- **Puntos suspensivos tipográficos.** Los textos de carga usan "…" en vez de "..." (panel y resumen de PulsoAI).

| Comprobación | Resultado |
| --- | --- |
| Auditoría frente al retiro ([comparación](comparacion.md)) | 17 mejoras y 0 regresiones. Controles de menos de 44 px a 360 y 768 px: de 100 a 0 en las 17 combinaciones de ruta y ancho |
| Escritorio (1440 px) | Sin cambios. Los enlaces del menú miden 36 px de alto: se usan con ratón y superan el mínimo de 24 px de WCAG 2.5.8 |
| Altura de página | Crece entre 12 y 72 px en las páginas con formularios o tarjetas, por los controles más altos. Depende de los datos y no cuenta como regresión |
| Aceptación de interfaz de #33 | 17/17 |
| Sección E de PL2-08 | Aprobada |
| Pruebas web | 72 aprobadas, 2 omitidas |
| Typecheck, lint y build web | Correctos; bundle principal de 404 kB sin avisos |

**Pendiente fuera de esta entrega:** `/admin/audit` conserva 5–6 textos de menos de 12 px (ya estaban en la línea base `accecfb`). La auditoría no registra cuáles son; se revisarán aparte.
