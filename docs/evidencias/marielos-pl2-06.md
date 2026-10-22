# PL2-06: cierre de pendientes de administración

Issue #30. Base `a1c12bc` (incluye #56). Datos ficticios únicamente.

## Cambios

- Opciones por cursor para pacientes, placas y asignaciones, con carga y reintento explícitos; no se descarga automáticamente todo el catálogo.
- Diálogos nativos: fondo inerte, contención de foco, Escape bloqueado durante envío y devolución del foco al disparador.
- Reasignación bloqueada si falla la consulta de ocupación o se selecciona la misma placa.
- Enlace directo de cada paciente a su monitoreo; cancelación de consultas paginadas al salir.
- `tools/qa/admin-acceptance.cjs` ejercita formularios, navegación nativa, >100 opciones, sesiones, reasignación, conflictos al deshabilitar y vistas administrativas contra HTTP real. Lo invoca la entrega de QA #33.

## Verificación

Regresión focalizada con Node 24.22.1: cuatro pruebas aprobadas (opciones 101, cursor opaco, Escape, envío pendiente y retorno del foco simulado). La contención nativa de Tab exige navegador y no se acredita mediante jsdom.

La primera suite completa con Node 26 tuvo 31 aprobadas, una fallida por espera inicial de un segundo y dos integraciones omitidas; no se considera una aprobación global ni una ejecución del entorno objetivo.

Los resultados finales del recorrido integrado y la matriz por criterio se registran en la entrega #33. No se solicita cierre automático por este documento ni se sustituyen las revisiones de Lis, Axel y coordinación.
