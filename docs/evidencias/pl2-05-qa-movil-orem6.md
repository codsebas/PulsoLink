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

- Pruebas de responsividad a 360, 768 y 1440 px.
- Medicion verificable de overflow horizontal, solapamientos y comportamiento de tablas/graficas.
- Verificacion de contraste medido, lector de pantalla/anuncios dinamicos y prueba concluyente de movimiento reducido sobre una animacion identificada.
- Pruebas integradas de autenticacion, sesiones, recursos no visibles y estados de medicion con API, datos de demostracion y entorno autorizado.
- Validacion completa del dashboard centrado en paciente; esta revision no aprueba todas las pantallas ni el comportamiento funcional completo.
