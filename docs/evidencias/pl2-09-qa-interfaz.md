# PL2-09 - QA de interfaz y evidencia de aceptacion

## Objetivo y alcance

Esta primera entrega documenta la linea base de QA para el issue #33, asignado a `@orem6`. Cubre la planificacion de pruebas de interfaz, responsividad, accesibilidad, calidad de mediciones y evidencias reproducibles. No modifica modulos funcionales ni acredita ejecuciones de navegador, API, simulador o Firebase.

El alcance funcional esperado procede de `README.md`, `AGENTS.md`, `docs/arquitectura/README.md` y de los contratos locales presentes. La revision estatica se realizo sobre la rama `qa/orem6-pl2-09` con arbol inicialmente limpio.

## Responsabilidad de @orem6

- Revisar de forma cruzada contratos, integracion y recorrido de demostracion.
- Definir y ejecutar pruebas reproducibles de interfaz cuando los modulos dependientes esten integrados.
- Registrar resultados, comandos, capturas y limitaciones sin incluir secretos.
- Comunicar hallazgos a los responsables sin editar sus modulos funcionales sin coordinacion.

## Estado de contratos y dependencias

- Los contratos locales `contracts/device.openapi.yaml` y `contracts/web.openapi.yaml` declaran `info.version: 1.0.0`.
- No se encontro localmente un contrato `2.0.0`, documento de migracion ni definicion del rol `viewer`.
- La arquitectura local define los roles `admin` y `operator` en `docs/arquitectura/README.md:24`.
- Los casos que dependan de contrato 2.0.0, del rol `viewer` o de cambios aun no integrados permanecen bloqueados hasta contar con su especificacion y modulos correspondientes.

## Interpretacion de estados

El estado expresa el resultado de ejecucion, no el resultado de una inspeccion estatica.

- `NO EJECUTADO`: el caso puede comprobarse total o parcialmente con el estado actual, pero aun no se ejecuto ni tiene evidencia verificable.
- `BLOQUEADO`: falta contrato, endpoint, modulo o escenario necesario para ejecutar el caso de forma valida.
- `APROBADO`: reservado para un caso ejecutado con resultado esperado y evidencia verificable.
- `FALLIDO`: reservado para un caso ejecutado cuyo resultado observado no cumple el esperado.

La columna **Disponibilidad** separa los casos parcialmente comprobables de los bloqueados. Ninguna fila de esta entrega corresponde a una prueba ejecutada.

## Matriz de responsividad

| ID | Escenario | Anchos | Resultado esperado | Disponibilidad | Estado |
| --- | --- | --- | --- | --- | --- |
| R-01 | Inicio, login, sesiones y detalle sin desbordamiento horizontal | 360 px | Navegacion, tarjetas, formularios y contenido visibles sin corte inesperado | Parcialmente comprobable: rutas y componentes base | NO EJECUTADO |
| R-02 | Inicio, login, sesiones y detalle en tableta | 768 px | Jerarquia, columnas y controles utilizables sin solapamiento | Parcialmente comprobable: rutas y componentes base | NO EJECUTADO |
| R-03 | Inicio, login, sesiones y detalle en escritorio | 1440 px | Uso consistente del espacio, tablas y graficas legibles | Bloqueado: sesiones, historial y graficas integrados | BLOQUEADO |
| R-04 | Cabecera y menu de navegacion | 360, 768 y 1440 px | No se corta, solapa ni oculta enlaces; estado activo distinguible | Parcialmente comprobable: cabecera existente | NO EJECUTADO |
| R-05 | Formularios y tablas | 360, 768 y 1440 px | Controles legibles, tabla con respuesta adaptativa o desplazamiento intencional | Bloqueado: modulo de sesiones e historial de `@Lis671` | BLOQUEADO |
| R-06 | Graficas de tendencia | 360, 768 y 1440 px | Sin desborde; ejes, unidades y leyendas legibles; no se presentan como PPG o ECG | Bloqueado: dashboard y graficas de `@Javifa2324` | BLOQUEADO |

## Accesibilidad y teclado

