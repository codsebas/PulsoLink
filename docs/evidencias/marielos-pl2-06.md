# PL2-06: cierre de pendientes de administración

Issue #30. Base `a1c12bc` (incluye #56). Datos ficticios únicamente.

## Cambios

- Opciones por cursor para pacientes, placas y asignaciones, con carga y reintento explícitos; no se descarga automáticamente todo el catálogo.
- Diálogos nativos: fondo inerte, contención de foco, Escape bloqueado durante envío y devolución del foco al disparador.
- Reasignación bloqueada si falla la consulta de ocupación o se selecciona la misma placa.
- Enlace directo de cada paciente a su monitoreo; cancelación de consultas paginadas al salir.
- `tools/qa/admin-acceptance.cjs` ejercita formularios, navegación nativa, >100 opciones, sesiones, reasignación, conflictos al deshabilitar y vistas administrativas contra HTTP real. Lo invoca la entrega de QA #33.

## Verificación

Regresiones con Node 24.22.1: opciones 101, cursor opaco, Escape, envío pendiente, retorno del foco simulado, bloqueo de reasignación ante un error y reintento del cursor fallido. La contención nativa de Tab se verificó también en Edge, junto a Escape y devolución del foco.

La primera suite completa con Node 26 tuvo 31 aprobadas, una fallida por espera inicial de un segundo y dos integraciones omitidas; no se considera una aprobación global ni una ejecución del entorno objetivo.

La ejecución integrada de #33 terminó con salida 0 y 16 casos aprobados, incluidos creación de pacientes/placas, opciones después de 100, sesiones, reasignación con lecturas oficiales de dos placas, historia original inmutable, conflictos de deshabilitación y usuarios/auditoría. Resultados y capturas: `marielos-pl2-09.md` y su reporte JSON. No se solicita cierre automático ni se sustituyen las revisiones de Lis, Axel y coordinación.
