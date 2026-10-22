# Aceptación de Firebase: cuentas repetibles y negocio en cloud

Entrega de Gerson para A11 de la auditoría del 22 de octubre, #25/#26/#28/#34.
No sustituye la revisión independiente ni acredita firmware o hosting HTTPS.

## Cuentas: conservar lo existente

`provision-auth-users.ts` crea las identidades que no existen. Antes, repetirlo
cambiaba su contraseña/nombre y las reactivaba; ahora conserva cuentas existentes
y falla si encuentra una deshabilitada. No actualiza roles ni custom claims.

Se exige `PROVISION_TARGET_PROJECT` igual a `FIREBASE_PROJECT_ID`, ambos hosts de
emuladores o ninguno, emails distintos y configuración válida para los dos roles.
Usar `PROVISION_ADMIN_*` y `PROVISION_VIEWER_*`. `PROVISION_OPERATOR_*` sigue como
alias de viewer; valores contradictorios provocan error. Los perfiles sugeridos
siempre usan `admin`/`viewer`, y `provision-demo.ts` conserva los perfiles existentes.

Ejecutar desde `apps/api` con las variables privadas documentadas en `.env.example`:

```powershell
$env:PROVISION_TARGET_PROJECT = 'ID_EXPLICITO_DEL_PROYECTO'
npx tsx src/scripts/provision-auth-users.ts
```

Sigue siendo un aprovisionamiento de dos pasos (Auth y luego perfiles/demo), no
una transacción distribuida. Si falla entre altas, repetir conserva las completadas.
Rehabilitar usuarios, cambiar roles o resetear contraseñas debe hacerse mediante
el flujo administrativo correspondiente, no repitiendo este script.

## Verificación cloud reproducible

`tools/firebase/verify-cloud-business.cjs` ejecuta el protocolo conjunto oficial
del simulador (`runJointCases`) contra Express y Firebase reales. Requiere Node 24,
build actual, Admin SDK autorizado, proyecto de **pruebas** explícito y cuentas
admin/viewer existentes con sus perfiles. No usa ni modifica datos de pacientes
reales y no requiere cuenta Admin en un cliente.

La API de comprobación se inicia en un puerto efímero **solo en 127.0.0.1**. Usa
`createApp()` y no ejecuta la recuperación de journals de usuarios ajenos al
arranque. La prueba de reinicio corresponde a persistencia/cookies de esa API;
la recuperación de fallos Auth/Firestore se acredita por separado en emuladores.

Preparar un JSON privado fuera de Git/OneDrive, con esta estructura y credenciales
de prueba aprobadas (los valores siguientes son marcadores):

```json
[
  { "role": "admin", "email": "CORREO_ADMIN", "password": "PASSWORD_PRIVADO" },
  { "role": "viewer", "email": "CORREO_VIEWER", "password": "PASSWORD_PRIVADO" }
]
```

Desde la raíz, con `apps/api/.env` configurado y sin hosts de emuladores:

```powershell
npm run build
$env:CLOUD_VERIFY_PROJECT_ID = 'ID_DEL_PROYECTO_DE_PRUEBAS'
$env:CLOUD_VERIFY_ALLOW_WRITES = 'true'
$env:CLOUD_VERIFY_ACCOUNTS_FILE = 'C:\carpeta-privada\cuentas-pruebas.json'
node tools/firebase/verify-cloud-business.cjs
Remove-Item Env:CLOUD_VERIFY_ALLOW_WRITES
```

El proyecto debe coincidir con `FIREBASE_PROJECT_ID`; el script rechaza modo
production, proyecto demo, emuladores y falta de consentimiento de escritura.
No cambia claves IAM, contraseñas, roles ni archivos de configuración compartidos.
Eleva el límite de login únicamente en su proceso local efímero de prueba.

### Qué se comprueba

- Login real admin/viewer, cookies y autorización; 401 sin sesión, 403 en permisos,
  ausencia de CSRF y origen incorrecto.
- Dos dispositivos nuevos `simulated` por la API, cada uno con credencial propia.
  El fixture Admin solo agrega el hash de sus credenciales y conserva perfiles.
- `JOINT-CON-17`: asignación, sesión, ingestión oficial, cierre/reasignación,
  historia original de dos placas, aislamiento de otro paciente, duplicado y
  conflicto tras el cierre, con paginación real de una lectura.
- `JOINT-CONC-08`: tres rondas de finish concurrente con cinco muestras; ACK y
  rechazos contrastados con el historial. Conserva la ventana excepcional de QA
  de 30 segundos. No demuestra resolver los cinco segundos del producto (#51).
- Historial visible para viewer, apertura deduplicada por viewId y acceso directo
  Firestore rechazado.
- Reinicio de la API local: cookie todavía válida y hash del historial idéntico.

### Alcance de escritura y limpieza

El ejecutor registra los IDs que él mismo crea. Al terminar finaliza/cierra sus
sesiones/asignaciones y deshabilita sus pacientes, dispositivos y credenciales.
No elimina lecturas, auditoría ni registros previos de otros integrantes. Ante
fallo, el informe identifica la etapa y los IDs para revisar la limpieza; una
limpieza fallida produce salida 1 y no se declara PASS.

El informe por defecto está en `.cache/cloud-business-results.json`, sin cookies,
contraseñas, tokens ni secretos de placa. Se puede elegir `CLOUD_VERIFY_REPORT`.
Incluye proyecto, commit base, si había cambios locales, resultados y limpieza;
no tratar el SHA base de una ejecución con cambios como un checkout limpio.

## Evidencias y aceptaciones

Las pruebas de cuentas se ejecutan en Auth/Firestore Standard emulados, con
contraseñas aleatorias: conservan el login anterior después de repetir con otra
contraseña, no reactivan usuarios, validan aliases y rechazan proyectos/roles
incompatibles antes de las altas. La suite API de esta rama aprobó **212 pruebas
en 25 archivos** (cuatro nuevas), sin omisiones; tipos de API y build aprobados.

La evidencia cloud se registra separada en
`docs/evidencias/gerson-negocio-cloud-2026-10-22.json`. No es la demostración
física ni una validación completa del despliegue. Coordinación conserva la
aceptación de #25/#26/#28, el destino HTTPS y la ventana de migración si existe
legado; el proyecto nuevo de pruebas no se migra por rutina.

Ejecutado el 22 de octubre a las 00:51 de Guatemala: **95 comprobaciones PASS**,
incluidos `JOINT-CON-17` y `JOINT-CONC-08`, cookie/historia después del reinicio y
limpieza satisfactoria de los recursos propios. El informe conserva SHA base y
`workingTreeDirty:true`: se ejecutó sobre `a1c12bc` con este verificador aún en
la rama de trabajo. Una ejecución anterior también pasó (89 comprobaciones);
el número varía según las muestras que ganan la carrera concurrente.
