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

## Recomendacion

- Considerar una indicacion visual mas evidente de que el menu horizontal admite desplazamiento en movil. Es una recomendacion de usabilidad, no un defecto confirmado.

## Pendientes

- Pruebas de responsividad a 360, 768 y 1440 px.
- Medicion verificable de overflow horizontal, solapamientos y comportamiento de tablas/graficas.
- Recorrido por teclado con Tab y Shift+Tab, orden y visibilidad del foco.
- Verificacion de contraste, preferencia de movimiento reducido y lector de pantalla/anuncios dinamicos.
- Pruebas integradas de autenticacion, sesiones, recursos no visibles y estados de medicion con API, datos de demostracion y entorno autorizado.
- Validacion completa del dashboard centrado en paciente; esta revision no aprueba todas las pantallas ni el comportamiento funcional completo.
