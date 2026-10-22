# PL2-05 - Revision manual de navegacion movil

Fecha de registro: 2026-10-20.
Responsable: `@orem6`.
Rama evaluada: `feat/orem6-pl2-05-dashboard-ui`.
Commit evaluado: `1385d233bfa0b29ef778ead548ea58c6498ed634`.

## Alcance de la revision

Revision manual informada por `@orem6` en Chrome/Edge DevTools con viewport de 422 x 776 px. No se registraron capturas como archivos locales para esta evidencia, ni se ejecutaron pruebas automatizadas, API, simulador, Firebase o emuladores.

El navegador concreto no esta confirmado entre Chrome y Edge; se conserva como Chrome/Edge DevTools sin atribuir un resultado a uno de ellos.

## Comprobaciones funcionales manuales

| Caso | Resultado observado | Estado |
| --- | --- | --- |
| Navegacion horizontal del menu | El menu horizontal permitio desplazarse y navegar manualmente entre Estado, Pacientes, Placas y Asignaciones a 422 px. | Comprobado manualmente |
| Pacientes | Se observo un mensaje de sesion invalida o expirada. No se infiere codigo HTTP, causa de autenticacion ni comportamiento de API. | Observado manualmente |
| Placas | Se observo un mensaje de sesion invalida o expirada. No se infiere codigo HTTP, causa de autenticacion ni comportamiento de API. | Observado manualmente |
| Asignaciones | Se observo un mensaje de recurso inexistente o no visible. La causa no esta confirmada. | Observado manualmente |

## Observaciones visuales manuales

| Pantalla | Observacion | Limite |
| --- | --- | --- |
| Estado | No se observaron cortes evidentes en el area revisada. | No se midio overflow horizontal ni se inspecciono toda la pagina. |
| Pacientes | No se observaron cortes evidentes en tarjetas y filtros dentro del area revisada. | La pantalla presento el mensaje de sesion; no acredita una carga funcional completa. |
| Placas | No se observaron cortes evidentes en tarjetas y filtros dentro del area revisada. | La pantalla presento el mensaje de sesion; no acredita una carga funcional completa. |
| Asignaciones | No se observaron cortes evidentes en tarjetas y filtros dentro del area revisada. | El mensaje de recurso impide atribuir el resultado a una carga completa de datos. |

## Pruebas manuales de responsividad

Pruebas manuales realizadas por `@orem6` en Microsoft Edge, modo Responsive de DevTools, sobre la ruta `/demo`.

| Viewport | Resultado observado | Alcance |
| --- | --- | --- |
| 360 x 800 px | Satisfactorio. | Inspeccion manual del prototipo `/demo`. |
| 768 x 1024 px | Satisfactorio. | Inspeccion manual del prototipo `/demo`. |
| 1440 x 900 px | Satisfactorio. | Inspeccion manual del prototipo `/demo`. |

No se reportaron problemas adicionales. Estos resultados no incluyen metricas automaticas, mediciones de overflow ni capturas adicionales, y no se atribuyen al dashboard real `/monitoring/:patientId`.

## Pruebas manuales de accesibilidad del menu

Las siguientes comprobaciones fueron realizadas manualmente por `@orem6` dentro del alcance observado de la navegacion movil. No se utilizaron herramientas automatizadas de accesibilidad.

| Comprobacion | Resultado observado | Alcance |
| --- | --- | --- |
| Tab | Satisfactorio: permite avanzar por las opciones observadas del menu. | Comprobacion manual observada. |
| Shift + Tab | Satisfactorio: permite retroceder por las opciones observadas del menu. | Comprobacion manual observada. |
| Foco visible | Satisfactorio: el foco fue visible en las opciones observadas. | Comprobacion manual observada. |
| Enter | Satisfactorio: activa la opcion observada del menu. | Comprobacion manual observada. |
| Desplazamiento al enfocar | Satisfactorio: el menu movil se desplaza al enfocar opciones. | Comprobacion manual observada. |

Estos resultados no constituyen una auditoria WCAG completa.

## Prueba manual de movimiento reducido

Estado: **INCONCLUSO / PENDIENTE DE VERIFICACION**.

