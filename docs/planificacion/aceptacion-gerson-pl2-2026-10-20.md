# Gerson — aceptación y pendientes de PL2

Fecha de corte: 20 de octubre de 2026 (America/Guatemala). Base consultada: `main` en `1385d23`. Este seguimiento relaciona los criterios de los issues con entregas y evidencias; no modifica contratos, asignaciones ni estados de los issues.

**Ampliación ejecutada:** [prueba local de Auth, persistencia y monitoreo](../evidencias/gerson-integracion-auth-monitoreo.md). Se comprobaron #41 y #42 juntos en una rama local: 148 pruebas API, 16 web y las dos de historial contra API autenticada, más el recorrido de navegador real con tres páginas y estados de conexión. Los PR siguen abiertos y esa combinación no se fusionó en main. El resultado propio no sustituye reproducción por otro integrante ni aceptación del equipo.

## Fuentes y estado comprobado

Rigen el [contrato aprobado](../arquitectura/contrato-aprobado-2026-10-18.md), el [plan de ejecución](ejecucion-2026-10-18.md), el [modelo objetivo](../../firebase/modelo-objetivo.md) y los criterios de [#25](https://github.com/codsebas/PulsoLink/issues/25), [#26](https://github.com/codsebas/PulsoLink/issues/26), [#29](https://github.com/codsebas/PulsoLink/issues/29) y [#34](https://github.com/codsebas/PulsoLink/issues/34). Los alcances específicos y exclusiones de cada issue se leen junto a la regla común de integración.

- [#39](https://github.com/codsebas/PulsoLink/pull/39), Gerson: mergeado; base Firebase, repositorios, migración, lecturas HTTP por paciente y propuesta de dashboard.
- [#38](https://github.com/codsebas/PulsoLink/pull/38), Lis: mergeado; vistas administrativas. El menú ya conserva administración y `/monitoring`. El conflicto de menú descrito en la revisión anterior es histórico.
- [#40](https://github.com/codsebas/PulsoLink/pull/40): mergeado; planificación de QA. No acredita pruebas funcionales ejecutadas. Su descripción de contratos 1.0 y ausencia de viewer quedó desactualizada frente a los OpenAPI 2.0.0 presentes; actualizar la línea base con QA antes de ejecutar sus casos.
- [#41](https://github.com/codsebas/PulsoLink/pull/41), Marielos, `d9180f5`: abierto. Gerson ya publicó [aprobación limitada a persistencia](https://github.com/codsebas/PulsoLink/pull/41#pullrequestreview-5594365355); no sustituye seguridad/backend ni aceptación visual.
- [#42](https://github.com/codsebas/PulsoLink/pull/42), Javier, `e1a0387`: abierto; propone hooks, series y acumulación paginada del historial. No considerar esas mejoras disponibles en main todavía.

## #25 — base Firebase e identidades

| Criterio del issue | Entrega y evidencia | Pendiente de aceptación |
| --- | --- | --- |
| Otro integrante levanta emuladores y datos con comandos documentados | [Guía Firebase PL2](../setup/firebase-pl2.md), `seed-emulators.ts` y [evidencia de Gerson](../evidencias/gerson-pl2.md) | Registrar una reproducción por otro integrante, con entorno y resultado. Una ejecución propia no confirma este criterio. |
| Aprovisionamiento repetible sin alterar datos existentes | [firebase-fixtures.test.ts](../../apps/api/test/firebase-fixtures.test.ts) y [persistence.test.ts](../../apps/api/test/persistence.test.ts): repetición, conservación de perfiles/contraseña/reservas y rechazo de secreto distinto | Asociar la evidencia ya ejecutada al criterio; atender incidencias que reporte quien reproduzca la guía. |
| Perfiles admin/viewer y datos de prueba sin credenciales publicadas | Semilla de emuladores y generación local de secretos; identidades por UID | Confirmar disponibilidad para los escenarios de integración del equipo, sin compartir secretos en issues. |
| Frontend/placa sin Admin SDK ni acceso directo a datos | Reglas de denegación y prueba de acceso cliente en `persistence.test.ts`; web consume API | Mantener esta restricción al integrar Auth, API y emisores. |
| Firmas/DTO acordados con Didhyer y Marielos | [Interfaces publicadas](../arquitectura/persistencia-pl2-integracion.md) y revisión de persistencia de #41 | Confirmar con ambos la adopción de firmas/DTO. La aprobación de Gerson a #41 no equivale a una aceptación de Didhyer. |

El alcance excluye pantallas, firmware y controladores HTTP. No se necesita otro módulo Firebase para completar este issue. Tampoco exige activar una instancia facturable: el entorno de prueba puede usar los emuladores documentados.

## #26 — repositorios, transacciones e historial

| Criterio del issue | Evidencia disponible |
| --- | --- |
| Exclusividad concurrente de asignaciones y sesiones | [patient-persistence.test.ts](../../apps/api/test/patient-persistence.test.ts): reservas por placa/paciente, sesión creada y cierre contra creación. |
| Duplicado idéntico sin registros nuevos; conflicto acordado | `persistence.test.ts`, `patient-persistence.test.ts` y pruebas HTTP de dispositivo: deduplicación y conflicto de carga. |
| Dos placas sucesivas conservan ambos tramos y cuatro IDs | `patient-persistence.test.ts` y [patient-monitoring-api.test.ts](../../apps/api/test/patient-monitoring-api.test.ts). |
| Paginación/filtros sin mezclar pacientes y desempate por ruta | `patient-persistence.test.ts` comprueba fechas e IDs de lectura iguales entre sesiones; los cursores quedan ligados a su consulta. |
| Índices versionados y distinción emulador/Standard real | [Índices](../../firebase/firestore.indexes.json) y límites expresos en la guía de persistencia. No se afirma despliegue en nube. |
| Migración sin borrar claves ni fabricar relaciones | [legacy-migration.test.ts](../../apps/api/test/legacy-migration.test.ts): dry-run, respaldo obligatorio, correspondencias explícitas, repetición y recuperación. |

Los seis criterios tienen implementación y evidencia local registrada. La entrega es **candidata a aceptación**, para contrastar los resultados con Sebastián y Didhyer antes de cerrar el issue. No hace falta reescribir repositorios ni añadir funciones fuera del alcance para presentar esa aceptación.

El criterio de índices exige distinguir entornos, no una prueba en nube como condición adicional de cierre de #26. La consulta real de índices y su despliegue se mantienen pendientes para declarar lista la fase de nube/despliegue de #34.

## #29 — lo que sigue correspondiendo a Gerson

La distribución del issue asigna a Gerson estructura del dashboard, integración de componentes/gráficas con TanStack Query y persistencia/historial. Keily comparte el diseño y trabaja tarjetas, estados visuales, móvil y accesibilidad; Marielos y Axel validan el diseño; Javier suministra los hooks y series.

1. Revisar la integración de #42 con el dashboard cuando se acuerde su incorporación: reutilizar sus hooks y series, evitando dos consultas históricas paralelas. El PR ya propone modificar la pantalla, por lo que primero debe contrastarse su cambio, no implementarlo por segunda vez.
2. Comprobar la combinación con el login y limpieza de caché de #41, junto con la API objetivo de #27. El login web en main todavía es un punto de integración y la creación de sesiones HTTP conserva `participantCode`.
3. Presentar con Keily la propuesta existente a Marielos/Axel y resolver sus observaciones. Capturas de contrato no sustituyen aprobación visual.
4. Demostrar con API y emuladores: apertura auditada una vez, paciente con dos placas sucesivas, paginación hasta el inicio registrado, rango cargado visible, huecos/null conservados y polling detenido al salir. Coordinar evidencia de escritorio/móvil y aceptación con QA (#33).

La base ya entregada permite avanzar en revisión e integración. La demostración completa y el cierre dependen de #27/#28/#31 y de la aceptación de interfaz; no se certifican por el merge de #39.

## #34 — parte de Gerson y dependencias compartidas

Gerson mantiene emuladores, persistencia reproducible, índices y migración. Los scripts/documentación ya existen: [entorno](../setup/firebase-pl2.md), [migración y recuperación](../arquitectura/persistencia-pl2-integracion.md) y [verificación PowerShell](../../tools/firebase/verify-gerson.ps1).

- Reproducir y registrar el procedimiento con otro integrante; consolidar variables por entorno sin valores sensibles y resultados de aceptación.
- Al acordarse acceso a un proyecto de prueba: comprobar edición Standard, desplegar índices y probar las consultas que se van a usar. No declarar esa fase validada por pruebas de emulador.
- Preparar y revisar inventario/manifest/respaldo para una migración real solo cuando exista un entorno y una ventana acordados. Tener una herramienta probada no obliga a aplicarla sin datos o necesidad de migración.
- Sebastián coordina alojamiento, mismo origen/HTTPS y aceptación integral; Javier automatización y dependencias. La prueba física de NodeMCU sigue en #35. Gerson aporta Firebase a ese recorrido; no asume las entregas de los demás.

## Evidencias: no mezclar ramas ni entornos

| Referencia | Qué se ejecutó | Qué no acredita |
| --- | --- | --- |
| #39 y main `e2a06e1` tras el merge | 127 pruebas/19 archivos con Auth y Firestore Standard emulados; tipos/build; navegador con fixture HTTP | Nube, hardware o dashboard íntegro con login real desde la web. |
| main `1385d23` | Typecheck y build globales tras #38/#40. No cambió API/Firebase respecto a `e2a06e1` | No se volvió a ejecutar la suite de 127 pruebas en ese commit para esta comprobación. |
| Revisión de #41 `d9180f5` | `./tools/firebase/verify-gerson.ps1`: 148 pruebas/22 archivos, tipos/build y espacios; índices revisados estáticamente | Ese resultado pertenece al PR abierto, no a main. No certifica índices desplegados ni seguridad integral. |

Entorno de las ejecuciones propias anteriores: Windows PowerShell, Node 24.15.0, Java 21, Firebase CLI 15.34.0, proyecto desechable `demo-pulsolink`. Las suites que simulan fallos de Auth se distinguen de las que usan Auth Emulator real en la revisión publicada. El lint del repositorio es un marcador; no se presenta como análisis estático.

La revisión documental inicial contrastó fuentes sin repetir suites funcionales. La ampliación enlazada arriba ejecutó la combinación local de #41/#42 y distingue sus resultados de main. Las evidencias históricas conservan su fecha y contexto.

## Entrega propuesta y siguiente paso

Presentar este seguimiento con enlaces al PR #39 y sus pruebas para acordar la aceptación de #25/#26. Registrar el resultado de la reproducción y de los acuerdos de interfaces cuando ocurran; no marcar los criterios como cumplidos por suposición. Continuar #29/#34 con las dependencias señaladas. No cerrar automáticamente ninguno de los cuatro issues ni volver a subir el código ya mergeado.
