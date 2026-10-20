# PL2-08 — Línea base de la API antes del contrato 2.0.0

Fecha de ejecución: 2026-10-19.
Responsable: `@AxelHerrera11`.
Entorno: macOS (zsh), Node.js 24.14.1, npm 11.11.0, Java 21.0.9, Firebase CLI 15.34.0 vía `npx`. Emuladores Firestore y Auth con el proyecto `demo-pulsolink`. Sin servicios de nube.

## Preparación

- Revisión comprobada: `main` en `df5e858`.
- Dependencias instaladas con el lockfile existente.
- Configuración usada: `FIREBASE_PROJECT_ID=demo-pulsolink`. No hay `.env` ni credenciales reales.

## Comandos ejecutados

Equivalente en zsh de los comandos de [firebase/README.md §4](../../firebase/README.md):

```sh
# Sin emuladores
npm test --workspace=apps/api

# Con emuladores Firestore + Auth
FIREBASE_PROJECT_ID=demo-pulsolink npx -y firebase-tools@15.34.0 emulators:exec \
  --config firebase/emulators.test.json --project demo-pulsolink --only firestore,auth \
  'npm run test --workspace=apps/api'
```

En PowerShell, la segunda ejecución corresponde a `$env:FIREBASE_PROJECT_ID = 'demo-pulsolink'` seguido del mismo `npx` (ver firebase/README.md).

## Resultados

| Comprobación | Resultado | Evidencia observable |
| --- | --- | --- |
| Suite de la API sin emuladores | Aprobado con omisiones | 11 archivos aprobados y 1 omitido; 97 pruebas aprobadas y 9 omitidas de 106 |
| Suite de la API con emuladores | Aprobado | 12/12 archivos y 106/106 pruebas; código de salida 0 |
| Reserva concurrente y start/finish idempotentes (contrato anterior) | Aprobado | `persistence.test.ts` › *allows one concurrent reservation and makes start/finish idempotent* |
| Deduplicación concurrente de mediciones | Aprobado | `persistence.test.ts` › *deduplicates concurrent normalized payloads atomically* |
| Recorrido HTTP crear → iniciar → muestras → finalizar con Firestore | Aprobado | `sessions-api.test.ts` › *Contrato B con Firestore Emulator* |
| Sesión y CSRF exigidos antes de persistir; operador limitado a sus sesiones | Aprobado | `sessions-api.test.ts` › *Contrato B: dispositivos y sesiones* |

Un primer intento con emuladores falló porque faltaba `FIREBASE_PROJECT_ID`. Era un error de configuración de quien ejecutaba, no del código: las pruebas exigen un proyecto `demo-` de forma explícita. La fila anterior corresponde a la repetición con la variable definida.

## Alcance y pendientes

- Demuestra que el **contrato anterior** (`participantCode`, `operator`) pasa sus pruebas automatizadas con emuladores en `df5e858`.
- **No** demuestra nada del contrato 2.0.0: en esta revisión no existen pacientes, asignaciones, usuarios, rol `viewer` ni auditoría (#26, #27 y #28 abiertos).
- No se hicieron peticiones HTTP manuales ni se usó el proyecto Standard de prueba. El emulador no demuestra la disponibilidad de índices en la nube.
- No se ejecutó en Windows/PowerShell. Queda pendiente repetirlo en ese entorno para la matriz conjunta con `@HugoX2024`.
- Matriz de casos: [docs/qa/pl2-08-matriz-api-permisos.md](../qa/pl2-08-matriz-api-permisos.md).
