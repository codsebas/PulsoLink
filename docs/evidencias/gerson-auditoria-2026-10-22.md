# Gerson — seguimiento de auditoría del 22 de octubre

Responsable: `@gioore`. Entorno de esta corrección: Windows/PowerShell, Node 24.15.0, React 18 y TanStack Query 5.

Se contrastó la auditoría entregada a las 00:03 Guatemala con los issues y PR actuales. Este documento registra entregas y límites; no cierra issues ni sustituye la aceptación de otro integrante.

## Entregas relacionadas

| Hallazgo | Entrega | Alcance y pendiente |
| --- | --- | --- |
| A01, credencial de placa física | [PR #62](https://github.com/codsebas/PulsoLink/pull/62), integrado en `main` (`ebacc48`) | Aprovisionamiento privado, validación administrativa, hash y transacción repetible, seis regresiones nuevas. Falta que Sebastián identifique la NodeMCU y cargue su configuración; no se emitió una credencial cloud para hardware desconocido. [Procedimiento](../setup/placa-fisica-aprovisionamiento.md). |
| A11, aprovisionamiento de identidades | [PR #63](https://github.com/codsebas/PulsoLink/pull/63), presentado a revisión | Conserva contraseña, nombre y estado existentes; rechaza cuentas deshabilitadas y destinos inconsistentes. Cuatro regresiones con Auth/Firestore emulados. No es una herramienta para modificar contraseñas ni permisos de cuentas existentes. |
| Aceptación de negocio con Firebase real | PR #63, presentado a revisión | Última ejecución: 95 comprobaciones PASS, protocolos conjuntos de reasignación y concurrencia, paginación, permisos y persistencia tras reiniciar la API local; limpieza PASS. Primera ejecución: 89 PASS. Los conteos varían con los ACK concurrentes. [Guía del PR](https://github.com/codsebas/PulsoLink/blob/fix/gerson-aprovisionamiento-cuentas/docs/setup/firebase-aceptacion-cloud.md). No acredita hosting HTTPS ni hardware. |
| A13, descubrimiento de sesión externa | Esta rama `fix/gerson-descubrimiento-sesiones`, base `ebacc48` + cambios | Defecto reproducido antes de corregirlo. Consulta de sesión activa cada 5 s en reposo y 2 s con sesión; se pausa oculta y ante 401/403/404. Las lecturas mantienen su plan separado. |

## Reproducción y corrección de A13

La pantalla se abría con `/sessions?patientId=…&status=active&limit=1` vacío. El intervalo retornaba `false` y nunca volvía a buscar, aunque otro administrador iniciara una sesión. Foco, recarga o el botón Actualizar podían ocultar el defecto.

La regresión abre el paciente sin sesión, cambia solo las respuestas del servidor y espera el estado «Monitoreo activo», sin botones, recarga, invalidación de caché ni foco. Antes del cambio falló tras 6,5 s. Después comprueba además la finalización y descubrimiento de una segunda sesión, sin repetir el evento de acceso ni descargar periódicamente el archivo histórico en reposo. Otra regresión oculta la pestaña, confirma cero consultas adicionales de sesiones durante 5,5 s y verifica su descubrimiento al volver.

```powershell
npm run test --workspace=@pulsolink/web -- test/patient-monitoring-page.test.tsx
npm run test --workspace=@pulsolink/web -- --maxWorkers=2
npm run typecheck
npm run build
git diff --check
```

Resultado focal: 7/7 pruebas aprobadas. Suite web: 41 aprobadas y dos omitidas que requieren una API autenticada externa. Son pruebas de integración React/Query con HTTP simulado en jsdom; no se presentan como ejecución de navegador, Firebase real o hardware. La primera reproducción fallida y la primera ejecución focal aprobada usaron temporizadores reales. Una ejecución global simultánea al build agotó el margen de espera; las regresiones nuevas controlan ahora solamente los intervalos para evitar depender de la carga del runner, manteniendo notificaciones y esperas reales. La suite global se ejecutó de nuevo y pasó. Tipos y build de los tres workspaces aprobados; build advierte del tamaño de un bundle web mayor de 500 kB.

No se cambia el contrato HTTP, las gráficas, el diseño ni la política de paginación que Javier propone en #60. La detección normal requiere hasta 5 s más el tiempo de red y del render; las consultas de lecturas solo se reactivan al descubrir una sesión activa. La visibilidad vuelve a habilitar el temporizador, sin prometer una consulta instantánea.

## Qué sigue abierto para Gerson y el equipo

- **#25, Firebase e identidades:** revisión de #63 y reproducción de los procedimientos por otro integrante. La configuración real y el código no equivalen a esa aceptación independiente.
- **#26, persistencia:** contrastar la evidencia de emuladores y cloud con cada criterio de cierre. #63 amplía la evidencia real, pero no ejecuta toda la matriz transaccional ni migraciones contra cloud. El timeout de producto de 5 s sigue observado en #51; el PASS de QA con 30 s no lo resuelve.
- **#34, compartido:** Gerson aporta Firebase, emuladores, índices, migración y procedimientos. Javier mantiene automatización/manifiestos (#60); Sebastián coordina destino de alojamiento, HTTPS y variables del despliegue.
- **Sebastián:** identificar y configurar la NodeMCU, firmware/sensores y recorrido físico. El identificador físico o MAC identifica la placa, pero no reemplaza su credencial privada.
- **Marielos, Axel y QA:** revisar estas entregas y completar aceptación independiente en el entorno final. Los PR se solicitan a los tres supervisores.

Las pantallas administrativas y de calidad ya tienen entregas del equipo. No se duplican aquí ni se declara terminado todo el proyecto. No se cierran #25/#26/#34 hasta comprobar sus criterios pendientes.
