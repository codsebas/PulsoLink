# PL2-03 — API de negocio e ingestión 2.0.0

Verificación local del 21 de octubre de 2026 en Windows PowerShell, Node.js 24 y Firebase Firestore Standard + Auth Emulator (`demo-pulsolink`). Relacionado con [#27](https://github.com/codsebas/PulsoLink/issues/27). No se usaron datos reales ni Firebase en nube.

## Recorrido comprobado

`apps/api/test/pl2-business-api.test.ts` monta los routers HTTP del servidor existente con autorización y CSRF, repositorios reales en Firestore Emulator e identidades de prueba en memoria. Verifica admin/viewer, creación de paciente y placas, exclusividad de asignación, sesión, heartbeat, ingestión con `deviceId` contrastado, rechazo de payload incompleto, deduplicación/conflicto, finalización y reasignación. El historial por paciente pagina las muestras de dos placas y conserva sus IDs históricos; las operaciones administrativas escriben auditoría en Firestore. Las pruebas existentes cubren además la autenticación con Firebase Auth Emulator real y las transacciones concurrentes de reservas y persistencia.

## Comandos y resultados

Desde la raíz del repositorio:

```powershell
npm ci
npm run typecheck
npm run build
npm run test --workspace=apps/web
npx --yes @apidevtools/swagger-cli validate contracts/device.openapi.yaml
npx --yes @apidevtools/swagger-cli validate contracts/web.openapi.yaml
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx -y firebase-tools@latest emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api -- --no-file-parallelism'
npx -y firebase-tools@latest emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api -- test/pl2-business-api.test.ts test/patient-monitoring-api.test.ts'
```

- `npm ci`, tipos y build: correctos. Vite notificó un bundle mayor a 500 KiB; no bloqueó la compilación.
- API en emuladores, ejecución **sin paralelismo de archivos**: **149 pruebas aprobadas en 23 archivos, ninguna omitida**.
- Tras reforzar la consulta de recursos deshabilitados, se repitieron las pruebas HTTP de negocio y monitoreo con emuladores: **3/3 aprobadas en 2 archivos**; el chequeo de tipos de API siguió correcto.
- Web: **16 pruebas aprobadas; 2 de integración omitidas** fuera de su entorno; sin fallos.
- En otra ejecución con API, Auth/Firestore emulados y cookie del navegador, se ejecutaron las **2 pruebas web HTTP de integración** sobre `monitor-patient` y sus 240 lecturas: 2/2 aprobadas. Los resultados 16/16 y 2/2 son ejecuciones distintas.
- Ambos OpenAPI 2.0.0: válidos con `swagger-cli`.
- La suite API con el paralelismo predeterminado falló dos veces en **distintos casos** de `test/users-service.test.ts` durante la sincronización Auth/Firestore: 148 aprobadas y 1 fallida. El mismo archivo pasó aislado (12/12) y toda la suite pasó sin paralelismo (149/149). No se alteró el módulo de usuarios; revisar la intermitencia bajo concurrencia antes de considerarla resuelta.

## Recorrido de navegador y emisor local

En una ejecución aparte se iniciaron API/Vite y ambos emuladores, se generaron secretos temporales fuera del repositorio y se corrió `seed-emulators.ts`. Con Microsoft Edge automatizado en modo headless se inició sesión como `demo-admin`, se asignó `demo-device-1` a `demo-patient-b` y se creó/inició la sesión desde la web. Un emisor HTTP de prueba consultó `/device/config`, envió heartbeat y cinco muestras nuevas cada dos segundos; el dashboard mostró lectura reciente. Repetir la última petición devolvió `duplicate:true`. Una sexta muestra envió pulso/SpO₂ `null/no_contact` y mantuvo temperatura válida. Tras recargar se conservaron seis lecturas; al detener el emisor durante más de 45 s la UI indicó desconexión, distinta de no contacto. Se finalizó la sesión desde la web y el historial persistió. En `demo-patient-a` se verificaron 48 lecturas **sembradas** de dos placas. Resultado: recorrido local aprobado con emuladores.

La automatización exploratoria del navegador se ejecutó desde un archivo temporal externo al checkout; no es una prueba de navegador versionada ni sustituye una repetición manual independiente. Se detuvieron los procesos temporales al terminar. Este recorrido no usa el simulador de Hugo ni la placa física.

## Límites de esta evidencia

- No se verificaron IAM, índices ni recorridos con Firestore Standard en nube. El emulador no valida índices compuestos desplegados.
- La prueba de este módulo usa autenticación web en memoria; las pruebas de autenticación existentes usan Auth Emulator real. Falta una demostración conjunta navegador ↔ API ↔ simulador/placa física, con una credencial de dispositivo aprovisionada fuera de Git.
- El contrato A 2.0.0 exige `deviceId` en heartbeat y mediciones y `capturedAt` explícito; los emisores anteriores deben actualizarse junto con esta API. El simulador y el firmware se coordinan con sus responsables; no se conserva una ruta de ingestión alternativa ni una cola de muestras sin red.
- Los registros legados sin correspondencia confirmada siguen fuera del historial del paciente hasta completar la migración documentada por persistencia.