| ID | Escenario | Resultado esperado | Disponibilidad | Estado |
| --- | --- | --- | --- | --- |
| A-01 | Recorrido con Tab y Shift+Tab | Orden de foco logico, sin trampas y con foco visible | Parcialmente comprobable: navegacion y controles base | NO EJECUTADO |
| A-02 | Activacion por teclado | Enlaces con Enter y botones con Enter/Espacio realizan la misma accion que el puntero | Bloqueado: flujos integrados de autenticacion, sesiones y dashboard | BLOQUEADO |
| A-03 | Formularios de acceso y sesion | Labels asociados, nombres accesibles, errores junto al campo y anuncio de cambios asincronos | Bloqueado: `@Mar-03` y `@Lis671` | BLOQUEADO |
| A-04 | Estados de carga, error y exito | Se anuncian mediante region accesible sin interrumpir el foco | Bloqueado: componentes integrados | BLOQUEADO |
| A-05 | Preferencia de movimiento reducido | Indicadores animados no generan movimiento continuo no reducido | Parcialmente comprobable: animaciones existentes; correccion depende de estilos compartidos | NO EJECUTADO |
| A-06 | Contraste | Texto, estados y foco cumplen contraste verificable en navegador | Parcialmente comprobable: interfaz base existente | NO EJECUTADO |

## Calidad, contacto, nulos y unidades

| ID | Escenario | Resultado esperado | Disponibilidad | Estado |
| --- | --- | --- | --- | --- |
| Q-01 | `valid` | Valor y unidad correctos para pulso, SpO2 estimada y temperatura superficial | Bloqueado: API, simulador y dashboard | BLOQUEADO |
| Q-02 | `no_contact` | Pulso y SpO2 se muestran como ausentes con estado de falta de contacto; temperatura puede seguir disponible | Bloqueado: simulador de `@HugoX2024`, API y dashboard | BLOQUEADO |
| Q-03 | `unavailable` | La medicion afectada se representa como no disponible, sin sustituirla por cero | Bloqueado: API y dashboard | BLOQUEADO |
| Q-04 | `invalid` | La medicion afectada se representa como invalida, sin sustituirla por cero | Bloqueado: API y dashboard | BLOQUEADO |
| Q-05 | `stale` | Dato desactualizado se distingue de falta de contacto y de desconexion | Bloqueado: metadatos `latest`, simulador y dashboard | BLOQUEADO |
| Q-06 | Valores `null` | Un valor nulo se muestra como ausencia, por ejemplo `-`, nunca como `0` | Bloqueado: API y dashboard | BLOQUEADO |
| Q-07 | Unidades | Pulso en `bpm`, SpO2 estimada en `%` y temperatura superficial en `°C` | Bloqueado: API y dashboard | BLOQUEADO |
| Q-08 | Origen y lectura historica | La sesion simulada se identifica; una sesion finalizada no se presenta como lectura en vivo | Bloqueado: sesiones, API y dashboard | BLOQUEADO |

## Carga, error, vacio y desconexion

| ID | Escenario | Resultado esperado | Disponibilidad | Estado |
| --- | --- | --- | --- | --- |
| E-01 | Carga de health check | Indicador de consulta visible hasta la respuesta | Parcialmente comprobable: vista y health check existentes | NO EJECUTADO |
| E-02 | Error de health check | Mensaje comprensible y accion de reintento disponible | Parcialmente comprobable: vista y health check existentes | NO EJECUTADO |
| E-03 | Sesion sin muestras | Estado vacio diferenciado de error y de cero | Bloqueado: `GET /sessions/{id}/latest` integrado | BLOQUEADO |
| E-04 | Error de API de sesiones | Error visible, accion recuperable y sin perdida silenciosa del contexto | Bloqueado: API y frontend de sesiones | BLOQUEADO |
| E-05 | Desconexion | La falta de heartbeat/mediciones se representa como desconexion o antiguedad, no como `no_contact` | Bloqueado: simulador, API y dashboard | BLOQUEADO |
| E-06 | Finalizacion | Se detiene la actualizacion en vivo y se conservan lecturas historicas | Bloqueado: API, sesiones, historial y dashboard | BLOQUEADO |

## Dependencias de integrantes

| Responsable | Dependencia para QA |
| --- | --- |
| `@AxelHerrera11` | Layout, rutas y componentes compartidos para pruebas de navegacion y comportamiento responsive. |
| `@Mar-03` | Login, logout, CSRF, sesion y autorizacion para validar formularios y acceso. |
| `@DidhyerOrtiz` / `@DidhyerOrtizG` | Endpoints de dispositivos, sesiones, ultima medicion e historial. |
| `@gioore` | Persistencia y datos de demostracion disponibles a traves de la API. |
| `@HugoX2024` | Escenarios reproducibles de medicion valida, sin contacto, no disponible y desconexion. |
| `@Javifa2324` | Dashboard, estados de calidad, actualizacion y tendencias. |
| `@Lis671` | Creacion, inicio, finalizacion, listado e historial de sesiones. |
| Coordinacion | Contrato 2.0.0, definicion de `viewer` y vinculacion de los issues #29, #30 y #31. |

