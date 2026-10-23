# Gerson — aceptación de #25, #26 y #34 tras actualizar main

Fecha: 22 de octubre de 2026, Guatemala. Base ejecutada: `3db477a` más los cambios de esta rama. Los timestamps JSON usan UTC (23 de octubre UTC corresponde al 22 por la noche en Guatemala). No se cierran issues por inferencia ni se declara que todo el proyecto terminó.

## Entregable adicional: respaldo de migración privado

El CLI de migración ya respaldaba antes de aplicar, pero `mode: 0600` no restringe las ACL de Windows. Ahora crea el archivo vacío exclusivo, retira herencia y concede usuario actual/SYSTEM antes de escribir; si no puede protegerlo, lo elimina y aborta sin migrar. Sincroniza el contenido a disco antes de devolver el control a `migrateLegacy`. Rechaza directorios dentro de Git y OneDrive, incluyendo su ruta canónica. Para aplicar en nube también exige `MIGRATION_TARGET_PROJECT` igual al proyecto configurado, además del `--allow-cloud` existente.

La prueba CLI verifica rechazo de OneDrive sin mutaciones ni respaldo, aplicación con ACL no heredadas en Windows, repetición sin alterar claves de ingestión y rechazo cuando no existe `icacls`. No se cambiaron relaciones, transacciones ni el presupuesto de latencia del producto. Se corrigió además la guía de semilla que aún afirmaba que el script de identidades sobrescribía cuentas: dejó de hacerlo en #63.

## #25 — base Firebase e identidades

