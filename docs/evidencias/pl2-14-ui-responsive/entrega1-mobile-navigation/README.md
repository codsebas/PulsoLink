# PL2-14 entrega 1 — Navegación móvil (#74)

Fecha de ejecución: 2026-10-22. Responsable: `@AxelHerrera11`.
Entorno: macOS (zsh), Node.js 24.14.1, Google Chrome 155 con Playwright 1.64.1 (temporal, fuera del repositorio), emuladores Auth/Firestore Standard nuevos en cada ejecución. Sin nube ni hardware.

## Qué se midió

- `audit.json`: auditoría responsiva de la rama `fix/mobile-navigation`. **Nota:** el campo `commit` muestra `3db477a` (la base en `main`) porque se midió sobre el árbol de trabajo con los cambios de la rama todavía sin commit.
- `comparacion.md`: comparación con la [línea base](../baseline-accecfb/audit.json) (`main` `accecfb`, mismo código web que `3db477a`). Resultado: **47 mejoras y 0 regresiones**; a 1440 px no hay ninguna diferencia.
- Capturas a 360 px: [cabecera compacta](screenshots/360_patients-menu-cerrado.png) y [menú abierto como viewer](screenshots/360_monitoring-menu-abierto-viewer.png), esta última tomada por la aceptación de interfaz de #33 tras abrir el menú.

## Comprobaciones ejecutadas sobre la rama

| Comprobación | Resultado |
| --- | --- |
| Auditoría responsiva frente a la línea base | Cabecera de 149 a 65 px a 360 y 768; −10 controles menores de 44 px por ruta; sin desbordamiento |
| Aceptación de interfaz de #33 (`PULSOLINK_UI_ACCEPTANCE_ONLY`) | 17/17, incluido el recorrido con teclado de la navegación a 360/768/1440 y movimiento reducido |
| Sección E de PL2-08 (`PULSOLINK_UI_CONTRAST_ONLY`) | Aprobada, incluido "Salir" y el botón Atrás en móvil |
| Pruebas web | 50 aprobadas (7 nuevas del menú), 2 omitidas |

La primera medición registraba como etiqueta de un control el atributo `name` del campo de contraseña del login (no su valor). Se corrigió la auditoría para usar la etiqueta visible y se repitió la medición, con las mismas métricas; la evidencia corresponde a la segunda ejecución.
