> **Estado y versión:** las secciones inferiores conservan las firmas y comandos del avance anterior. La entrega PL2 añade [pacientes, asignaciones, historial, auditoría e interfaces de integración](../docs/arquitectura/persistencia-pl2-integracion.md) y una [semilla admin/viewer para emuladores](../docs/setup/firebase-pl2.md). El runtime de legado se conserva durante la ventana documentada; no ejecutar sus scripts antiguos como sustituto del procedimiento nuevo. El [modelo objetivo](modelo-objetivo.md) y el [plan vigente](../docs/planificacion/ejecucion-2026-10-18.md) siguen definiendo los pendientes de integración del equipo.

# PulsoLink — Configuración de Firebase y Persistencia

Directorio de versionado de reglas de seguridad, índices y directrices de persistencia para **Cloud Firestore (Edición Standard)** y **Firebase Authentication**.

- **Responsable asignado:** `@gioore` (Issue #6).

---

## 1. Principios de Persistencia en PulsoLink

1. **Exclusividad en Backend:** Solo la aplicación `apps/api` accede a Firestore utilizando `firebase-admin`. No se permite que el frontend web ni dispositivos se comuniquen directamente con SDKs clientes de Firebase.
2. **Edición Standard:** Se acordó el uso de Cloud Firestore Standard (no Enterprise, no SQL Connect, no PostgreSQL).
3. **Reglas de Seguridad (`firestore.rules`):** Bloqueo total de lectura y escritura (`allow read, write: if false;`). El Firebase Admin SDK en el servidor opera con privilegios administrativos, por lo que las validaciones de roles, permisos y propiedad recaen en Express y Zod.
4. **Colecciones y Modelado:**
   - `users/{uid}`: Perfiles vinculados a Firebase Authentication.
   - `devices/{deviceId}`: Código, origen (`real` o `simulated`), estado habilitado, `activeSessionId` y `lastSeenAt`.
   - `deviceCredentials/{credentialId}`: Hash del secreto del dispositivo (solo accesible en servidor).
   - `sessions/{sessionId}`: Metadatos de la sesión, participante (`P-001`), operador propietario, fechas de inicio y fin.
   - `sessions/{sessionId}/measurements/{measurementId}`: Lecturas individuales con valor, unidad y calidad (`valid`, `no_contact`, `invalid`, `unavailable`). No almacenar todo el historial en un array dentro de un documento.
   - `ingestionKeys/{keyHash}`: Control de idempotencia atómica por clave `deviceId + bootId + sequence`.

---

## 2. Implementación disponible (AV1-04 / #6)

La persistencia utiliza Firebase Admin SDK únicamente en `apps/api`. Se conservan fechas ISO UTC normalizadas con milisegundos, compatibles con las interfaces iniciales. Las rutas de ingestión, autenticación y sesiones del primer contrato ya están conectadas en `main`; este documento conserva las firmas del modelo anterior. Pacientes, asignaciones, historial por paciente y auditoría requieren una ampliación posterior.

| Repositorio | Operaciones |
| --- | --- |
| `UsersRepository` | `getById(uid)` para consultar perfil, rol y habilitación |
| `DeviceCredentialsRepository` | `authenticate(credentialId.secret)` devuelve solo dispositivo habilitado o `null`; compara SHA-256 en tiempo constante y rechaza revocación |
| `DevicesRepository` | `getById`, `list({limit,cursor})`, `heartbeat`; `listEnabled()` conserva compatibilidad y devuelve la primera página de hasta 50 |
| `SessionsRepository` | `create({participantCode,operatorId,deviceId})`, `getById`, `start`, `finish`, `list` |
| `MeasurementsRepository` | `ingest(deviceId,payload)`, `getLatest(sessionId)`, `list(sessionId,{limit,cursor,from,to})` |

Todos los constructores aceptan opcionalmente `() => Firestore`; por defecto usan `getDb()`. Los métodos devuelven documentos internos, **no DTO HTTP**: la API debe mapear `sessionId`/`deviceId` a `id` donde corresponda y seleccionar los campos públicos. El hash de la credencial no se devuelve desde `authenticate` ni desde el listado de dispositivos.

### Acuerdo de integración con backend

- Las rutas deben autenticar usuario/dispositivo y validar roles, habilitación, CSRF y propiedad **antes** de invocar estos repositorios. Admin SDK evita las Security Rules. Estas firmas no sustituyen los servicios de autorización.
- `operatorId` procede de la identidad verificada. En `list`, imponer ese filtro a operadores; solo un administrador autorizado puede omitirlo. Autorizar también `getById`, `start`, `finish`, `latest` e historial contra la sesión padre.
- `deviceId` de `ingest` y `heartbeat` procede exclusivamente de una credencial autenticada. No aceptar identidad u origen elegidos en el cuerpo.
- `start` reserva dispositivo y activa sesión en una transacción; `finish` libera y finaliza en otra. Repetir una transición ya completada conserva las fechas. Una sesión finalizada no se reabre; una creada no se finaliza sin iniciar.
- `ingest` valida el payload técnico del README. Una transacción escribe documento de medición, clave de deduplicación, resumen `latestMeasurement` y `lastSeenAt`. El origen procede del servidor. `capturedAt` omitido y `null` se normalizan como ausencia de reloj. El hash del contenido no depende del orden de propiedades JSON.
- La clave es SHA-256 del array JSON `[deviceId,bootId,sequence]`, sin ambigüedad de separadores. Duplicado idéntico devuelve la referencia/fecha originales con `duplicate:true`, incluso tras finalizar. Mismo identificador y otro contenido produce `IDEMPOTENCY_CONFLICT`.
- Mapear `PersistenceError.code` a HTTP en el servicio/controlador: conflictos de estado/idempotencia a 409, cursor inválido a 400, sesión inexistente a 404. Fallos de validación Zod a 400. Autenticación inválida devuelve 401 desde el middleware. No devolver mensajes internos del SDK.
- Los listados usan límite 50, máximo 100 y un registro adicional para detectar `hasMore`. Sesiones: `createdAt DESC, ID DESC`; mediciones: `receivedAt DESC, ID DESC`. `from` inclusivo y `to` exclusivo. El cursor se valida y vincula a colección, sesión/propietario, filtros y orden; no concede permisos.
- `latestMeasurement` es un único resumen acotado. Los valores históricos se guardan en subcolecciones. Los empates de recepción en el mismo milisegundo usan el ID para coincidir con el orden del historial.
- Los servicios de #5 calculan `meta` de `latest` (45 s para conexión, 10 s para `stale`), sin reinterpretar calidad óptica como conectividad.

## 3. Aprovisionamiento repetible

Coordinar con #10 los UID de identidades Auth ya creadas. Este script **no crea identidades, contraseñas ni cookies**. Comprueba que las identidades existen y no están deshabilitadas antes de crear perfiles. Todos los documentos faltantes se crean en una sola transacción; nunca sobrescribe perfiles, reservas, marcas de tiempo o credenciales existentes. Si un secreto no coincide o un dispositivo existente no es simulado, aborta. No reactiva perfiles ni credenciales deshabilitados y no rota secretos.

1. Copiar `apps/api/.env.example` a `apps/api/.env` y configurar proyecto y credenciales del servidor. Para emuladores, configurar ambos hosts y el mismo proyecto.
2. Añadir a ese `.env` `DEMO_PROFILES_JSON` (array de `{uid,displayName,role}`), `DEMO_DEVICE_ID` y `DEMO_CREDENTIAL_ID`. El rol solo acepta `admin` u `operator`. No poner contraseñas en los perfiles.
3. Generar y guardar el secreto **una sola vez**, desde la raíz en PowerShell. Se conserva para siguientes ejecuciones y se entrega al responsable del simulador por el mecanismo privado del equipo:

```powershell
if (!(Select-String -LiteralPath 'apps/api/.env' -Pattern '^DEMO_DEVICE_SECRET=' -Quiet)) {
    $demoBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $demoSecret = [Convert]::ToBase64String($demoBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    Add-Content -LiteralPath 'apps/api/.env' -Value "`nDEMO_DEVICE_SECRET=$demoSecret"
    Remove-Variable demoBytes, demoSecret
}
```

4. Ejecutar desde `apps/api` para que dotenv cargue su `.env`:

```powershell
Set-Location 'apps/api'
npx tsx src/scripts/provision-demo.ts
Set-Location '../..'
```

La salida solo contiene contadores/indicadores de creación; no imprime secretos. La credencial del simulador es `<DEMO_CREDENTIAL_ID>.<DEMO_DEVICE_SECRET>`. El secreto debe proceder de 32 bytes aleatorios; SHA-256 aquí no es un hash de contraseñas humanas. Guardar el `.env` fuera de Git y proteger el acceso al archivo. No eliminar claves de `ingestionKeys`: conservarlas mantiene la garantía de deduplicación.

## 4. Verificación local reproducible

Requisitos: Node.js 24 LTS y Java 21 o posterior. Desde la raíz, con dependencias instaladas mediante `npm ci`:

```powershell
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx -y firebase-tools@latest emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api'
npm run typecheck --workspace=apps/api
npm run build --workspace=apps/api
```

La configuración de pruebas usa puertos 18080/19099 y las mismas reglas/índices versionados. No toca servicios de nube; usa un proyecto `demo-`. Cada ejecución usa IDs nuevos. Para desarrollo manual, `firebase.json` usa 8080/9099. El SDK se conecta mediante `FIRESTORE_EMULATOR_HOST`; exige proyecto explícito y rechaza ese modo en `NODE_ENV=production`.

Sin ambos emuladores, los tests de integración quedan **omitidos**; las pruebas de validación y health sí se ejecutan. La suite comprueba concurrencia de reserva, deduplicación/conflicto, finalización, lectura mediante un nuevo cliente Admin, aprovisionamiento sin sobrescrituras, filtros/cursor y denegación REST directa anónima/autenticada. La lectura con cliente nuevo demuestra persistencia independiente de la memoria del repositorio; no prueba un despliegue de la API ni persistencia de un emulador apagado sin exportación.

El emulador no verifica la necesidad de índices compuestos: hay que desplegarlos y comprobar consultas en Standard antes de la demo en nube. Los índices incluyen todas las combinaciones de propietario/estado/dispositivo sobre sesiones y el listado de dispositivos habilitados con ID descendente; las consultas de mediciones usan los índices automáticos. Las reglas existentes deniegan toda lectura/escritura directa y permanecen bloqueadas.

## 5. Pendientes de configuración en la nube

Para conectar la API con Firestore en la nube:
1. Crear el proyecto en la consola de Firebase.
2. Habilitar Cloud Firestore en la región deseada en edición **Standard**.
3. Habilitar el proveedor Correo/Contraseña en Firebase Authentication.
4. Configurar Application Default Credentials del servidor o una cuenta de servicio local mediante `GOOGLE_APPLICATION_CREDENTIALS` (nunca subirla a Git). La inicialización del SDK no confirma conectividad, IAM ni existencia de la base.
5. Desplegar reglas e índices mediante Firebase CLI:
   ```powershell
   npx -y firebase-tools@latest deploy --project <ID_DEL_PROYECTO> --only firestore
   ```

No se configura un proyecto real predeterminado ni se crean recursos facturables desde las pruebas. Verificar la edición Standard de la instancia real antes de utilizarla.

Referencias: [transacciones](https://firebase.google.com/docs/firestore/manage-data/transactions), [Admin SDK y emulador Firestore](https://firebase.google.com/docs/emulator-suite/connect_firestore).