## Hallazgos de inspeccion estatica

Los siguientes hallazgos proceden solo de lectura de codigo. No son pruebas ejecutadas y, por tanto, no usan los estados de ejecucion de las matrices.

| Referencia | Hallazgo | Implicacion para QA |
| --- | --- | --- |
| `apps/web/src/features/auth/AuthCard.tsx:36,51` | Los elementos `label` no estan asociados por `htmlFor` a un `id` de control. | Verificar asociacion programatica al integrar el formulario. |
| `apps/web/src/features/auth/AuthCard.tsx:39,54` | Los inputs no declaran `name`; el correo tampoco declara `autocomplete` ni `spellCheck={false}`. | Verificar atributos de formulario al integrar autenticacion. |
| `apps/web/src/components/layout/Layout.tsx:10` | No existe enlace de salto al contenido principal antes de la navegacion. | Verificar navegacion repetitiva por teclado. |
| `apps/web/src/features/home/HomePage.tsx:95-116` | Los cambios asincronos de carga, error y exito no declaran una region `aria-live`. | Verificar anuncios de estado tras integrar flujos asincronos. |
| `apps/web/src/components/layout/Header.tsx:15-49` | La cabecera sticky y el menu sin ajuste de linea requieren comprobacion a 360 px para descartar desborde o foco cubierto. | Ejecutar R-04 en navegador. |
| `apps/web/src/components/layout/Header.tsx:19` y `apps/web/src/features/home/HomePage.tsx:57` | Existen animaciones continuas que requieren comprobacion con `prefers-reduced-motion`. | Ejecutar A-05 en navegador. |
| `apps/web/src/features/monitoring/DashboardPage.tsx:48-100` | Las tarjetas son estaticas; no representan datos reales, calidad, antiguedad, desconexion ni historial. | Mantener Q-01 a Q-08 y E-03 a E-06 bloqueados. |

## Evidencias pendientes

- Capturas o snapshots reales para 360, 768 y 1440 px.
- Recorrido por teclado documentado, incluyendo foco visible y accion de controles.
- Evidencia de lector de pantalla o inspeccion de nombres accesibles de los flujos integrados.
- Respuestas reproducibles para `valid`, `no_contact`, `unavailable`, `invalid`, `stale`, valores nulos y desconexion.
- Evidencia de carga, error, vacio, sesion finalizada e historial persistido.
- Contrato 2.0.0, definicion del rol `viewer` y relacion con los issues #29, #30 y #31.

## Plantilla de registro de ejecucion

Usar una entrada por caso ejecutado. No completar esta plantilla como evidencia hasta contar con resultado real y artefacto verificable.

```text
ID del caso:
Fecha:
Commit evaluado:
Entorno:
Navegador:
Ancho de pantalla:
Pasos ejecutados:
Resultado esperado:
Resultado observado:
Estado: APROBADO | FALLIDO | NO EJECUTADO | BLOQUEADO
Evidencia:
```

## Criterios de aceptacion de PL2-09

- [ ] Se ejecutan y documentan pruebas reales a 360, 768 y 1440 px.
- [ ] Menu, formularios, tablas y graficas no presentan desborde inesperado en los anchos aplicables.
- [ ] La navegacion por teclado, el foco visible, las etiquetas y los anuncios de estado son verificables.
- [ ] Se distinguen `valid`, `no_contact`, `unavailable`, `invalid` y `stale` sin representar valores nulos como cero.
- [ ] La desconexion se distingue de una lectura actual y de la falta de contacto.
- [ ] Se cubren carga, error, ausencia de datos y finalizacion de sesion con evidencia real.
- [ ] Los resultados se clasifican con evidencia como `APROBADO`, `FALLIDO`, `NO EJECUTADO` o `BLOQUEADO`; esta entrega no marca ningun caso como aprobado.
- [ ] Las restricciones de `viewer` se prueban solo despues de contar con su definicion contractual e implementacion integrada.
