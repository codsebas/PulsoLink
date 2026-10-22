# Aprovisionamiento seguro de una NodeMCU

Entrega de Gerson para A01 de la auditoría del 22 de octubre y #25/#35.
Esto prepara la identidad del dispositivo en el backend. No compila firmware,
no configura Wi-Fi, no carga la placa ni demuestra una medición física.

## Identificadores y credenciales

- `deviceId`: ID del documento `devices`. Si la placa se creó desde la web,
  consultar su ID mediante la API administrativa y reutilizarlo. Para una placa
  nueva, coordinación puede elegir un ID estable, por ejemplo `nodemcu-01`.
- `code`: etiqueta visible que identifica físicamente la placa. Debe coincidir
  exactamente si el documento ya existe.
- `hardwareId`: MAC u otra identificación física opcional; no se inventa.
  Sebastián puede confirmarla desde la placa. No es una contraseña.
- `credentialId.secret`: credencial exclusiva de esa placa. El backend guarda
  únicamente el hash del secreto de 32 bytes; no es una cuenta Firebase Admin.

## Precondiciones

Node 24, dependencias instaladas, proyecto Firebase explícito y credenciales
Admin únicamente en el servidor. El actor debe existir en Firebase Auth, estar
habilitado y tener perfil Firestore `admin` habilitado. El comando comprueba
su perfil dentro de la transacción. No se admite `viewer` ni `operator`.

Para emuladores, definir **ambos** hosts y un proyecto `demo-` desechable. Para
cloud, retirar ambos hosts y usar ADC/`GOOGLE_APPLICATION_CREDENTIALS` del
proyecto aprobado. No copiar esa cuenta de servicio a la placa.

Desde `apps/api`, con `.env` local configurado, PowerShell:

```powershell
$env:PROVISION_TARGET_PROJECT = 'ID_EXPLICITO_DEL_PROYECTO'
# Debe coincidir con FIREBASE_PROJECT_ID de .env o del entorno.
$env:PROVISION_ACTOR_UID = 'UID_ADMIN_VALIDADO'
$env:PHYSICAL_DEVICE_ID = 'ID_DE_LA_PLACA'
$env:PHYSICAL_DEVICE_CODE = 'ETIQUETA_DE_LA_PLACA'
# Opcional, solo si se conoce y coincide con el registro existente:
# $env:PHYSICAL_HARDWARE_ID = 'IDENTIFICADOR_CONFIRMADO'
npx tsx src/scripts/provision-physical-device.ts
```

La primera ejecución es **dry-run**: consulta y valida, sin crear documentos en
Firestore. Genera un archivo privado local para conservar el mismo secreto al
repetir el comando. Su ruta se muestra, pero el secreto no se imprime.

Por defecto se guarda en
`%LOCALAPPDATA%/PulsoLink/<projectId>/physical-<deviceId>.json` (en otros sistemas,
`~/.config/PulsoLink/…`). Puede indicarse `PHYSICAL_DEVICE_CONFIG_FILE` con una
ruta absoluta fuera del repositorio y de OneDrive. No se sobrescribe un archivo
existente. Windows restringe sus permisos al usuario actual y SYSTEM; en POSIX
se crea con modo 0600.

Después de revisar proyecto, actor y placa, aplicar:

```powershell
$env:PROVISION_APPLY = 'true'
npx tsx src/scripts/provision-physical-device.ts
Remove-Item Env:PROVISION_APPLY
```

El resultado solo informa proyecto, IDs, qué se creó y ruta privada. En dry-run,
los indicadores `deviceCreated`/`credentialCreated` describen lo que se crearía;
`applied:false` confirma que no se escribió en Firestore.

## Repetición y conflictos

Dispositivo real, credencial y evento de auditoría se crean en una transacción.
Repetir con el mismo archivo no cambia secretos, fechas, reservas ni sesiones y
no duplica el evento. Al agregar una credencial a una placa real ya creada, se
registra `device.update` usando el catálogo de auditoría vigente.

Se rechazan origen simulado, placa deshabilitada, etiqueta/hardware incompatibles,
credencial de otra placa, secreto distinto, credencial revocada/deshabilitada,
otra credencial previamente vinculada y credenciales huérfanas. No se agrega
una credencial nueva a una placa en uso. El procedimiento no rota ni rehabilita
credenciales; esos cambios requieren un procedimiento explícito de coordinación.

Si una operación falla después de generar el archivo privado, conservarlo y
repetir: nunca regenerarlo o borrar registros para eludir un conflicto.

## Entrega a firmware y comprobación

Coordinación entrega únicamente `deviceId`, `credentialId` y `secret` por un
canal privado acordado, sin Git, PR, capturas o logs. Cargar esos valores en la
configuración local de la placa excluida de Git. No enviar `serviceAccountKey.json`.

La placa debe usar las rutas oficiales del Contrato A:

1. `GET /api/v1/device/config` con `Authorization: Bearer <credentialId>.<secret>`.
   Antes de asignar/iniciar sesión, `activeSessionId` es `null`: no enviar muestras.
2. Heartbeat con `deviceId`, `bootId`, `uptimeMs`, `firmwareVersion`.
3. Crear paciente ficticio, asignación y sesión mediante la administración; iniciar
   sesión y volver a consultar config.
4. Enviar `MeasurementInput` a `/device/measurements`; backend fija paciente,
   placa, asignación y sesión. Un duplicado idéntico no crea otra lectura.
5. Probar rechazo de credencial incorrecta/deshabilitada y de otro `deviceId`.
6. Finalizar/cerrar y confirmar que las muestras nuevas dejan de atribuirse.

El firmware debe implementar también descarte sin cola y TLS válido en el
despliegue. La ruta `/dev/reading-test` responde `persisted:false` y no sustituye
este recorrido. La prueba automatizada de este PR usa datos ficticios y emuladores,
con `source:real` exclusivamente para verificar el contrato de aprovisionamiento;
no afirma tener sensores conectados ni contiene lecturas de personas.

## Evidencia ejecutada (22 de octubre de 2026)

Base `main a1c12bc` más esta entrega; Windows, Node 24.15.0, Java 21 y Firebase
CLI 15.34.0. `./tools/firebase/verify-gerson.ps1` aprobó tipos/build de tres
workspaces y **214 pruebas API en 25 archivos, sin omisiones**, con Auth y
Firestore Standard emulados. Incluye seis regresiones nuevas: dry-run, repetición
sin mutación de estado/credenciales, conflictos y permisos, concurrencia,
config/heartbeat/ingestión oficial y CLI con archivo privado persistente.

No se ejecutó este aprovisionador contra una placa física ni se crearon sus
credenciales cloud: coordinación debe identificar la NodeMCU concreta y usar
este procedimiento con el actor y proyecto aprobados.
