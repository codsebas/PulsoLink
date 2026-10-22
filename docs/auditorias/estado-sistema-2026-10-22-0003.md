# Auditoría de PulsoLink — corte del 22 de octubre de 2026, 00:03

**Zona horaria:** Guatemala, UTC−06:00. El corte corresponde a **2026-10-22 06:03:00 UTC**.

**Repositorio:** [codsebas/PulsoLink](https://github.com/codsebas/PulsoLink).

**Código de referencia:** [`a1c12bc9cab5647140f7c6605b6396f68c356f54`](https://github.com/codsebas/PulsoLink/commit/a1c12bc9cab5647140f7c6605b6396f68c356f54), último commit de `main` anterior al corte; merge de #56 a las **23:35:33 del 21 de octubre**.

**Objeto:** identificar lo entregado, lo pendiente, su impacto, dependencias, responsables y condiciones de cierre. Esta auditoría no modifica el producto, no cierra issues ni sustituye la aceptación de los responsables.

> **Sí existe el inicio de sesión. Sí hay Firebase real de pruebas. Sí está integrada la API de negocio y la corrección reciente del historial. Todavía no está acreditado el recorrido completo del dispositivo físico hasta la web, ni un despliegue web/API con HTTPS, ni la aceptación integral de todas las pantallas.**
>
> Gerson ya entregó una parte sustancial de Firebase, persistencia e historial. No corresponde atribuirle todos los pendientes ni afirmar que falta construir el login. Tampoco corresponde declarar el proyecto terminado por tener Firebase.

## 1. Cómo interpretar este informe

Se usa esta clasificación para no mezclar pruebas con suposiciones:

| Marca | Significado |
| --- | --- |
| **Código** | Comprobado por inspección del código que estaba en `main` al corte. No implica ejecución del recorrido completo. |
| **Ejecutado** | Comprobación realizada durante esta auditoría sobre ese código. Las ejecuciones fueron posteriores a las 00:03. |
| **Evidencia previa** | Resultado registrado por el equipo en un PR, documento o artefacto anterior al corte; revisado, pero no repetido íntegramente aquí. |
| **Pendiente** | Entregable o aceptación exigida que no queda acreditada por las fuentes consultadas. |
| **A reproducir** | Riesgo o comportamiento que requiere un caso ejecutado para confirmar alcance y severidad. |

Las prioridades son una **propuesta de esta auditoría**, no etiquetas ya asignadas por GitHub:

- **P0:** necesario para demostrar la entrega completa en su entorno objetivo.
- **P1:** defecto, conformidad o validación necesaria antes de dar por cerrado el alcance.
- **P2:** mejora o seguimiento con mitigación que no impide todo el recorrido actual.

El orden es **1, 2, 3… desde lo más urgente hasta lo menos urgente**. Dentro de P0 se respeta el orden de dependencia. El HTTPS público no impide empezar una prueba física LAN expresamente documentada; sí condiciona la aceptación del despliegue.

**“Issue abierto” no significa “nada implementado”.** Hay entregas fusionadas cuyos criterios todavía requieren reproducción, revisión o conciliación. No se asignan porcentajes de avance ni se califica a una persona como atrasada sin una fecha de compromiso contrastada. Se señalan entregables pendientes por usuario.

## 2. Respuesta directa: qué hay y qué falta

| Área | Estado al corte | Qué impide declararla cerrada |
| --- | --- | --- |
| Firebase de pruebas | **Disponible según evidencia cloud de #55.** Firestore Standard, Authentication correo/contraseña, reglas e índices versionados. | Reproducción por otro integrante y verificación del recorrido de negocio completo en el entorno elegido. |
| Inicio/cierre de sesión | **Implementado e integrado en #41; login admin/viewer acreditado en Firebase real por #55.** | Conciliar todos los criterios de #28 y repetir los casos pertinentes en el despliegue final. No falta construir el login. |
| Autorización | **Implementada:** sesión, perfil vigente, admin/viewer, CSRF y control de origen. | Aceptación consolidada de permisos, deshabilitación, degradación, recuperación de operaciones y comportamiento en el hosting. |
| API de pacientes, placas, asignaciones y sesiones | **Integrada, especialmente #49.** Los bloqueos antiguos de rutas fueron cerrados. | Diferencias entre OpenAPI y validación/errores; aceptación final y latencia #51. |
| Persistencia/historial por paciente | **Implementados y probados previamente en emuladores.** IDs históricos, reservas y deduplicación. | No está repetida toda la matriz transaccional en cloud; aceptación externa de #26. |
| Historial web | **Corrección de continuidad y navegación integrada en #56.** | Repetición independiente, corrección del ejecutor antiguo de QA y revisión de una intermitencia documentada. |
| Pantallas administrativas | **Existen y tienen aprobación de fase A en #38.** | Fase B integrada con API, opciones truncadas en selectores y accesibilidad de diálogos. |
| Dashboard visual | **Existe y consume API.** | Estados visuales pedidos por coordinación, revisión móvil/teclado y aprobación final de supervisores. |
| Simulador | **Implementado con contrato oficial y descarte sin cola.** 27 pruebas pasaron en esta auditoría. | Concurrencia a cinco segundos sigue observada; ampliar/aceptar QA de #57. |
| Dispositivo físico | **Sketch y lectura de prueba HTTP presentes.** | Credencial de placa real, protocolo oficial, sesión, heartbeat, config, HTTPS y demostración persistida. |
| Despliegue web/API | **No acreditado.** Firebase configurado no publica automáticamente Express y React. | Hosting, mismo origen, HTTPS, variables, arranque y pruebas del recorrido desplegado. |
| Automatización | **Hay verificadores útiles de Firebase e integración.** | Node 24 coherente, verificación global, lint real y CI. No hay checks de Actions que certifiquen este commit. |
| QA global | **Hay evidencias parciales y amplias suites previas.** | #57 seguía abierto; falta consolidar navegador, Windows y aceptación final de #32/#33. |

## 3. Trabajo pendiente en orden de prioridad

| Orden | Prioridad | Entregable concreto | Responsable / coordinación | Afecta o bloquea | Dependencias |
| --- | --- | --- | --- | --- | --- |
| **1** | **P0** | Procedimiento seguro y repetible para aprovisionar la **placa física** y su credencial oficial. | **@gioore**, con **@codsebas** y **@DidhyerOrtiz**; #25/#35. | La placa no puede autenticarse por crear solamente su registro desde la web. | Repositorio de credenciales existente; identificar la placa real y entregar el secreto fuera de Git. |
| **2** | **P0** | Completar firmware para config, heartbeat, credencial, sesión y medición oficial; demostrar placa → API → Firestore → web. | **@codsebas**; apoyan @DidhyerOrtiz, @gioore, @HugoX2024; #35. | Entrega física y prueba integral del proyecto. | Paso 1; API ya integrada; paciente/asignación/sesión; LAN documentada o HTTPS validado. |
| **3** | **P0** | Preparar y acreditar alojamiento web/API, mismo origen y HTTPS. | **@codsebas**; **@Javifa2324** scripts/manifiestos, **@gioore** configuración Firebase; #34. | Uso compartido/desplegado y aceptación de cookies/TLS. | Destino de alojamiento, secretos por entorno, configuración de Firebase y procedimiento de inicio. |
| **4** | **P1** | Actualizar el ejecutor de historial y repetir independientemente #56. | **@HugoX2024**, QA #33 con @orem6/@DidhyerOrtiz; @gioore/@Javifa2324 resuelven defectos si reaparecen. | Cierre verificable de #29/#31/#33. | Código #56 ya integrado; datos sintéticos, API/emuladores y navegador. |
| **5** | **P1** | Completar fase B de administración y corregir selectores de más de 100 pacientes/placas y más de 50 asignaciones activas. | **@Lis671**; revisión @AxelHerrera11/@Mar-03 y apoyo API @DidhyerOrtiz; #30. | Operación administrativa completa con conjuntos grandes. | API actual; fixtures suficientes y navegación/búsqueda paginada de opciones. |
| **6** | **P1** | Resolver visuales de calidad/conectividad, diálogos por teclado y revisión responsive. | **@orem6** visual de #29; **@Lis671** diálogos de #30; supervisan **@Mar-03/@AxelHerrera11**. | Aceptación de UX, accesibilidad y #33. | Requisitos visuales acordados y pruebas 360/768/1440. No espera otra implementación Firebase. |
| **7** | **P1** | Revisar e integrar #57; completar contraste API/web y repetir en Windows. | **@AxelHerrera11** autor y **@HugoX2024** revisor; #32. | Matriz de QA vigente en `main` y cierre de permisos/consistencia. | PR abierto, runner existente; decisiones de códigos de error. |
| **8** | **P1** | Alinear OpenAPI, Zod, DTO y códigos de error sin cambios silenciosos de contrato. | **@DidhyerOrtiz**, @Mar-03 para auth, @gioore para persistencia; coordina **@codsebas**; #27/#28/#32. | Conformidad del contrato y consumidores que dependen de errores exactos. | Decisión explícita de formato temporal, IDs y catálogo de errores; actualizar pruebas/documentación. |
| **9** | **P1** | Unificar entorno Node 24, verificación global, lint y CI. | **@Javifa2324**, con @gioore y @codsebas; #34. | Reproducibilidad y confianza de futuras integraciones. | Aprovechar scripts existentes, fijar runtimes y ejecutar checks reales. |
| **10** | **P1 antes de exposición pública** | Revisar y corregir hallazgos de dependencias con actualizaciones controladas. | Coordinación **@Javifa2324/@codsebas**; propietarios de cada workspace. | Seguridad/mantenimiento del entorno y aprobación del despliegue. | Análisis de alcance y regresión. El resultado de `npm audit` es suplementario, consultado después del corte. |
| **11** | **P1, aceptación** | Reproducir base Firebase, conciliar criterios de auth/persistencia y documentar cloud frente a emulador. | **@gioore**, **@Mar-03**, aceptación backend **@codsebas/@DidhyerOrtiz**; #25/#26/#28. | Cierre formal y verificable de módulos ya entregados. | Procedimientos existentes. No exige rehacer Firebase ni login. |
| **12** | **P2 con seguimiento obligatorio** | Resolver o aceptar con criterio medido la latencia de concurrencia #51 a cinco segundos. | **Sin asignado en GitHub**. @codsebas debe designar; se propone @DidhyerOrtiz con @gioore, reproducción @HugoX2024. | Presupuesto de respuesta bajo carrera ingestión/finish; no bloquea toda la matriz a 30 s. | Trazas, repeticiones a 5 s, análisis de contención y preservación de atomicidad. |
| **13** | **P2** | Reproducir descubrimiento de sesión iniciada externamente cuando el monitor ya estaba abierto sin sesión activa. | **@Javifa2324/@gioore**, QA #33. | Posible actualización tardía de metadatos del monitor. | Caso de navegador; es una hipótesis estática, no un fallo confirmado. |
| **14** | **P2** | Actualizar mapa de estado, evidencias y checklists de issues; medir/corregir bundle. | Cada responsable; coordinación **@codsebas**, frontend **@AxelHerrera11/@Javifa2324**. | Entendimiento compartido y rendimiento, sin impedir todo el funcionamiento actual. | Aceptaciones anteriores; medición real de carga antes de optimizar. |

**No usar la tabla como una cola serial de catorce pasos.** Las pantallas, QA, contratos y automatización pueden avanzar en paralelo. La dependencia estricta más clara para hardware es credencial → firmware oficial → recorrido persistido.

## 4. Detalle técnico de los hallazgos y condiciones de cierre

### A01 — Aprovisionamiento de credencial de placa física

**Estado: brecha de procedimiento/código localizado; P0 para hardware.**

Crear un dispositivo mediante la API administrativa crea su registro y auditoría. Eso no equivale a crear una credencial `credentialId.secret`. El repositorio de credenciales autentica ese formato y compara el hash del secreto. El aprovisionamiento demo revisado crea dispositivos de origen simulado y protege contra reutilizar un registro real como si fuera demo.

**Fuentes de código:** `apps/api/src/modules/devices/devices.repository.ts`, repositorio de credenciales en ese módulo y `apps/api/src/scripts/demo-provisioning.ts`. No se localizó un procedimiento versionado equivalente para aprovisionar la placa real con todos esos pasos.

**Qué afecta:** aunque el firmware conozca el `deviceId`, la ruta oficial no lo acepta sin credencial válida. La cuenta administrativa Firebase nunca debe copiarse a la placa.

**Entregable de cierre:**

1. Procedimiento o script documentado que cree/verifique dispositivo real, credencial habilitada y asociación correcta.
2. Generación del secreto con suficiente entropía y persistencia de su hash, conforme al mecanismo existente.
3. Repetición sin sobreescribir dispositivos, cambiar secretos o rotar credenciales inesperadamente.
4. Entrega del secreto por un medio privado y carga en configuración local excluida de Git.
5. Prueba de config/heartbeat/medición con esa credencial; rechazo de credencial inválida, deshabilitada o de otra placa.
6. Registrar identificadores no sensibles y resultado, sin publicar secretos.

No se prescribe un nuevo endpoint público: el alcance puede satisfacerse con aprovisionamiento administrativo seguro.

### A02 — El sketch físico todavía usa el recorrido de prueba

**Estado: confirmado por código; P0 para demostración física.**

El sketch integrado en `firmware/nodemcu/src/sketch-pulsa-link-v1.2/` incorpora ESP8266, MAX30102 y DS18B20 y envío HTTP de prueba aproximadamente cada dos segundos. La configuración sensible se separa en un archivo local excluido de Git.

La ruta `/api/v1/dev/reading-test` valida y registra la recepción de prueba, responde con `persisted: false` y está limitada a desarrollo. **No utiliza ese envío para crear el historial oficial en Firestore.**

Faltan en el recorrido físico revisado:

- Autenticación oficial `Authorization: Bearer <credentialId>.<secret>`.
- Consulta de configuración y sincronización con la sesión que autoriza el backend.
- Heartbeat del contrato A.
- Envío a la ingestión oficial con el `sessionId` vigente.
- Manejo explícito de finalización, cambio de asignación y ausencia de sesión.
- HTTPS con verificación del servidor para el despliegue.
- Evidencia reproducible de compilación, carga, lectura física y muestra persistida en el paciente correcto.

**No basta cambiar la URL del POST.** Sin credencial y sesión válida, el backend debe rechazarlo.

**Cierre requerido:** una demostración con paciente ficticio y placa real que incluya lectura normal, retiro del dedo, magnitud no disponible/invalidada, pérdida y recuperación de Wi-Fi, finalización de sesión y reasignación. Las muestras generadas sin conexión deben descartarse: al volver debe quedar un hueco, no una ráfaga de datos atrasados. Confirmar `bootId` por arranque, secuencia y calidad/unidad por magnitud; el backend fija las relaciones históricas.

El hardware no fue compilado, flasheado ni medido durante esta auditoría. Archivos presentes y ensamble reportado no acreditan funcionamiento físico completo.

### A03 — Firebase cloud no es el despliegue de React y Express

**Estado: configuración de aplicación desplegada no acreditada; P0 para entrega alojada.**

La configuración Firebase revisada incluye Firestore, Auth y emuladores. No contiene una configuración Hosting que publique por sí misma el frontend y enrute la API. Express monta la API; no sirve automáticamente el build de React. No se localizó una configuración de alojamiento completa versionada para el recorrido objetivo.

**Quién debe entregar qué:**

| Usuario | Entrega |
| --- | --- |
| @codsebas | Destino y procedimiento de hosting, dominio/origen, HTTPS, operación del backend y aceptación integral. |
| @Javifa2324 | Scripts/manifiestos reproducibles, build/arranque y comprobaciones automatizadas. |
| @gioore | Configuración Firebase, índices/reglas, credenciales del backend y diferencias entre emulador/cloud, sin divulgar secretos. |
| @Mar-03 | Validación de cookies, origen, CSRF y permisos en esa topología. |

**Verificación mínima del entorno final:**

1. React y `/api/v1` accesibles con el origen acordado.
2. HTTPS válido para navegador y dispositivo; no deshabilitar verificación TLS para declarar cierre.
3. Backend con Node 24 y credenciales administrativas únicamente en servidor.
4. Cookies con `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` en HTTPS.
5. `COOKIE_SECURE`, origen permitido, URL base y CSRF configurados para ese entorno.
6. Variables de emuladores ausentes cuando se pretende probar cloud.
7. Recarga directa de rutas SPA y recuperación de errores correctas.
8. Reinicio controlado, recuperación de operaciones de usuario y logs sin secretos.
9. Prueba de escritura/lectura persistida y permisos tras un reinicio.
10. Medición de la ruta oficial con dispositivo/simulador y evidencia en web.

**Dos puntos de operación que requieren decisión:**

- El limitador de login es en memoria por IP. Debe comprobarse su comportamiento tras proxy, reinicios o múltiples instancias; no se encontró configuración `trust proxy` en Express. No se afirma un ataque demostrado: se requiere configurar la topología real.
- `/health` acredita que responde el proceso y el estado de inicialización expuesto; no prueba por sí solo lectura/escritura de Firestore. Un 200 no certifica que toda la aplicación esté lista.

### A04 — Historial corregido, pero el ejecutor antiguo de QA exige un resultado incompatible

**Estado: corrección funcional integrada; contradicción del ejecutor confirmada por código; P1.**

El [PR #56](https://github.com/codsebas/PulsoLink/pull/56) ya estaba fusionado al corte. No corresponde seguir presentando la pérdida de ventanas o el límite de 1,000 como defectos sin corregir en `main`.

El código nuevo:

- Carga inicialmente 100 lecturas.
- Consulta recientes de 20 en 20 cada diez segundos.
- Recupera el tramo intermedio por cursor hasta solapar lo cargado.
- Recupera después de volver de una pestaña oculta.
- Mantiene una ventana de hasta **1,000 lecturas únicas y 50 páginas completas**.
- Permite seguir hacia lecturas antiguas liberando las recientes.
- Pausa el polling de ese historial al navegar atrás; los indicadores de última lectura tienen su mecanismo independiente.
- Conserva filas/cursor ante errores y cancela navegación al salir.

**Hallazgo nuevo de esta auditoría:** `tools/qa/hugo-history-acceptance.cjs` sigue calificando HIST-02 con `final === 1120`, donde `final` es el número de filas simultáneas del DOM. Ese requisito contradice una ventana acotada a 1,000 aunque las 1,120 sean accesibles navegando. Además, el informe generado conserva una base fija antigua: `abc4d45 + corrección retry`.

**Qué entregar:** actualizar la prueba para acumular los IDs realmente inspeccionados durante la navegación, comprobar **1,120 distintos**, ausencia de saltos/duplicados, máximo simultáneo de 1,000 y retorno correcto a recientes. Registrar el SHA real. Esto preserva la exigencia de historial completo; no reduce la aceptación a “hay algunas filas”.

**Evidencia previa de Gerson:** 1,120 filas distintas recorridas, máximo 1,000; 47 nuevas recuperadas al volver de ocultación nativa; dos placas; permisos; auditoría; logout. Existe un primer intento CDP fallido en HIST-01 sin causa establecida y una repetición satisfactoria sin cambios de aplicación. Hace falta repetir independientemente y diagnosticar si reaparece.

**Cierre:** QA independiente con runner actualizado, resultados por escenario y aceptación de #29/#31/#33. No duplicar el arreglo ya fusionado ni usar informes antiguos para afirmar que el fallo persiste.

Fuentes: [entrega técnica de Gerson](../planificacion/gerson-cierre-tecnico-2026-10-21.md), [JSON de historial](../evidencias/gerson-historial-2026-10-21.json), [runner de Hugo](../../tools/qa/hugo-history-acceptance.cjs).

### A05 — Administración: selectores incompletos y fase B pendiente

**Estado: limitación confirmada por código; reproducción de interfaz pendiente; P1.**

Las pantallas existen. La fase A de [#38](https://github.com/codsebas/PulsoLink/pull/38) recibió aprobación de Axel después de correcciones, incluyendo búsqueda independiente de asignaciones y tratamiento de fallos parciales. No debe describirse como trabajo inexistente.

Persisten dos límites concretos:

| Ubicación | Límite observado | Impacto |
| --- | --- | --- |
| Opciones de pacientes y dispositivos para asignaciones | Los hooks solicitan `limit: 100`; el selector consume las páginas cargadas y no ofrece cargar la siguiente página de opciones. | Un paciente o placa habilitado situado más allá de esa primera página puede no ser seleccionable desde el formulario. |
| Opciones de asignación activa al crear sesión | `useAssignments({status: 'active'})` usa la paginación por defecto de 50; el formulario no solicita las páginas siguientes de esas opciones. | Una asignación activa posterior a las primeras 50 puede no aparecer al crear una sesión. |

La paginación de una **tabla** no resuelve la paginación de un **selector independiente**.

Fuentes: `apps/web/src/features/patients/api.ts`, `features/devices/api.ts`, `features/assignments/AssignmentsPage.tsx`, `features/sessions/SessionsPage.tsx` y `components/admin/useCursorList.ts`.

**Cierre de código:** búsqueda/paginación explícita de opciones, con carga, error y estado vacío; mantener seleccionada la entidad elegida y respetar habilitación/reservas. No cargar indiscriminadamente toda la base para ocultar el problema.

**Cierre de fase B de @Lis671:** ejecutar sobre la API integrada creación/edición/deshabilitación, conflictos por asignación activa, cierre/reasignación, creación/inicio/finalización de sesión, errores de red y API, bloqueo de doble envío, usuarios/auditoría y viewer. Incluir más de 100 pacientes/placas y más de 50 asignaciones activas. Conservar historia al reasignar y mostrar correctamente si el cierre previo tuvo éxito pero la asignación nueva falló.

### A06 — Visuales y accesibilidad todavía tienen entregables concretos

**Estado: parte confirmada por código; parte requiere navegador; P1.**

La [instrucción de coordinación en #29](https://github.com/codsebas/PulsoLink/issues/29#issuecomment-6333251976) separó el arreglo de historial del bloque visual. #56 no modificó `PatientMonitoringPage.tsx`, `VitalCard.tsx` ni `Header.tsx`.

**Confirmado por inspección:**

- `VitalCard.tsx` conserva etiquetas y guion para valores nulos; no se encontró que convierta nulos en cero. Sin embargo, los estados no válidos comparten presentación gris, frente al requerimiento visual de diferenciarlos.
- Conectividad en `PatientMonitoringPage.tsx` aparece principalmente como texto; el aviso de dato viejo no cumple todavía la presentación diferenciada solicitada.
- `FormDialog.tsx` y `ConfirmDialog.tsx` tienen `role="dialog"` y `aria-modal`, pero carecen de manejo completo de Escape, foco inicial, contención y devolución del foco.
- `Header.tsx` usa animaciones `animate-pulse`/`animate-ping` y transiciones sin una alternativa de movimiento reducido localizada.

**Pendiente de comprobación visual:**

- Encabezado y controles a 360 px: existe una observación manual de recorte, pero no se ejecutó aquí una reproducción nueva ni se estableció su causa.
- 768 y 1440 px; navegación por teclado, foco visible, lectura de etiquetas, contraste y diálogos.
- Claridad de conectado sin lectura, lectura reciente, desconectado y stale.
- Independencia entre calidad óptica y temperatura: retirar el dedo del MAX30102 no debe inventar ceros ni anular automáticamente una temperatura disponible.

El [PR #54](https://github.com/codsebas/PulsoLink/pull/54) entrega **documentación/evidencia parcial de QA**, no una corrección de CSS o componentes. Su aprobación no equivale a aprobación final de todo el dashboard. La prueba a 375×812 de Gerson tampoco sustituye la revisión solicitada a 360 px.

**Cierre:** @orem6 entrega los cambios visuales y evidencia; @Lis671 resuelve los diálogos compartidos con coordinación frontend; @Mar-03/@AxelHerrera11 revisan el resultado y QA #33 registra el recorrido. Los colores deben acompañarse de texto, nunca ser el único significado.

### A07 — La ampliación de QA de Axel todavía está en un PR abierto

**Estado al corte: [PR #57](https://github.com/codsebas/PulsoLink/pull/57) abierto; P1.**

Creado el 21 de octubre a las **23:50:36**, con head `7b818f31860d022ad67e42c149451a1880ad5fbe`. Autor @AxelHerrera11; solicita revisión de @HugoX2024. No había revisión registrada en las fuentes consultadas.

La propuesta informa:

- 65 casos nuevos de auth, roles, consistencia y concurrencia.
- 25 casos existentes de Hugo; total propuesto **90/90 en tres ejecuciones**.
- Entorno macOS, Node 24.14.1, Java 21 y emuladores.
- 32 pruebas del simulador en la rama: 27 existentes y cinco del nuevo ejecutor.
- 208 pruebas API en emuladores.

**Esos 90 casos y 32 pruebas no estaban integrados en `main` al corte.** Las cinco pruebas de dobles de `fetch` comprueban el ejecutor, no sustituyen la matriz contra el backend.

Pendientes declarados: revisión de `qa.ts` por Hugo, sección E de contraste API/web, repetición en Windows/PowerShell y decisión sobre códigos de error. La evidencia de macOS es válida para ese entorno; no se traduce automáticamente en aceptación Windows.

**Cierre:** revisar, resolver observaciones, integrar y publicar resultados identificados por commit; ejecutar los casos de navegador pendientes. No cerrar #32 solo por contar pruebas unitarias.

### A08 — Diferencias verificables entre contrato y aplicación

**Estado: divergencias de contrato; P1 de conformidad.**

| Punto | Contrato / expectativa | Implementación/evidencia | Acción |
| --- | --- | --- | --- |
| Fecha de captura | Patrón del contrato A exige terminación `Z`. | El validador compartido acepta offsets con `datetime({offset: true})` y normaliza. Se reprodujo que `+01:00` es aceptado. | Decidir si se amplía el contrato o se restringe entrada; actualizar casos. |
| Identificador documental | El patrón `^[^/]+$` admite `.` y `..`. | `documentId` rechaza ambos; reproducido. | Documentar las restricciones reales o alinear validador según decisión aprobada. |
| CSRF | Código genérico esperado por matriz/contrato. | Se usa `CSRF_INVALID`. | Alinear catálogo, clientes y pruebas. |
| Recurso inexistente | `NOT_FOUND` genérico. | Códigos específicos `*_NOT_FOUND`. | Acordar granularidad. |
| Cursor inválido | Error genérico de validación. | `INVALID_CURSOR`. | Alinear contrato. |
| Estado de sesión / recurso deshabilitado | Catálogo genérico documentado. | `INVALID_SESSION_STATE` y `RESOURCE_DISABLED`. | Documentar códigos y HTTP correspondiente. |
| Conflicto de asignación | Consistencia con errores acordados. | Se observa `ASSIGNMENT_IN_USE` en conflictos de sesión/asignación de la matriz. | Revisar caso exacto y fijarlo en contrato/pruebas. |

Las diferencias de `error.code` se registran en #57; allí los HTTP comprobados coinciden con lo esperado. No se afirma que todos estos casos impidan usar la aplicación. Sí impiden declarar coincidencia exacta de contrato/DTO/validación en #27.

**Cierre:** PR coordinado que indique la decisión final, cambie las fuentes necesarias y ejercite los casos de borde. No cambiar códigos a ciegas en frontend ni crear una API paralela. La API mantiene `/api/v1`; “contrato 2.0.0” es la versión del documento, no una exigencia de URL `/api/v2`.

### A09 — Runtime y automatización incompletos

**Estado: confirmado; P1.**

- El proyecto exige Node 24 LTS, pero el `engines` raíz permite `>=22`.
- El entorno disponible para las comprobaciones nuevas tenía **Node 22.13.1 y npm 10.9.2**. Por eso sus PASS no certifican Node 24.
- Hay scripts útiles, entre ellos `tools/firebase/verify-gerson.ps1` y `verify-patient-integration.ps1`; el primero exige Node 24/Java 21 y ejecuta comprobaciones con emuladores.
- Falta un punto de entrada global equivalente a `test`/`verify` en los scripts raíz que consolide todos los módulos.
- Los scripts `lint` de API y web son marcadores con `echo`, no análisis estático efectivo.
- No se encontró un workflow versionado de GitHub Actions. La consulta de Actions devolvió **0 ejecuciones** y el commit de corte **0 check runs**, sin estados combinados registrados.

**Qué significa:** tipos/build pasan, pero no existe una señal automática global que impida integrar una regresión de runtime, permisos, contrato o navegador. Un comando llamado lint no prueba que se haya ejecutado un linter.

**Cierre de @Javifa2324:** fijar runtime coherente, documentar instalación/arranque PowerShell, consolidar scripts existentes, implementar lint real y checks proporcionales en CI. Distinguir unitarias, emuladores, navegador y hardware; no cargar secretos o depender de cuentas compartidas para un check básico.

### A10 — Dependencias: resultado suplementario que requiere tratamiento

**Estado: consulta de registro realizada después del corte sobre el lockfile del corte; P1 antes de exposición pública.**

`npm audit --json` informó **20 entradas: 13 moderadas, cinco altas y dos críticas**. Con `--omit=dev`: **10 moderadas, cero altas y cero críticas**.

No son necesariamente 20 vulnerabilidades independientes ni 20 rutas explotables en producción; npm también informa paquetes afectados por dependencias transitivas. La severidad del aviso no sustituye el análisis de exposición.

| Severidad informada | Paquetes |
| --- | --- |
| Crítica | `vitest`, `tinypool` |
| Alta | `tailwindcss`, `braces`, `chokidar`, `fast-glob`, `micromatch` |
| Moderada, presentes en auditoría sin dev | `firebase-admin`, `@google-cloud/firestore`, `@google-cloud/storage`, `gaxios`, `google-gax`, `react-router`, `react-router-dom`, `retry-request`, `teeny-request`, `uuid` |
| Moderada, resto | `@vitest/mocker`, `postcss-nested`, `postcss-selector-parser` |

Los avisos de severidad alta/crítica encontrados pertenecen al conjunto de desarrollo/construcción. Eso requiere revisión, especialmente si se exponen servidores de herramientas, pero no prueba una vulnerabilidad crítica explotable en Express desplegado.

Algunas soluciones sugeridas por npm implican saltos mayores de Firebase Admin, Vitest, Tailwind o React Router. **No ejecutar `npm audit fix --force` como criterio de cierre.** Preparar actualizaciones evaluadas, revisar compatibilidad, ejecutar suites pertinentes y registrar lo que quede pendiente con motivo. Esta auditoría no modificó dependencias.

### A11 — Firebase y autenticación: falta aceptación específica, no construcción desde cero

**Estado: ampliamente implementados; aceptación y alcance cloud pendientes.**

**Firebase existente:**

- Proyecto de pruebas `pulsolink-pruebas-2026-7c8a31`.
- Firestore Standard en `us-central1`, según #55.
- Correo/contraseña habilitado.
- **58 índices** en el archivo versionado; #55 documenta despliegue/listos.
- Reglas deniegan acceso directo de clientes.
- Backend con Admin SDK; #55 documenta roles `datastore.user` y `firebaseauth.admin`.
- Emuladores, repositorios, DTO, fixtures, migración y verificadores existentes.

**Evidencia cloud de #55:** a las 23:07 del 21 de octubre, sobre base `abc4d45`, login admin/viewer, creación de paciente ficticio 201, lectura/listado 200, auditoría persistida, mutación viewer 403 y acceso directo Firestore 403 tanto sin autenticación como con ID token de administrador.

**Límite:** no acredita toda la matriz de asignaciones/sesiones/ingestión/historial en cloud ni cambios posteriores de `main`. Esta auditoría no volvió a entrar en la consola ni a ejecutar esas escrituras en cloud.

**Autenticación existente:**

- Login/logout/me y obtención de CSRF.
- Verificación de identidad Firebase y perfil habilitado.
- Cookie de sesión y control de origen/CSRF.
- Perfil vigente consultado por petición: la reducción de rol no mantiene permisos anteriores por conservar una cookie vieja.
- Migración explícita de `operator` hacia `viewer`, sin promoción a admin.
- Auditoría de login y apertura de expediente; polling no representa una apertura nueva.
- Administración de usuarios restringida a admin.
- Recuperación de operaciones Auth/Firestore con registro durable `userOperations`, control de versión y herramientas de recuperación.

Auth y Firestore no comparten una transacción distribuida. El mecanismo de recuperación existente importa; no basta afirmar “ambos se guardan juntos”. El journal no conserva contraseñas; ciertos reintentos que necesiten recrear identidad requieren volver a suministrarla.

**Aprobaciones que ya existen:** #41 tiene aprobación de @AxelHerrera11 (frontend), @gioore (persistencia) y @codsebas (backend/seguridad). No volver a exigirlas como si nunca hubieran ocurrido. Hace falta relacionar la evidencia vigente con los criterios abiertos y con el entorno final.

**Cierre de #25/#26/#28:**

1. Un integrante distinto del autor reproduce los procedimientos y registra commit/entorno.
2. Coordinar aceptación de DTO y repositorios con Didhyer/Marielos.
3. Probar criterios aún no acreditados en el entorno de aceptación: sesión ausente, origen/CSRF, viewer por HTTP manual, usuarios/auditoría, apertura deduplicada, deshabilitación/degradación y recuperación.
4. Si se afirma integración cloud completa, ejecutar allí los recorridos pertinentes con datos ficticios y alcance explícito.
5. No migrar el proyecto cloud nuevo por rutina: primero inventariar si existe legado. La evidencia indica que ese proyecto nuevo no requería migración de datos anteriores.
6. Conciliar checklists con la evidencia y cerrar solo lo aceptado.

#57 registra que la revocación dentro del mismo segundo de login puede no detectarse inmediatamente en el emulador por precisión temporal; el rol efectivo sí pasa a viewer. No se clasifica como conservación demostrada de privilegios admin ni como comportamiento cloud confirmado.

### A12 — Concurrencia y timeout de cinco segundos

**Estado: [#51](https://github.com/codsebas/PulsoLink/issues/51) abierto y sin asignado; P2 con aceptación explícita pendiente.**

La carrera ingestión/finish superó el presupuesto de cinco segundos en tres ejecuciones de emulador. Se registraron respuestas de aproximadamente 5.25–7.65 segundos e invocaciones repetidas del callback transaccional.

El [PR #52](https://github.com/codsebas/PulsoLink/pull/52) amplió a 30 segundos **solo el escenario de QA JOINT-CONC-08**. El timeout del producto sigue siendo de cinco segundos y no cambió el descarte sin reenvío. La [coordinación aceptó esa ventana para QA](https://github.com/codsebas/PulsoLink/issues/51#issuecomment-6328272673), pero la observación del producto sigue abierta.

**No está demostrado:** deadlock, causa exacta de los reintentos, corrupción de historial o que la latencia cloud sea igual. El orden diferente de acceso a documentos compartidos es una hipótesis de investigación.

**Cierre:** asignar dueño; repetir a cinco segundos con métricas; verificar estado persistido después de timeout; reducir contención si procede o acordar formalmente el comportamiento permitido. Mantener atomicidad, exclusividad, idempotencia e IDs históricos. Un PASS a 30 segundos no demuestra que se cumplan cinco.

### A13 — Descubrimiento de sesión externa: caso a reproducir

**Estado: hipótesis estática; P2.**

En `PatientMonitoringPage.tsx`, el intervalo de consulta de sesiones depende de que ya exista una sesión activa. Si se abre el monitor sin sesión y otro administrador la inicia después, debe verificarse cómo se actualizan metadatos y estados sin depender de recargar manualmente o cambiar el foco.

No se ejecutó ese escenario en esta auditoría y otros mecanismos de actualización podrían cubrir parte del comportamiento. **No se registra como defecto confirmado.**

**Caso de aceptación:** abrir monitor sin sesión, iniciar una desde otra sesión de navegador, enviar una lectura oficial y observar cuánto tarda el primer navegador en reflejar sesión, conectividad y datos. Definir intervalo esperado y corregir solo si el caso lo requiere.

### A14 — Documentación de estado y tamaño del frontend

**Estado: desactualización documental y advertencia de build; P2.**

README/guías conservan referencias a la transición desde `operator`/`participantCode` y al contrato objetivo pendiente. Esas advertencias históricas no describen por sí solas el código integrado tras #41/#49/#56. Añadir estado vigente con fecha/SHA, preservando decisiones y antecedentes.

La matriz antigua de QA en `main` y algunos informes previos todavía muestran bloqueos anteriores. La actualización amplia está en #57, no fusionada al corte. No sumar FAIL históricos resueltos como si todos siguieran vigentes.

El build web actual emitió un chunk principal de **824.18 kB, 232.38 kB gzip**, con advertencia por superar 500 kB. Existe división parcial de páginas, pero hay dependencias/rutas cargadas de forma anticipada que ameritan medición.

**Cierre de rendimiento:** medir carga inicial y navegación en un dispositivo/red representativos; revisar separación de rutas y librerías grandes en la SPA. No se midieron Web Vitals ni se demostró un bloqueo de render en esta auditoría. No introducir Next.js para resolverlo.

## 5. Inventario funcional de la API y sus límites

El montaje revisado está en [app.ts](../../apps/api/src/app.ts). Esta tabla indica presencia de código, no que cada endpoint se haya llamado ahora contra Firebase real.

| Familia | Operaciones principales presentes | Acceso / observación |
| --- | --- | --- |
| Salud | `GET /api/v1/health` | Público; no equivale a prueba completa de persistencia. |
| Auth | CSRF, login, me y logout bajo `/api/v1/auth` | Login obtiene identidad; operaciones correspondientes exigen origen/CSRF. |
| Pacientes | Listado, detalle, creación, edición; latest e historial | Lecturas con sesión; administración admin. |
| Apertura de expediente | `POST /api/v1/patients/:id/access` | Usuario autenticado, incluido viewer; CSRF; excepción prevista, no autorización para editar paciente. |
| Dispositivos | Listado/detalle, creación y edición | Lecturas autenticadas, mutaciones admin. Crear registro no genera automáticamente la credencial física. |
| Asignaciones | Listado/detalle, crear y cerrar | Lecturas permitidas por rol; cambios admin. |
| Sesiones | Listado/detalle, crear desde `assignmentId`, iniciar, finalizar, latest e historial | Cambios admin; relaciones comprobadas en backend. |
| Usuarios | Listado/detalle, creación y edición | Admin; coordinación entre identidad y perfil. |
| Auditoría | Consulta de eventos | Admin; viewer no puede consultar el registro. |
| Dispositivo oficial | Config, heartbeat, measurements | Credencial bearer propia de placa/simulador. |
| Prueba de lectura | `POST /api/v1/dev/reading-test` | Solo desarrollo; no persiste ni sustituye la ruta oficial. |

### Integridad de datos que ya está implementada

- Historial centrado en paciente, con `patientId`, `deviceId`, `assignmentId` y `sessionId` históricos.
- Reservas transaccionales para evitar asignaciones/sesiones incompatibles.
- Clave de ingestión `deviceId + bootId + sequence`.
- Duplicado idéntico con 200 y `duplicate: true`; carga distinta con la misma clave, conflicto 409.
- Consulta de historia a través de sesiones/placas, filtros y desempate por ruta documental.
- Cursor vinculado al alcance de consulta, en vez de una página numérica que mezcle pacientes.
- Resumen acotado de última lectura y separación entre calidad, tiempo y conectividad.
- Reglas de cliente denegadas; autorización de negocio en Express, porque Admin SDK omite esas reglas.
- Migración con respaldo y resolución explícita de asociaciones; no inferir paciente por un código antiguo o placa.

La suite previa de 208 casos con emuladores y las evidencias de HTTP respaldan una parte importante de estas propiedades. Las 152 pruebas nuevas de esta auditoría tienen un alcance distinto y no sustituyen esa suite completa.

## 6. Los 12 issues abiertos, uno por uno

| Issue | Asignados reales al corte | Implementación/evidencia ya entregada | Qué queda para cerrar |
| --- | --- | --- | --- |
| [#25 — Base Firebase](https://github.com/codsebas/PulsoLink/issues/25) | **@gioore** | #39/#43, fixtures/procedimientos; #55 cloud. | Reproducción por otro integrante, aceptación DTO y aprovisionamiento físico repetible. |
| [#26 — Persistencia](https://github.com/codsebas/PulsoLink/issues/26) | **@gioore** | Repositorios, transacciones, historia, reglas, índices y migración; evidencia emulada. | Aceptación @codsebas/@DidhyerOrtiz; distinguir alcance cloud; seguimiento separado de #51. |
| [#27 — API de negocio](https://github.com/codsebas/PulsoLink/issues/27) | **@DidhyerOrtiz y @codsebas** | #49 integra rutas/negocio; antiguos defectos #45/#46 cerrados. | Coincidencia contrato/DTO/errores, aceptación de matriz y apoyo al recorrido físico. |
| [#28 — Auth/usuarios/auditoría](https://github.com/codsebas/PulsoLink/issues/28) | **@Mar-03** | #41 integrado y aprobado; cloud login/roles básico en #55. | Conciliar criterios, revisar casos de revocación/recuperación y validar topología desplegada. |
| [#29 — Dashboard](https://github.com/codsebas/PulsoLink/issues/29) | **@gioore y @orem6** | Dashboard y datos; continuidad/historial #56; QA parcial #54. | @orem6 visuales/móvil; QA independiente; aprobación final @Mar-03/@AxelHerrera11. |
| [#30 — Administración](https://github.com/codsebas/PulsoLink/issues/30) | **@Lis671** | #38 fase A aprobada; pantallas y operaciones presentes. | Fase B API integrada, selectores paginados, diálogos accesibles y evidencias. |
| [#31 — Datos de monitoreo](https://github.com/codsebas/PulsoLink/issues/31) | **@Javifa2324** | #42 integrado; correcciones posteriores de historia #56 en bloque compartido. | Regresión/aceptación de historia, polling y metadatos; no rehacer hooks ya entregados. |
| [#32 — QA API](https://github.com/codsebas/PulsoLink/issues/32) | **@HugoX2024 y @AxelHerrera11** | Runners y evidencias de Hugo; #52; propuesta extensa #57. | Revisión/integración #57, Windows, sección E y contrato de errores. |
| [#33 — QA interfaz](https://github.com/codsebas/PulsoLink/issues/33) | **@HugoX2024, @orem6 y @DidhyerOrtiz** | Ejecuciones anteriores y evidencia parcial; pruebas de autor #56. | Runner actualizado, nueva aceptación independiente, estados, móvil, teclado, permisos y recorrido físico al estar disponible. |
| [#34 — Entorno/despliegue](https://github.com/codsebas/PulsoLink/issues/34) | **@gioore, @Javifa2324 y @codsebas** | Emuladores/verificadores y cloud de Gerson; build actual. | Javier: automatización/manifiestos; Sebastián: hosting/HTTPS; equipo: verificación integral reproducible. |
| [#35 — NodeMCU](https://github.com/codsebas/PulsoLink/issues/35) | **@codsebas** | Sketch integrado y ruta temporal #53. | Protocolo oficial, credencial, TLS, compilación/carga y demostración placa→historia. |
| [#51 — Timeout concurrente](https://github.com/codsebas/PulsoLink/issues/51) | **Nadie** | Reproducción/timing; ventana QA 30 s aceptada. | Asignación explícita, investigación y criterio para cinco segundos del producto. |

**Issues que no deben volver a contarse como bloqueos abiertos:** [#44](https://github.com/codsebas/PulsoLink/issues/44) (simulador), [#45](https://github.com/codsebas/PulsoLink/issues/45) (ingestión HTTP), [#46](https://github.com/codsebas/PulsoLink/issues/46) (rutas de pacientes/asignaciones) y [#48](https://github.com/codsebas/PulsoLink/issues/48) (retry de historial) estaban cerrados. Las tareas antiguas #3–#12/#20 tampoco constituyen por sí mismas el backlog vigente.

## 7. Qué debe entregar cada usuario ahora

| Usuario | Siguiente entrega exigible por su alcance | Evidencia de cierre |
| --- | --- | --- |
| **@codsebas — Sebastián** | Firmware oficial y demostración física; hosting/HTTPS; asignar #51; aceptar integración backend. | Compilación/carga, una muestra real persistida visible, desconexión/reasignación, URL/entorno y procedimiento desplegado. |
| **@gioore — Gerson** | Aprovisionamiento de placa real, acompañar reproducción externa Firebase/persistencia y atender regresiones si se reproducen. | Procedimiento repetible sin secretos, aceptación de otro integrante y evidencia con alcance emulador/cloud explícito. Firebase y #56 ya están entregados; no cargarle CI/hosting/estilos ajenos. |
| **@DidhyerOrtiz — Didhyer** | Alinear contratos/errores; revisión backend con Gerson; QA integrado y apoyo del protocolo físico. | Casos de borde y matriz vigente; aceptación de relaciones/ingestión; cierre de diferencias acordadas. `@DidhyerOrtizG` figura como alias en guías, pero los asignados consultados usan `@DidhyerOrtiz`. |
| **@Mar-03 — Marielos** | Cierre verificable de #28 y supervisión final de frontend; cookies/CSRF del despliegue. | Criterios de auth vinculados a pruebas, revisión visual y recorrido en origen HTTPS. No se le atribuye login inexistente. |
| **@AxelHerrera11 — Axel** | Llevar #57 a revisión/cierre con Hugo y completar Windows/sección E; supervisar administración y dashboard. | PR integrado, resultados en entorno declarado y aprobación específica de UI; fase A ya aprobada. |
| **@HugoX2024 — Hugo** | Revisar #57, corregir aceptación de historial de ventana acotada y repetir QA independiente. | Resultados sobre SHA vigente, 1,120 IDs recorridos sin exceder 1,000 simultáneos, permisos/errores y seguimiento de #51. |
| **@Lis671 — Lis** | Selectores paginados, diálogos accesibles y fase B administrativa. | CRUD y conflictos por navegador con API real, >100 entidades/>50 asignaciones, roles y conservación histórica. |
| **@Javifa2324 — Javier** | Automatización/Node24/CI/dependencias y aceptación del bloque de datos de monitoreo. | Verificador global real, pipeline, manifiestos y regresión de datos; resultado de dependencias tratado con cambios controlados. |
| **@orem6 — Keily** | Cambios visuales pendientes y QA de interfaz completo. | PR con cambios de componentes cuando correspondan, capturas/recorrido 360/768/1440, teclado, estados y aceptación de supervisores. #54 solo documentó QA parcial. |

## 8. Dependencias reales para terminar

### Recorrido mínimo de demostración con simulador

1. Entorno Firebase/API preparado y usuarios admin/viewer.
2. Login admin.
3. Paciente y dispositivo simulado aprovisionados.
4. Asignación activa.
5. Sesión creada/iniciada.
6. Simulador autenticado obtiene configuración y envía por ruta oficial.
7. Firestore conserva lectura con cuatro IDs.
8. Web muestra lectura y calidad; historial consulta el paciente.
9. Cierre y reasignación conservan los tramos anteriores.
10. Viewer consulta, pero sus intentos de administración/auditoría fallan.

Existe código y evidencia previa para gran parte de este recorrido. El pendiente es su aceptación consolidada sobre el estado vigente, no construir cada pieza otra vez.

### Recorrido físico que aún debe acreditarse

`Credencial real → firmware oficial → sesión válida → ingestión oficial → persistencia → monitor/historial → corte de red → recuperación sin cola → cambio de placa`.

La ruta temporal de lectura solo ayuda antes de esa integración y no satisface los pasos de persistencia/monitor.

### Trabajo que puede avanzar ya

- Keily/Lis: visuales, diálogos y selectores.
- Hugo/Axel: runner y #57.
- Didhyer/Marielos: contratos y catálogo de errores.
- Javier: runtime, scripts, CI y dependencias.
- Sebastián/Gerson: credencial física y entorno.
- Revisores: conciliar criterios ya cubiertos sin reabrir los defectos resueltos.

No es válido mantener todas esas actividades detenidas bajo la explicación genérica “falta Firebase”.

### Inventario de configuración que debe quedar resuelto para #34

Se enumeran nombres y propósito; no se copian valores privados ni se inspeccionan archivos `.env` reales.

| Componente | Variables / configuración | Condición de aceptación |
| --- | --- | --- |
| Proceso API | `PORT`, `NODE_ENV` | Puerto/arranque documentados; modo production en despliegue. La ruta temporal de hardware no debe habilitarse allí. |
| Origen y CSRF | `CORS_ORIGIN`, `CSRF_SECRET` | Origen final correcto; secreto propio del entorno. El módulo rechaza el secreto predeterminado de desarrollo en production. |
| Cookie y sesión | `COOKIE_SECURE`, `SESSION_TTL_HOURS` | Secure habilitado en HTTPS; duración documentada. El ejemplo local usa false, por lo que copiarlo sin adaptación no es preparación de producción. |
| Límite de login | `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS` | Revisar proxy/IP y repeticiones de QA; no trasladar un límite elevado de pruebas como política final por accidente. |
| Proyecto/identidad | `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY` | Proyecto correcto y proveedor correo/contraseña. Sin clave web, el servidor puede arrancar pero login responde `503 AUTH_UNAVAILABLE`. |
| Admin SDK | ADC / `GOOGLE_APPLICATION_CREDENTIALS`, o configuración `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY` | Credenciales únicamente en backend y fuera de Git; permisos suficientes y documentados. No suministrarlas a web, simulador o placa. |
| Emuladores | `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | Definirlos para pruebas locales; retirarlos al comprobar cloud y registrar qué entorno recibió realmente los datos. |
| Frontend | `VITE_API_BASE_URL`, `VITE_API_PROXY_TARGET` | Prefijo/origen de API correcto; proxy Vite es configuración de desarrollo. Nada privado dentro de `VITE_*`. |
| Simulador | `API_BASE_URL`, `DEVICE_ID`, `DEVICE_CREDENTIAL_ID`, `DEVICE_SECRET` | Placa simulada y credencial propias, habilitadas; secreto privado. |
| Tiempos/modos del simulador | `SIMULATOR_MODE`, `SIMULATOR_SEED`, `REQUEST_TIMEOUT_MS`, `CONFIG_INTERVAL_MS`, `RECONNECT_INTERVAL_MS`, `DISCONNECT_EVERY_MS`, `DISCONNECT_DURATION_MS` | Registrar escenario y tiempos; no confundir el timeout excepcional de QA con el del producto. |
| QA con escrituras | `QA_ALLOW_WRITES` y parámetros de usuarios/fixtures del ejecutor | Entorno y datos ficticios explícitos; informes sin contraseñas, cookies ni secretos. |
| Firmware | `config.local.h`, plantilla `config.example.h` | Wi-Fi/endpoint/credencial fuera de Git, URL oficial cuando se complete A02 y TLS válido en despliegue. |

La plantilla de API todavía menciona `PROVISION_OPERATOR_*` y un perfil `role: operator`. Debe actualizarse o explicar claramente su compatibilidad/migración hacia viewer. La plantilla no autoriza mantener operator como rol objetivo ni elevarlo a admin. Los scripts de aprovisionamiento existentes deben revisarse antes de repetirlos sobre cuentas compartidas; el procedimiento demo repetible y un script que actualiza identidades no son intercambiables.

## 9. Matriz mínima de aceptación final

“Pendiente consolidar” significa que no se localizó una aceptación integral actual de todo el caso; puede existir evidencia parcial válida. No borra los resultados previos.

| Caso | Evidencia actual | Pendiente para cierre |
| --- | --- | --- |
| Instalación por otro integrante con Node24 | Scripts y ejecución de autor. | Repetición independiente con comandos y versiones. |
| Login/logout admin/viewer | #41 y cloud #55; pruebas locales nuevas de auth. | Recorrido en despliegue final. |
| Sin sesión/CSRF/origen inválido | Pruebas existentes y ampliación #57. | Consolidar matriz integrada y origen desplegado. |
| Viewer intenta administrar por HTTP | Evidencia previa y casos #57; cloud básico 403. | Completar matriz final de endpoints. |
| Degradar/deshabilitar usuario | Implementación y evidencias emuladas. | Registrar conducta efectiva/cookie y entorno final. |
| Recuperación Auth/Firestore tras fallo parcial | Journal y pruebas existentes. | Reproducción del criterio de recuperación por responsable. |
| Crear/editar/deshabilitar pacientes y placas desde UI | Fase A. | Fase B API integrada y conflictos. |
| Seleccionar entidad fuera de primera página | Limitación estática. | Corregir y probar >100/>50. |
| Sesión y asignación exclusiva bajo concurrencia | Suite emulada previa. | Aceptación de matriz y seguimiento de tiempo #51. |
| Duplicado idéntico / conflicto de payload | Implementado y probado previamente. | Mantener resultado en recorrido oficial vigente. |
| Paciente con dos placas sucesivas | Evidencia HTTP/navegador previa. | Repetición independiente y demostración física cuando proceda. |
| Historia mayor de 1,000 | #56 acredita 1,120 recorridas. | Runner Hugo actualizado y repetición independiente. |
| Nuevas lecturas entre ventanas de 20 | Corrección #56 y pruebas nuevas de web. | QA independiente con HTTP y navegador. |
| Pestaña oculta y retorno | #56 acredita 47 recuperadas; intermitencia inicial. | Repetir y diagnosticar si reaparece. |
| Error de red en página posterior y retry | Corrección previa, pruebas actuales de web. | Aceptar sobre recorrido completo. |
| Null, no_contact, unavailable, invalid | Tipos/lógica y evidencia parcial. | Diferenciación visual y prueba por magnitud. |
| Conectado, sin lectura, stale y desconectado | Datos presentes; visual pendiente. | Implementación/aceptación de estilos y etiquetas. |
| Polling al salir/logout | Evidencia #56. | Regresión independiente; no repoblar caché. |
| Móvil y teclado | Evidencia parcial, diálogos incompletos. | 360/768/1440, foco/Escape/retorno y movimiento reducido. |
| Auditoría de apertura sin eventos por polling | Evidencia #56 y módulos presentes. | Consolidar criterio, sin secretos ni copias innecesarias de lecturas. |
| Lectura física oficial | Solo ruta temporal acreditada en código. | Compilar/cargar y demostrar persistencia. |
| Corte Wi-Fi sin cola física | Política objetivo; simulador implementado. | Evidencia física de hueco sin reenvío acumulado. |
| HTTPS/mismo origen | No acreditado. | Configurar y probar aplicación/placa. |
| Reinicio y preparación del servidor | Scripts presentes, health limitado. | Probar operación/readiness y recuperación en destino. |

## 10. Pruebas realizadas durante esta auditoría

**Advertencia temporal:** se ejecutaron después de las 00:03, sobre el código fijado al corte. Son verificaciones retrospectivas del mismo contenido, no evidencia de que alguien ya las hubiera ejecutado a las 00:03.

**Entorno nuevo:** Windows/PowerShell, Node **22.13.1**, npm **10.9.2**. No se instalaron nuevas dependencias ni se cambió el lockfile.

| Comprobación | Resultado | Qué acredita / qué no acredita |
| --- | --- | --- |
| `npm run typecheck` | **PASS**, tres workspaces. | Coherencia de tipos; no ejecución integrada. |
| `npm run build` | **PASS**, API/web/simulador. | Compilación; advertencia de chunk web >500 kB. |
| `npm test --workspace=apps/web -- --maxWorkers=2` | **28 PASS, 2 omitidas**. | Suite web ejecutada; las dos integraciones HTTP requieren sesión/API y no se ejecutaron aquí. |
| `npm test --workspace=tools/device-simulator` | **27/27 PASS** al permitir servidor HTTP local. | Lógica y transportes de pruebas del simulador; no placa física. |
| Suite API acotada, comando abajo | **152/152 PASS**, 11 archivos. | Auth, validación, rutas seleccionadas y metadatos; no suite completa con Firestore/Auth emulados. |
| Validadores temporales/IDs | `offsetAccepted: true`, `dotIdAccepted: false`, `doubleDotIdAccepted: false`. | Divergencias de validación descritas en A08. |
| `npm audit --json` | 20 entradas: 13 moderadas, 5 altas, 2 críticas. | Avisos del registro consultado después del corte, contra dependencias del checkout. |
| `npm audit --omit=dev --json` | 10 moderadas, 0 altas/críticas. | Alcance según clasificación npm; no prueba de explotación. |
| Búsqueda de archivos sensibles rastreados por patrones | Se encontraron plantillas, no credenciales reales con esos nombres/patrones. | Comprobación limitada; no auditoría completa del historial Git ni prueba absoluta de ausencia de secretos. |
| GitHub Actions/checks | 0 runs, 0 check runs en SHA de corte; estados combinados vacíos. | Ausencia de señal CI consultada; no significa que las pruebas locales fallen. |

Comando de la suite API acotada:

```powershell
npm test --workspace=apps/api -- test/auth test/reading-test.test.ts test/device-api.test.ts test/persistence-validation.test.ts test/monitoring-meta.test.ts
```

Las primeras ejecuciones de API/simulador en el sandbox fallaron al abrir conexiones/servidores locales (`EACCES` o error de transporte). Se repitieron con permiso, sin cambios de aplicación, y pasaron. No se registran esos bloqueos del entorno como defectos del producto. La consulta inicial de npm audit también necesitó acceso de red autorizado.

**No realizado en esta auditoría:**

- Suite completa nueva de 208 pruebas con emuladores.
- Nueva sesión de navegador para la aplicación ni medición visual.
- Login/escrituras nuevos en el Firebase cloud compartido.
- Compilación, carga o prueba de sensores físicos.
- Despliegue, configuración de hosting o cambios de índices/reglas.
- Prueba de penetración, carga sostenida o auditoría exhaustiva de secretos.
- Instalación limpia con `npm ci` en otro equipo.
- Pruebas de la rama de #57.

Los resultados previos Node24/emulador/navegador siguen siendo evidencia del equipo, separados de estas comprobaciones nuevas.

## 11. PRs y cronología que cambian el diagnóstico

Horas en Guatemala. “Integrado” indica merge anterior al corte; no aceptación automática de todos los issues relacionados.

| PR | Autor | Estado / hora de integración | Aporte relevante |
| --- | --- | --- | --- |
| [#37](https://github.com/codsebas/PulsoLink/pull/37) | @AxelHerrera11 | Integrado, 19 oct. 21:34 | Matriz/documentación QA inicial. |
| [#38](https://github.com/codsebas/PulsoLink/pull/38) | @Lis671 | Integrado, 19 oct. 22:33 | Administración fase A; aprobado tras correcciones. |
| [#39](https://github.com/codsebas/PulsoLink/pull/39) | @gioore | Integrado, 19 oct. 21:57 | Persistencia y dashboard. |
| [#40](https://github.com/codsebas/PulsoLink/pull/40) | @orem6 | Integrado, 20 oct. 00:59 | Línea base QA. |
| [#41](https://github.com/codsebas/PulsoLink/pull/41) | @Mar-03 | Integrado, 20 oct. 22:17 | Auth, usuarios, permisos y auditoría; revisiones aprobatorias. |
| [#42](https://github.com/codsebas/PulsoLink/pull/42) | @Javifa2324 | Integrado, 20 oct. 22:34 | Datos de monitoreo. |
| [#43](https://github.com/codsebas/PulsoLink/pull/43) | @gioore | Integrado, 20 oct. 22:34 | Integración Firebase/monitoreo. |
| [#49](https://github.com/codsebas/PulsoLink/pull/49) | @DidhyerOrtiz | Integrado, 21 oct. 15:07 | API de negocio objetivo. |
| [#47](https://github.com/codsebas/PulsoLink/pull/47) | @HugoX2024 | Integrado, 21 oct. 15:12 | Simulador oficial. |
| [#50](https://github.com/codsebas/PulsoLink/pull/50) | @HugoX2024 | Integrado, 21 oct. 16:48 | QA integrado y retry; cierre de bloqueos antiguos. |
| [#52](https://github.com/codsebas/PulsoLink/pull/52) | @HugoX2024 | Integrado, 21 oct. 22:42 | Timeout específico del caso de QA concurrente. |
| [#54](https://github.com/codsebas/PulsoLink/pull/54) | @orem6 | Integrado, 21 oct. 22:42 | Evidencia/documentación parcial UI; no arreglos visuales. |
| [#53](https://github.com/codsebas/PulsoLink/pull/53) | @codsebas | Integrado, 21 oct. 22:42 | Firmware integrado y ruta HTTP temporal. |
| [#55](https://github.com/codsebas/PulsoLink/pull/55) | @gioore | Integrado, 21 oct. 23:17 | Entorno cloud de pruebas y evidencia acotada. |
| [#56](https://github.com/codsebas/PulsoLink/pull/56) | @gioore | Integrado, 21 oct. 23:35 | Continuidad, ventana acotada y navegación de historia. |
| [#57](https://github.com/codsebas/PulsoLink/pull/57) | @AxelHerrera11 | **Abierto**, creado 21 oct. 23:50 | Ampliación propuesta de QA; no incluida en `main`. |

## 12. Fuentes, límites y regla de cierre

### Fuentes locales y evidencia primaria

Para revisar los hallazgos sin depender de cambios futuros de `main`, estos enlaces apuntan al **commit exacto del corte**:

| Hallazgo | Punto de inspección |
| --- | --- |
| Credencial de dispositivo | [Formato, consulta y hash](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/api/src/modules/devices/device-credentials.repository.ts#L17) |
| Aprovisionamiento demo solo simulado | [Protección frente a dispositivo real](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/api/src/scripts/demo-provisioning.ts#L32) |
| Firmware dirigido a prueba temporal | [URL de configuración de ejemplo](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/firmware/nodemcu/src/sketch-pulsa-link-v1.2/config.example.h#L10) |
| Ejecutor exige 1,120 filas simultáneas | [Condición HIST-02](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/tools/qa/hugo-history-acceptance.cjs#L41) |
| Informe del ejecutor usa SHA fijo antiguo | [Metadatos de salida](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/tools/qa/hugo-history-acceptance.cjs#L43) |
| Ventana de historial acotada | [Límite de muestras](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/features/patient-monitoring/history.ts#L74) y [retención de páginas](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/features/patient-monitoring/history.ts#L118) |
| Opciones de pacientes y placas | [Pacientes, límite 100](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/features/patients/api.ts#L53) y [placas, límite 100](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/features/devices/api.ts#L54) |
| Opciones de asignaciones al crear sesión | [Consulta de asignaciones activas](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/features/sessions/SessionsPage.tsx#L39) |
| Diálogos | [Formulario](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/components/admin/FormDialog.tsx#L32) y [confirmación](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/components/admin/ConfirmDialog.tsx#L32) |
| Animaciones de encabezado | [Pulso](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/components/layout/Header.tsx#L74) y [ping](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/components/layout/Header.tsx#L106) |
| Validación temporal y paginación por defecto | [Validador y límite 50](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/api/src/shared/persistence.ts#L14) |
| Hipótesis de sesión iniciada externamente | [Condición de refetch](https://github.com/codsebas/PulsoLink/blob/a1c12bc9cab5647140f7c6605b6396f68c356f54/apps/web/src/features/patient-monitoring/PatientMonitoringPage.tsx#L76) |

Documentación y fuentes de contexto:

- [Contrato de arquitectura aprobado](../arquitectura/contrato-aprobado-2026-10-18.md).
- [Plan de ejecución](../planificacion/ejecucion-2026-10-18.md).
- [Contrato A](../../contracts/device.openapi.yaml) y [Contrato B](../../contracts/web.openapi.yaml).
- [Modelo de Firestore](../../firebase/modelo-objetivo.md).
- [Entrega técnica de Gerson](../planificacion/gerson-cierre-tecnico-2026-10-21.md).
- [Evidencia de auth](../evidencias/auth-pl2-2026-10-20.md).
- [API de negocio](../evidencias/pl2-03-api-negocio.md).
- [Seguimiento integrado de Hugo](../evidencias/hugo-seguimiento-2026-10-21.md).
- [QA parcial móvil](../evidencias/pl2-05-qa-movil-orem6.md).
- [Matriz de API que estaba en main](../qa/pl2-08-matriz-api-permisos.md).
- Código y pruebas de `apps/api`, `apps/web`, `tools/device-simulator`, `tools/qa`, `tools/firebase` y `firmware` en el SHA indicado.
- Issues, PRs, comentarios, revisiones y fechas de GitHub enlazados en cada sección.

Se aplicaron las guías locales de React y revisión de interfaz como apoyo a la inspección estática, respetando React SPA/Vite. La referencia externa de accesibilidad fue [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md). No se sustituyeron contratos del proyecto por esas guías.

El corte Git se contrastó consultando el último commit de `main` con `until=2026-10-22T06:03:00Z`. El estado de issues/PRs se reconstruyó con sus metadatos y evidencia disponible al corte. Esto no es una exportación inmutable de todos los eventos históricos de GitHub; cambios futuros del texto de un enlace pueden diferir de lo aquí transcrito.

### Límites del alcance

Este informe cubre implementación, integración, QA, responsabilidades y preparación de entrega según el alcance aprobado. No establece validez clínica. La temperatura es superficial; SpO₂ es una estimación académica; las gráficas son valores puntuales, no ECG ni onda PPG.

No se requieren por esta auditoría nuevas funciones fuera del contrato, migración a SQL/Next.js, Firebase cliente para datos, aplicación móvil, alarmas clínicas ni sustitución de la placa por ESP32/Raspberry Pi.

### Condición para declarar terminado un módulo

Cada responsable debe entregar: **cambio integrado si faltaba código + comando/procedimiento reproducible + entorno y SHA + resultado por criterio + revisión correspondiente**. Un PR fusionado, una captura aislada, un build exitoso o un issue con casillas pendientes no reemplazan esa combinación.

**Estado de cierre del sistema al corte:** módulos centrales implementados y Firebase cloud disponible para pruebas; entrega integral todavía pendiente por firmware oficial, despliegue y aceptación completa de QA/UI. El trabajo restante está asignado por alcance en las tablas anteriores, y #51 requiere que coordinación le asigne dueño.
