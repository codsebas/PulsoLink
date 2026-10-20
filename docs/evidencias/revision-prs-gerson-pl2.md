# Revisión de integración de PR recientes — Gerson

Revisión del 19 de octubre de 2026 (America/Guatemala). Referencias consultadas: ramas remotas actualizadas, metadatos de GitHub y [propuesta de Lis en #29](https://github.com/codsebas/PulsoLink/issues/29#issuecomment-6282507662).

## Estado observado

| PR | Estado revisado | Impacto en la entrega de Gerson |
| --- | --- | --- |
| [#38](https://github.com/codsebas/PulsoLink/pull/38), Lis, `00ac05b` | Abierto, Fase A de vistas administrativas | Comparados rutas, menú, tipos, hooks de pacientes y autenticación con el dashboard. No está en main. |
| [#37](https://github.com/codsebas/PulsoLink/pull/37), Axel | Fusionado en main, `ea1dc49` | Matriz de QA y evidencia inicial; ya incorporado en la rama de Gerson. No cambia endpoints. |
| [#36](https://github.com/codsebas/PulsoLink/pull/36) | Fusionado | Arquitectura por paciente y contratos 2.0.0, base de esta entrega. |
| #24, #23, #22, #21, #19, #18, #17, #16, #15 y #14 | Fusionados y presentes en la ascendencia | Contratos y ejecución anteriores, ingestión, sesiones, entorno, autenticación, frontend, persistencia y monitoreo. No se vuelven a importar sus ramas. |
| [#39](https://github.com/codsebas/PulsoLink/pull/39), Gerson | Borrador, base main | Persistencia y propuesta de dashboard; conserva pendientes compartidos. |

## Correcciones aplicadas en #39

- `useSessionUser` de #38 utiliza `['auth', 'me']` y almacena directamente el perfil o `null` para 401. El dashboard almacenaba el sobre `{data: perfil}` bajo la misma clave. Al coexistir, un consumidor podía interpretar mal la caché. El dashboard ahora devuelve el perfil directamente, trata 401 como `null` y utiliza las mismas opciones de reintento y frescura. Cuando se consoliden ambos PR se puede reutilizar el hook de Lis; hoy ese archivo todavía no existe en main.
- QA UI-02: un 401 durante acceso, paciente, sesión activa, última lectura o historial redirige al login. El perfil nulo también redirige sin emitir el POST de apertura. Antes solo se contemplaba el error de `/auth/me`.

## Integración todavía pendiente

- `git merge-tree --write-tree HEAD origin/feat/pl2-06-vistas-administrativas` detectó **un conflicto de contenido en `apps/web/src/components/layout/Header.tsx`**. El router combina automáticamente. Al integrar el segundo PR hay que conservar el menú administrativo de Lis, su filtro `adminOnly`, el enlace `/monitoring` y el ajuste móvil de #39. La rama abierta de Lis no se fusionó en #39; no se afirma que ambos PR ya estén integrados o probados juntos.
- El listado de Lis todavía no enlaza al expediente de monitoreo. La ruta disponible en #39 es `/monitoring/:patientId`, con ID codificado. No reemplaza `/patients`, que administra expedientes. Añadir el enlace al consolidar #38 y acordar el diseño.
- La propuesta de componentes compartidos de Lis sigue pendiente de acuerdo: DataTable, diálogos, estados y controles por rol. El dashboard conserva sus tarjetas y paginación de historial; no se copia una segunda implementación de los componentes administrativos ni de `contract-types.ts` desde un PR abierto.
- El selector de pacientes de #38 llama “Todos” a la ausencia de `enabled`. La lectura actual de #39 devuelve habilitados por defecto y rechaza `enabled=false` para viewer (403). Alinear etiquetas y disponibilidad del filtro con Didhyer y QA P-03; no cambiar el permiso implícitamente para encajar una etiqueta.
- #38 prepara creación de sesiones mediante `{assignmentId}` y CRUD administrativos. Esas operaciones HTTP siguen dependiendo de #27/#28: los repositorios de #39 no convierten por sí solos las pantallas en un recorrido completo. Mantener el corte coordinado documentado en [persistencia](../arquitectura/persistencia-pl2-integracion.md).
- QA P-05: la persistencia actual usa `RESOURCE_DISABLED` (mapeado a 403) para recursos deshabilitados y `ASSIGNMENT_IN_USE` para otra sesión abierta. Son comportamientos de esta implementación, pendientes de acuerdo contractual con API/QA. P-01/P-02/P-04/P-06 siguen bajo sus responsables; esta revisión no modifica el contrato ni declara aprobada la matriz completa.

## Verificación ejecutada para esta corrección

- `npm run typecheck --workspace=apps/web`: aprobado.
- `npm run build --workspace=apps/web`: aprobado; persiste la advertencia conocida de tamaño del bundle principal.
- Playwright CLI, Chromium, fixture HTTP: acceso único, polling, paginación, móvil sin desbordamiento, permisos 403, redirección por 401 en latest y por perfil sin sesión. Aprobado. Estas pruebas usan respuestas simuladas; no demuestran integración conjunta con #38 ni nube.
- `git diff --check`: aprobado antes de publicar.

La ejecución previa de 127 pruebas con emuladores continúa registrada en [la evidencia de Gerson](gerson-pl2.md); no se volvió a ejecutar en esta corrección, que solo cambia frontend, fixture y documentación.