| Criterio | Estado y evidencia |
| --- | --- |
| Otro integrante levanta emuladores y reproduce | [Didhyer aceptó el alcance emulado](https://github.com/codsebas/PulsoLink/issues/25#issuecomment-6350755089), 253/253 sobre `394b3a3`. Esta aceptación es de él; no se presenta como ejecución propia. |
| Aprovisionamiento repetible y cuentas privadas | #62/#63 integrados; pruebas de Auth y persistencia repetidas en esta rama. No se publican contraseñas ni se emite credencial para una placa desconocida. |
| Admin SDK solo en servidor y reglas deny-client | Arquitectura conservada. Comprobaciones reales previas en #55/#63; suite de reglas de emulador ejecutada de nuevo. |
| Firmas/DTO para integración | [Contrato de persistencia](../arquitectura/persistencia-pl2-integracion.md), adoptado por Didhyer en #26 y utilizado por Auth/API integrados. Revisión final de Marielos/Sebastián solicitada en el PR. |

La prueba real de #63 sigue siendo evidencia histórica válida, no un PASS nuevo. El intento actual del verificador cloud no aprobó login (HTTP 503); ver límites más abajo. No se afirma aceptación cloud actual completa.

## #26 — persistencia e historial

Las pruebas existentes cubren exclusividad de asignaciones/sesiones, duplicados/conflictos, cuatro IDs históricos, dos placas, filtros y desempate por ruta, auditoría y migración sin eliminar claves. [Didhyer adoptó las firmas y aceptó persistencia en emuladores](https://github.com/codsebas/PulsoLink/issues/26#issuecomment-6350755474); su navegador recorrió 1120 lecturas distintas con ventana de 1000. No falta volver a construir estos repositorios.

La ejecución propia sobre esta base obtuvo **252/253 pruebas API aprobadas**: pasa migración con el arreglo de respaldo, pero falla la carrera ingestión/finish con presupuesto de 5000 ms. Primer intento: 7298 ms en la carrera y una regresión nueva de entorno Windows fallida; se corrigió la construcción del entorno de esa prueba para evitar duplicar `ONEDRIVE`/`OneDrive`. Segundo intento: toda migración aprobada y la carrera agotó su timeout de prueba de 10 s. No se ocultan esas ejecuciones ni se amplía el timeout para aprobar.

Ese fallo coincide con el seguimiento de Didhyer y la corrección todavía propuesta por Sebastián en [PR #76](https://github.com/codsebas/PulsoLink/pull/76), cuya descripción informa serialización por sesión. No se copia una implementación pendiente ni se atribuye a esta rama su resolución. #51 figura cerrado; el resultado de ejecución se informa igualmente y no se cambia su estado sin acordar el criterio.

## #34 — configuración efectiva y migración

Se ejecutaron lecturas de las APIs administrativas de Google usando la sesión autorizada de Firebase CLI, sin registrar ni versionar el token. No se cambiaron IAM, reglas, índices, plan ni facturación.

- [Estado efectivo](../evidencias/gerson-firebase-efectivo-2026-10-22.json): `(default)` es **STANDARD**, `FIRESTORE_NATIVE`, `us-central1`. Los **58 índices versionados coinciden con 58 desplegados en READY**, sin faltantes.
- La identidad `pulsolink-api-local` tiene vínculos directos no condicionales `roles/datastore.user` y `roles/firebaseauth.admin`. Se verificaron los vínculos del proyecto; no constituye un análisis completo de permisos heredados de organización ni confirma qué identidad ejecuta Render.
- [Inventario de migración en dry-run](../evidencias/gerson-inventario-migracion-2026-10-22.json): 313 registros, cero perfiles `operator`, cero sesiones sin resolver. Se usó `migrateLegacy(..., {apply:false})`, manifest sin correspondencias y callback de respaldo que rechaza su ejecución. **No se creó un respaldo cloud ni se aplicó migración**. No inventar correspondencias ni ejecutar `--apply` solo para completar un checklist.
- Render ya fue entregado por Sebastián en #68/#71; no sigue pendiente de ser creado como indicaban documentos históricos. [Lectura HTTPS de esta ejecución](../evidencias/gerson-render-lectura-2026-10-22.json): health 200 en modo cloud y `/login` 200 HTML. No es un login autenticado ni prueba de escritura. Procedimiento: [Render](../setup/render.md) y [simulador HTTPS](../setup/prueba-simulador-render.md). Sus comprobaciones previas de escritura HTTPS no son una nueva ejecución de esta rama.
- Node/manifiestos/automatización compartida siguen con Javier (#60); esta entrega no reemplaza su PR.

Para reproducir la inspección de metadatos, con una identidad autorizada, consultar `GET https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)` y `GET .../collectionGroups/-/indexes?pageSize=0`; comparar grupo, scope, campos, orden y estado con `firebase/firestore.indexes.json`. La lista comodín solo acepta pageSize 0; dos intentos iniciales con 100 respondieron 400 y no alteraron configuración. IAM se consultó con `POST https://cloudresourcemanager.googleapis.com/v1/projects/{projectId}:getIamPolicy` (operación de lectura), filtrando en memoria la identidad del backend. No copiar las respuestas completas de IAM ni tokens a Git.

## Comandos y límites de la ejecución propia

```powershell
git pull --ff-only origin main
./tools/firebase/verify-gerson.ps1
./tools/firebase/verify-gerson.ps1 -SkipBuild
```

Windows, Node 24.15.0, Java 21, Firebase CLI 15.34.0. Tipos y build de los tres workspaces aprobados; permanece la advertencia de bundle web mayor de 500 kB. La suite completa final se registra como **FAIL (252 PASS, 1 FAIL)** por la carrera descrita, con 28 archivos y sin suites omitidas.

Después de agregar el caso de fallo de ACL se ejecutó la suite focal en emuladores desechables nuevos: **4/4 PASS** (12,45 s), incluyendo el rechazo sin `icacls`, el archivo protegido y su repetición. Comando desde la raíz, con `FIREBASE_PROJECT_ID=demo-pulsolink`:

```powershell
npx -y firebase-tools@15.34.0 emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api -- test/legacy-migration.test.ts --maxWorkers=1'
```

No se repitió la suite web: el producto web no cambia en esta rama. No se declara PASS global por el resultado focal.

Se intentó repetir `verify-cloud-business.cjs` contra el proyecto de pruebas. [Último informe](../evidencias/gerson-cloud-repeticion-2026-10-22.json): login admin HTTP 503, cero fixtures creados y limpieza PASS. Un primer intento no llegó a registrar checks durante el arranque; otros dos llegaron al mismo login 503. En diagnósticos separados, Auth REST con contraseña y lectura Admin de Firestore sí pasaron. El adaptador reportó `AUTH_UNAVAILABLE` al crear cookie y Admin SDK `app/invalid-credential`; una adquisición de token dio `EACCES` y otra pasó. No se estableció la causa de esa intermitencia local ni se cambió la ACL de la cuenta de servicio para eludirla. No se presenta la nueva aceptación cloud como aprobada ni se sustituye este fallo por las 95 comprobaciones anteriores de #63.

No se aplicó migración en la base compartida, no se desplegó esta rama ni se realizó hardware. Queda que los supervisores concilien la aceptación de #25/#26, Sebastián atienda la carrera y el diagnóstico de cookie/credencial, y el equipo cierre #34 con la verificación del entorno final. La placa física continúa en #35.
