# PulsoLink — Registro de Evidencias y Pruebas

Espacio para registrar resultados reproducibles de integración, comprobaciones de calidad y recorridos demostrables.

- **Responsable principal:** `@orem6` (Issue #11 / AV1-09).
- Las evidencias históricas no sustituyen una ejecución local o de CI actual.
- Nunca registrar secretos, cookies, tokens, credenciales de dispositivo, cuentas de servicio ni datos personales.

## Formato mínimo

Cada evidencia debe indicar, como mínimo:

````markdown
# <Identificador> — <Título>

Fecha de ejecución: <YYYY-MM-DD>.
Responsable: <cuenta>.
Entorno: <Windows/PowerShell, versiones relevantes y emulador o nube>.

## Preparación
- Rama o revisión comprobada: `<referencia>`.
- Configuración usada: <solo nombres de variables y origen seguro; nunca valores sensibles>.

## Comandos ejecutados
```powershell
<comandos exactos>
```

## Resultados
| Comprobación | Resultado | Evidencia observable |
| --- | --- | --- |
| <caso> | Aprobado / Falló / Omitido / No ejecutado | <código de salida, respuesta o archivo> |

## Alcance y pendientes
- <qué demuestra la ejecución>
- <qué no se ejecutó o permanece bloqueado>
````

Use **Aprobado** solo si el comando o recorrido se ejecutó y produjo el resultado esperado. Use **Omitido** cuando una condición documentada evita el caso, y **No ejecutado** cuando no se intentó.

## Evidencias disponibles

- [Gerson: aceptación de issues tras actualizar main, 22-10-2026](../planificacion/gerson-aceptacion-issues-2026-10-22.md): respaldo privado en Windows, Standard/IAM/58 índices efectivos, dry-run cloud sin legado pendiente y resultados FAIL explícitos de concurrencia y nueva aceptación cloud.
- [Revisión de Didhyer: contrato, negocio y concurrencia del 22-10-2026](didhyer-contrato-qa-2026-10-22.md): regresión HTTP de offsets/IDs, repetición de API y navegador en emuladores, contraste HTTP a 5/30 s de #51; no acredita cloud ni hardware.
- [Gerson: seguimiento de auditoría del 22-10-2026](gerson-auditoria-2026-10-22.md): aprovisionamiento de placa e identidades, negocio con Firebase real y regresión de descubrimiento de sesiones; separa entregas de aceptación, hardware y despliegue pendientes.
- [Ampliación de Hugo: escenarios conjuntos y recuperación del historial](hugo-pl2-ampliacion-2026-10-20.md): 26 pruebas del emisor/QA, 20 web, ocho casos nuevos de navegador y defecto de reintento corregido con evidencia antes/después.
- [Entrega de Hugo: simulador y QA PL2](hugo-pl2-2026-10-20.md): cliente del contrato A 2.0.0, matriz HTTP ejecutable, regresión con emuladores y navegador; identifica los bloqueos de ingestión/CRUD y hardware.
- [PL2-03: API de negocio e ingestión 2.0.0](pl2-03-api-negocio.md): recorrido HTTP de dos placas con Firestore Emulator, permisos, validación y resultados completos de pruebas; distingue pendientes de nube y emisor.
- [PL2 de Gerson: Auth y monitoreo juntos en emuladores](gerson-integracion-auth-monitoreo.md): combinación solo local de #41/#42, API autenticada, historial de dos placas, semilla repetible y navegador; incluye procedimiento y pendientes, sin declarar esos PR integrados en main.
- [PL2 de Gerson: seguimiento de aceptación](../planificacion/aceptacion-gerson-pl2-2026-10-20.md): relaciona criterios de #25/#26/#29/#34 con evidencias, commits y pendientes; distingue las 127 pruebas de #39 de las 148 de la revisión del PR abierto #41.
- [PL2 de Gerson: ejecución original](gerson-pl2.md): Firebase, persistencia y propuesta de dashboard con resultados de emuladores y límites de las capturas simuladas.
- [AV1-02: recepción autenticada de mediciones por API](dispositivo-av1-02.md): verificación de endpoints del Contrato A (`/device/config`, `/device/heartbeat`, `/device/measurements`), autenticación Bearer, validación Zod e idempotencia.
- [AV1-04: persistencia Firestore](firestore-av1-04.md): ejecución histórica de repositorios con emuladores; no acredita el flujo HTTP o web integrado.
- [AV1-09: arranque e integración inicial](integracion-av1-09.md): comprobaciones locales de scripts y estado de dependencias para la rama de integración.
- [PL2-08: línea base de la API antes del contrato 2.0.0](pl2-08-linea-base.md): suite de la API con emuladores (106/106) sobre el contrato anterior; no acredita el contrato 2.0.0.
- [PL2-04: autenticación, usuarios y auditoría](auth-pl2-2026-10-20.md): suite correctiva de API con emuladores (148/148), recuperación, P-06, compilación y evidencia de navegador; distingue verificaciones y límites.
- [PL2-04: informe de correcciones](informe-auth-pl2-2026-10-20.md): cambios de recuperación, integración de #38, resultados y requisitos de cierre formal.

- [Aceptación integrada de Hugo, 21-10-2026](hugo-integrado-2026-10-21.md): HTTP 25/25, CLI oficial, recuperación de página posterior y defectos de historial reproducidos.

- [Tres pendientes de Hugo: retorno, reasignación y latencia](hugo-seguimiento-2026-10-21.md): cambio de placa visible aprobado; retorno falla con 145/167 filas; timeout5s reproducido y reintentos transaccionales medidos.

- [PL2-08: permisos, consistencia y concurrencia de la API (Axel), 21-10-2026](pl2-08-axel-2026-10-21.md): matriz completa 90/90 en 3 ejecuciones con emuladores (65 casos propios + 25 de Hugo); diferencias de `error.code` con el contrato; sin nube ni hardware.

- [PL2-08 sección E: contraste API ↔ web (Axel), 22-10-2026](pl2-08-axel-ui-2026-10-22.md): 5 casos en Chrome con emuladores, 3/3 ejecuciones; 4 casos cubiertos por #33; sin nube ni hardware.
- [PL2-08: QA de Hugo en Windows y contraste web, 22-10-2026](pl2-08-hugo-windows-2026-10-22.md): matriz API combinada 90/90 en la segunda corrida y sección E en Edge (5 aprobados, UI-03c omitido); registra el bloqueo A-17 del primer intento y la revisión posterior de #57.

- [PL2-14: línea base de la auditoría responsiva, 22-10-2026](pl2-14-ui-responsive/baseline-accecfb/audit.json): `main` `accecfb` a 360/768/1440 en Chrome con emuladores; procedimiento y resumen en [docs/qa/pl2-14-auditoria-responsiva.md](../qa/pl2-14-auditoria-responsiva.md).

- [PL2-14 entrega 1: navegación móvil, 22-10-2026](pl2-14-ui-responsive/entrega1-mobile-navigation/README.md): cabecera de 149 a 65 px en móvil y tablet; 47 mejoras y 0 regresiones frente a la línea base; aceptación de #33 17/17.

- [PL2-14 entrega 2: tablas en móvil, 22-10-2026](pl2-14-ui-responsive/entrega2-responsive-tables/README.md): tarjetas por debajo de `sm` en las 6 tablas administrativas; 11 mejoras y 0 regresiones frente a la entrega 1; aceptación de #33 17/17.

- [PL2-14 entrega 3: detalle del paciente en móvil, 22-10-2026](pl2-14-ui-responsive/entrega3-monitoring-mobile/README.md): lista compacta del historial en móvil y gráficas con marcadores y texto de 12 px; 4 mejoras y 0 regresiones frente a la entrega 2; HIST-01/HIST-02 PASS.

- [PL2-14 entrega 4: arquitectura de páginas administrativas, 22-10-2026](pl2-14-ui-responsive/entrega4-admin-pages/README.md): diálogos y catálogos extraídos; páginas de 1671 a 799 líneas sin cambios visibles; aceptación de #33 17/17.

- [PL2-14: retiro de "Estado" y "Prototipo", 22-10-2026](pl2-14-ui-responsive/retiro-estado-prototipo/README.md): `/` y `/demo` redirigen a `/monitoring`; aceptación de #33 17/17; el bundle principal baja de más de 500 kB a 404 kB.