- Navegador: Microsoft Edge.
- Ruta revisada: `/demo`.
- Viewport: 422 x 776 px.
- Configuracion: se activo `prefers-reduced-motion: reduce` desde DevTools.
- Comprobacion de configuracion: la consola confirmo que `matchMedia('(prefers-reduced-motion: reduce)').matches === true`.
- Procedimiento: se comparo visualmente la ruta con la configuracion normal y con movimiento reducido activo.
- Observacion: no se identificaron diferencias visibles.

### Limitaciones

- No se aislo una animacion especifica para comprobar su comportamiento.
- No se midieron duracion, transiciones ni cambios de comportamiento con ambas preferencias.
- Esta observacion no permite marcar el caso como APROBADO ni FALLIDO, ni afirmar un incumplimiento WCAG de PulsoLink.

### Recomendacion de seguimiento

- Realizar una prueba futura sobre una animacion identificada en el codigo, verificando su duracion y comportamiento con la preferencia normal y con `prefers-reduced-motion: reduce`.

## Recomendacion

- Considerar una indicacion visual mas evidente de que el menu horizontal admite desplazamiento en movil. Es una recomendacion de usabilidad, no un defecto confirmado.

## Pendientes

- Pruebas de responsividad del dashboard real `/monitoring/:patientId` a 360, 768 y 1440 px.
- Medicion verificable de overflow horizontal, solapamientos y comportamiento de tablas/graficas.
- Verificacion de contraste medido, lector de pantalla/anuncios dinamicos y prueba concluyente de movimiento reducido sobre una animacion identificada.
- Pruebas integradas de autenticacion, sesiones, recursos no visibles y estados de medicion con API, datos de demostracion y entorno autorizado.
- Validacion completa del dashboard centrado en paciente; esta revision no aprueba todas las pantallas ni el comportamiento funcional completo.

## Validación integrada sobre main 2101297

Fecha de registro: 2026-10-21. Este registro no contiene evidencia de ejecución el 2026-10-22; no se atribuye ese día a las pruebas documentadas.
Responsable: `@orem6`.
Origen de las pruebas: clon independiente `PulsoLink-QA-main`.
Versión evaluada: rama `main`, commit `2101297dfa3806c5479987d48b1d2dc9f0cab6a0`.
Repositorio documental: `C:\Users\keyor\Desktop\DESARROLLO WEB\PulsoLink`, rama `feat/orem6-pl2-05-dashboard-ui`, HEAD `263089b59c8b16330e20c410c3473842e1c482cc`.

Este registro consolida pruebas manuales ya finalizadas. No se ejecutaron pruebas nuevas, instalaciones ni correcciones para esta sección. Las pruebas se realizaron sobre el clon QA, no sobre el HEAD documental del repositorio original.

### Entorno observado

- Windows y Microsoft Edge.
- Frontend React/Vite en `localhost:5174`.
- API Express en `localhost:3002`.
- Firestore Emulator en `127.0.0.1:18080`.
- Auth Emulator en `127.0.0.1:19099`.
- Proyecto ficticio `demo-pulsolink`.
- Usuario `viewer` de demostración; cuenta ficticia, sin registrar credenciales.

### Matriz de casos manuales

| Caso | Resultado | Evidencia observada | Limitaciones |
| --- | --- | --- | --- |
| Inicio de sesión y acceso al monitoreo | Aprobado manualmente | Inicio de sesión exitoso con el usuario `viewer`; acceso al listado de monitoreo; tres pacientes ficticios visibles. | Solo se probó el rol `viewer`; no se validaron `admin`, logout, expiración de sesión ni recuperación de credenciales. |
| Tarjetas de signos vitales | Aprobado manualmente | Valores de pulso, SpO₂ estimada y temperatura superficial visibles; estados de medición válidos. | No se validaron todos los estados de medición ni se midieron tiempos de actualización. |
| Representación de `no_contact` | Aprobado manualmente | El estado se presentó mediante guion y texto; no se representó como valor cero. | No se comprobó el anuncio accesible del estado ni su lectura con lector de pantalla. |
| Conexión, sesión y origen simulado | Aprobado manualmente | El estado desconectado se diferenció del estado de sesión; el origen simulado quedó identificado. | No se probaron reconexión, cortes de red ni transición automática entre estados. |
| Historial de P-DEMO-A | Aprobado manualmente | 48 lecturas; dos placas sucesivas (`demo-device-1` y `demo-device-2`) en un mismo historial; medidas de ambas placas comprobadas visualmente; lecturas sin contacto no mostradas como cero. | La comprobación fue visual; no se auditó cada lectura ni se contrastó con consultas directas a Firestore. |
| Estado vacío de P-DEMO-B | Aprobado manualmente | Sin sesión activa; tres tarjetas con guion y texto `Esperando datos`; historial con `No hay lecturas en este intervalo`; sin valores ficticios inventados. | No se probó el estado vacío con error de red ni con sesión recién creada. |
| Historial y paginación de P-MONITOR | Aprobado manualmente | 240 lecturas cargadas; tres páginas de historial; indicador `Alcanzaste el inicio del intervalo consultado`; botón `Cargar más antiguas` deshabilitado al finalizar; datos válidos, sin contacto y simulados observados. | No se midió el rendimiento de la paginación ni se probaron cursores inválidos o consultas concurrentes. |
| Responsividad a 360 × 800 px | Parcial, con hallazgo pendiente | Las tarjetas se apilaron verticalmente y el contenido visible fue legible. El encabezado apareció parcialmente recortado en la captura. | No se declara aprobada la responsividad completa; el recorte no está diagnosticado ni confirmado como defecto. No se probaron otros tamaños en esta ejecución. |

