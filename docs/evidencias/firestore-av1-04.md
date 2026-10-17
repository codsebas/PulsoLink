# AV1-04 — Persistencia Firestore de @gioore

Fecha de verificación: 16 de octubre de 2026, referencia de Guatemala. Issue relacionado: [#6](https://github.com/codsebas/PulsoLink/issues/6).

## Entorno y resultado

- Windows / PowerShell, Node.js 24.15.0, npm 11.12.1, Java 21.0.7.
- Firebase CLI 15.34.0, Firestore Emulator 1.22.0 en **edición Standard**, Auth Emulator y proyecto desechable `demo-pulsolink`.
- Dependencias instaladas con `npm ci`; no se modificaron manifiestos ni lockfile.

Comandos ejecutados desde la raíz:

```powershell
$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'
npx -y firebase-tools@latest emulators:exec --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth 'npm run test --workspace=apps/api'
npm run typecheck --workspace=apps/api
npm run build --workspace=apps/api
git diff --check
```

Resultado: **12 pruebas aprobadas en 3 archivos**, tipos API correctos, compilación API correcta y sin errores de espacios en el diff.

## Casos ejercitados

1. Aprovisionamiento con identidades Auth existentes: crea perfiles/dispositivo/credencial una sola vez, conserva deshabilitación de perfiles y marcas de tiempo, rechaza cambio de secreto sin sobrescribir documentos.
2. Autenticación de dispositivo con secreto correcto/incorrecto, credencial deshabilitada y revocada; el resultado no contiene el hash.
3. Ejecución real del CLI de aprovisionamiento en procesos Node separados: segunda ejecución sin creaciones; secreto conflictivo sale con código 1 y no aparece en stdout/stderr.
4. Dos inicios concurrentes sobre el mismo dispositivo: exactamente uno reserva. Repetir inicio conserva fecha; aprovisionar durante la sesión conserva la reserva.
5. Dos ingestiones idénticas concurrentes: un solo documento y misma referencia/fecha. Propiedades reordenadas y `capturedAt` omitido/null se deduplican. Cambio de contenido produce `IDEMPOTENCY_CONFLICT`.
6. Calidad `no_contact` con valores ópticos nulos y temperatura válida; origen simulado asignado por persistencia; resumen y última comunicación actualizados atómicamente.
7. Finalización repetida sin cambio de fecha, liberación de dispositivo, rechazo de muestras nuevas y reapertura; reintento de muestra original conserva respuesta tras finalizar. Un nuevo cliente Admin puede leer los datos guardados.
8. Historial por fecha/ID con empates: páginas sin saltos; filtros temporales y cursor ligado a sesión/filtros; consultas de sesiones con propietario/estado/dispositivo.
9. Lectura y escritura REST directa a Firestore denegadas con HTTP 403, tanto anónimas como autenticadas mediante Auth Emulator.
10. Validación sin acceder a Firestore: secuencia fuera de rango, calidad/valor incompatible, SpO₂ fuera de límite, ID con ruta, cursor incorrecto y límite superior a 100.

## Límites y pendientes observados

- No hay sesión de Firebase CLI autenticada: `firestore:databases:list --non-interactive` devuelve error de autenticación. No se configuró ni verificó una instancia real, IAM, región o despliegue de índices/reglas en nube.
- El emulador no exige índices compuestos como el servicio real. Las definiciones están versionadas; su despliegue y las consultas en nube deben comprobarse antes de la demostración integrada.
- La lectura con un nuevo cliente prueba independencia de la memoria de los repositorios. No se ejecutó un reinicio de la API integrada ni una recarga de navegador; las rutas de #4/#5 y Auth de #10 siguen por integrar.
- `npm run typecheck` y `npm run build` globales fallan en el frontend con **TS6310**: `apps/web/tsconfig.json` referencia un proyecto que deshabilita emisión. Esos archivos no cambian en este trabajo; API y simulador completaron sus respectivas comprobaciones. No se presenta la compilación global como aprobada.
- `npm ci` reportó 20 vulnerabilidades de las dependencias existentes (13 moderadas, 5 altas, 2 críticas). Su actualización queda fuera del bloque de persistencia; no se aplicó `npm audit fix` ni se cambió el lockfile.
- Los scripts existentes de lint imprimen mensajes; no constituyen análisis estático real.

Los datos de prueba fueron locales y desechables, con identificadores y secretos aleatorios. Ninguna credencial real se incorpora a esta evidencia.
