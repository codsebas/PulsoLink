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

## 2. Pendientes de Configuración en la Nube

Para conectar la API con Firestore en la nube:
1. Crear el proyecto en la consola de Firebase.
2. Habilitar Cloud Firestore en la región deseada en edición **Standard**.
3. Habilitar el proveedor Correo/Contraseña en Firebase Authentication.
4. Generar una clave de cuenta de servicio (`serviceAccountKey.json`) y configurarla en las variables de entorno locales de `apps/api/.env` (nunca subirla a Git).
5. Desplegar reglas e índices mediante Firebase CLI:
   ```powershell
   firebase deploy --only firestore:rules,firestore:indexes
   ```