### Validaciones automatizadas previas del clon

Estos resultados fueron reportados durante la preparación del clon y no se reejecutaron para este registro. Se separan de las comprobaciones manuales del dashboard.

| Verificación | Resultado reportado | Alcance |
| --- | --- | --- |
| Instalación de dependencias (`npm ci`) | 541 paquetes instalados. | Preparación del clon; no acredita el comportamiento funcional. |
| Typecheck del frontend | Aprobado. | Verificación estática del frontend; no cubre la API ni el recorrido manual. |
| Build del frontend | Aprobado, con advertencia de bundle JavaScript mayor de 500 KB. | Compilación de producción; la advertencia queda como observación de rendimiento. |
| Reporte de dependencias de npm | 20 vulnerabilidades: 13 moderadas, 5 altas y 2 críticas. | No se aplicaron correcciones ni se evaluó explotabilidad. |
| Estado de Git del clon | Limpio al finalizar las verificaciones reportadas. | No implica que el repositorio original haya sido modificado. |

La suite de API 127/127 se ejecutó previamente sobre la rama original antigua. No se ejecutó sobre `main` `2101297` y no se presenta como evidencia de esta validación integrada.

### Hallazgos y pendientes

- **Hallazgo pendiente:** posible recorte del encabezado a 360 × 800 px. Requiere diagnóstico visual y, si se confirma, corrección y nueva comprobación.
- **Responsividad:** no se declara aprobada. Quedan pendientes otros tamaños de pantalla y la comprobación de overflow, solapamientos y contenido fuera del viewport.
- **Accesibilidad:** quedan pendientes la auditoría completa, el contraste medido, el lector de pantalla, los anuncios dinámicos y una prueba concluyente de movimiento reducido sobre una animación identificada.
- **Estados de medición:** quedan pendientes estados no observados en esta ejecución, como `unavailable`, `invalid` y `stale`, además de sus transiciones y anuncios visuales.
- **Cobertura funcional:** no se probaron roles administrativos, CRUD, auditoría, ni flujos fuera del dashboard de monitoreo.
- **Validación de diseño:** queda pendiente la revisión por Marielos y Axel.
- **Tipo de evidencia:** los resultados de esta sección son observaciones manuales; no sustituyen una suite automatizada de interfaz ni una auditoría de accesibilidad.
- **Capturas:** no se incorporaron imágenes nuevas a este documento. Las únicas capturas versionadas en `docs/evidencias/` son `dashboard-pl2-mobile.png` y `dashboard-pl2-desktop.png`, que pertenecen a la propuesta de diseño y no a esta ejecución integrada. Las capturas locales del clon QA no se copiaron ni se presentan como adjuntos de este repositorio.

### Conclusión de alcance

La validación integrada sobre `main` `2101297` confirma el recorrido manual de autenticación `viewer`, listado de pacientes, tarjetas, estados de contacto y conexión, historial de dos placas, estado vacío y paginación de 240 lecturas. No acredita la aprobación completa del dashboard, la responsividad total, la accesibilidad ni la validación de diseño.
