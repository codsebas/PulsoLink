# Evidencia de Gerson — Firebase, persistencia y propuesta de dashboard

Fecha: 19 de octubre de 2026 (Guatemala). Issues relacionados: #25, #26, #29 y la parte de Firebase/persistencia de #34. La entrega se preparó desde `df5e858`; se conservan la implementación anterior y las decisiones del contrato 2.0.0.

## Ejecución

Windows/PowerShell, Node 24.15.0, Java 21.0.7, Firebase CLI 15.34.0, Firestore Emulator 1.22.0 **Standard** y Auth Emulator. Solo proyecto local desechable `demo-pulsolink`.

```powershell
./tools/firebase/verify-gerson.ps1
```

El procedimiento ejecuta tipos y build de los workspaces, emuladores y `npm run test --workspace=apps/api -- --maxWorkers=2`, y `git diff --check`. Se limita la concurrencia de Vitest a dos workers para evitar cierres de IPC observados con demasiados procesos simultáneos en Windows. La suite conserva las pruebas del avance anterior.

**Resultado ejecutado: 127 pruebas aprobadas en 19 archivos; tipos, compilación global y comprobación de espacios correctos.** No confundir la suite sin hosts (que omite integración) con esta ejecución completa de emuladores.

Casos añadidos:

- Semilla admin/viewer repetible, sin rotación de contraseña/secreto ni reactivación de perfiles; dataset transaccional de dos placas y 48 lecturas; rechazo de entorno no desechable.
- Asignaciones concurrentes por paciente y placa, reserva de sesión creada, cierre contra creación simultánea, bloqueo de deshabilitación en uso y conservación de ambos tramos históricos.
- Deduplicación transaccional, conflicto de contenido, comprobación de identidad, coherencia de finish/ingest y rechazo de duplicados desde placa deshabilitada.
- Historial por grupo de colecciones con filtros y desempate por ruta aun cuando se repite un ID entre sesiones.
- Migración dry-run, rechazo de correspondencias fabricadas y de fallos de respaldo, repetición sin alterar hashes, degradación de roles con recuperación de revocación Auth interrumpida. CLI en procesos separados: dry-run, rechazo de respaldo dentro del checkout y aplicación/repetición con respaldo externo.
- **HTTP + Auth y Firestore reales de emuladores:** login viewer mediante REST/cookie, CSRF, una apertura auditada, lectura persistida, consultas periódicas sin nuevo evento, bloqueo de mutaciones y de perfil deshabilitado. Tras cambiar placa, latest no usa la lectura de la anterior como dato actual.
- Series de gráfica: calidad nula sin cero, huecos temporales/cambio de placa, identidad compuesta, filtros de Guatemala y presentación decimal estable.

La semilla CLI `seed-emulators.ts` se ejecutó dos veces: primero creó perfiles/dispositivo/dataset; la segunda devolvió cero creaciones y `datasetCreated:false`.

## Revisión visual

Playwright CLI con Chromium: escritorio 1280×900 y móvil 375×812. Se revisaron capturas nativas y se corrigió la presentación de decimales y la posición de captura. El fixture devolvió:

```json
{"fixture":true,"desktop":"1280x900","mobile":"375x812","noHorizontalOverflow":true,"pagination":true,"accessOnce":true,"pollingStoppedOnExit":true,"permissionError":true}
```

Las [capturas y propuesta](../diseno/dashboard-pacientes-pl2.md) usan respuestas HTTP simuladas para el diseño. No son una demostración de Firestore ni de nube. La prueba HTTP con emuladores descrita arriba es independiente. No se exportaron cookies de una sesión de navegador para esta evidencia.

## Pendientes de integración y revisión

- Validación del diseño con Keily/Marielos/Axel y evidencia QA de #33; no cerrar #29 por estas capturas.
- Corte coordinado de contratos de dispositivo y creación de sesiones HTTP por assignmentId con Didhyer/Sebastián; CRUD administrativos y auditoría de login bajo sus responsables. La API antigua continúa en la ventana de legado documentada.
- Conectar el formulario de acceso web de Marielos: el componente existente sigue siendo punto de integración; la API de login sí se ejercitó por HTTP.
- Proyecto real de prueba, IAM, verificación de edición Standard y despliegue/consulta de índices. El listado de bases de Firebase CLI sigue sin sesión autenticada. No se crearon recursos ni se aplicaron migraciones en nube.
- Verificación física NodeMCU, simulador actualizado, despliegue con mismo origen/HTTPS y responsabilidades compartidas de #34.
- El build conserva una advertencia de tamaño del bundle principal preexistente (~710 kB); la nueva pantalla y gráficas se importan de forma diferida. Lint del repositorio continúa siendo un mensaje, no análisis estático real.

No se publicaron secretos ni datos reales de pacientes. Los issues permanecen abiertos hasta que se comprueben los criterios compartidos completos.
