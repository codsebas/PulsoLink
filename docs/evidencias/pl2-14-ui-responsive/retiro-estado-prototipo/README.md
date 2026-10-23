# PL2-14 — Retiro de "Estado" y "Prototipo" (#74)

Fecha de ejecución: 2026-10-22. Responsable: `@AxelHerrera11`.
Entorno: macOS (zsh), Node.js 24.14.1, Google Chrome 155 con Playwright 1.64.1 (temporal), emuladores Auth/Firestore Standard nuevos en cada ejecución.

**Cambio:**
- Se retiran del menú y de las rutas "Estado" (`/`, `HomePage`) y "Prototipo" (`/demo`, `LiveMockupPage`). `/` y `/demo` redirigen a `/monitoring`, que exige sesión.
- El logo y "Volver al inicio" apuntan a `/monitoring`.
- Las dos páginas se eliminan, porque quedan sin uso; se pueden recuperar del historial de Git.

| Comprobación | Resultado |
| --- | --- |
| Chrome real, sin sesión | `/` → `/login` y `/demo` → `/login` |
| Chrome real, con sesión de admin | `/` → `/monitoring` y `/demo` → `/monitoring`; el menú no muestra Estado ni Prototipo; el logo lleva a `/monitoring` |
| Auditoría frente a la entrega 3 ([comparación](comparacion.md)) | 8 mejoras y 0 regresiones (dos enlaces menos en el menú de escritorio); `/` deja de medirse. Las diferencias de altura en Asignaciones y Sesiones son las de #85 |
| Aceptación de interfaz de #33 | 17/17. La comprobación de movimiento reducido ya no exige el punto animado de "Prototipo" |
| Sección E de PL2-08 | Aprobada |
| Pruebas web | 72 aprobadas, 2 omitidas |
| Build web | El bundle principal baja a 404 kB y desaparece el aviso de más de 500 kB: la sala simulada cargaba Recharts de forma inmediata |
