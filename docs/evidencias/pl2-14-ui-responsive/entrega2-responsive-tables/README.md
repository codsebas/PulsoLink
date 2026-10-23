# PL2-14 entrega 2 — Tablas en móvil (#74)

Fecha de ejecución: 2026-10-22. Responsable: `@AxelHerrera11`.
Entorno: macOS (zsh), Node.js 24.14.1, Google Chrome 155 con Playwright 1.64.1 (temporal, fuera del repositorio), emuladores Auth/Firestore Standard nuevos en cada ejecución. Sin nube ni hardware.

## Qué se midió

- `audit.json`: auditoría responsiva de la rama `feat/responsive-tables`. **Nota:** el campo `commit` muestra `00be19f` (la base en `main`) porque se midió sobre el árbol de trabajo con los cambios de la rama todavía sin commit.
- `comparacion.md`: comparación con la [medición de la entrega 1](../entrega1-mobile-navigation/audit.json). Resultado: **11 mejoras y 0 regresiones**. A 768 y 1440 px no hay ninguna diferencia, porque desde `sm` se sigue mostrando la tabla.
- Capturas a 360 px con las tarjetas de [Pacientes](screenshots/360_patients-tarjetas.png), [Placas](screenshots/360_devices-tarjetas.png) y [Sesiones](screenshots/360_sessions-tarjetas.png).

## Comprobaciones ejecutadas sobre la rama

| Comprobación | Resultado |
| --- | --- |
| Auditoría responsiva frente a la entrega 1 | A 360 px, las 6 tablas dejan de necesitar desplazamiento horizontal; hay menos controles menores de 44 px en Pacientes, Placas, Asignaciones, Sesiones y Usuarios |
| Aceptación de interfaz de #33 (`PULSOLINK_UI_ACCEPTANCE_ONLY`) | 17/17 (usa las tablas administrativas a 1440 px) |
| Sección E de PL2-08 (`PULSOLINK_UI_CONTRAST_ONLY`) | Aprobada (UI-07 lee la tabla de asignaciones) |
| Pruebas web | 58 aprobadas (5 nuevas de `DataTable`), 2 omitidas |

**Regresión detectada y corregida durante la entrega:** la primera medición marcó 1 control pequeño más en Sesiones. El enlace del ID de sesión, que encabeza cada tarjeta, medía 139×16 px. Se aplicó al título la misma altura táctil de 44 px que a las acciones, y la medición final no tiene regresiones.

La altura de página crece en las vistas con tarjetas (+144 a +580 px): las filas se apilan en lugar de desplazarse en horizontal. Es una métrica informativa.
