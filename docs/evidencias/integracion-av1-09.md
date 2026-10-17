# AV1-09 — Arranque e integración inicial de @orem6

Fecha de ejecución: 16 de octubre de 2026.
Responsable: `@orem6`.
Rama comprobada: `docs/orem6-integration-setup`.

## Alcance

Esta evidencia cubre el arranque común, los scripts declarados en los manifiestos npm y las dependencias entre los módulos. No ejecuta el recorrido de demostración ni modifica funcionalidades de API, web, Firebase o simulador.

## Entorno y preparación

- Windows con PowerShell, Node.js `v24.15.0` y npm `11.12.1`.
- Instalación desde el `package-lock.json` mediante `npm ci`.
- No se usaron archivos `.env`, credenciales de Firebase, cookies, tokens ni secretos de dispositivo.

## Comandos ejecutados

```powershell
git status --short --branch
git diff --check
git branch --show-current
npm ci
npm run typecheck
npm run build
npm run lint
```

## Resultados locales

| Comprobación | Resultado | Evidencia observable |
| --- | --- | --- |
| Rama y árbol inicial | Aprobado | Rama `docs/orem6-integration-setup`, seguimiento configurado y sin cambios iniciales. |
| `git diff --check` inicial | Aprobado | Sin salida. |
| `npm ci` | Aprobado con observaciones | Instaló 493 paquetes desde el lockfile; npm reportó 20 vulnerabilidades: 13 moderadas, 5 altas y 2 críticas. No se ejecutó `npm audit fix`. |
| `npm run typecheck` | Falló | API y simulador ejecutaron `tsc --noEmit`. La web falló con `TS6310`: el proyecto referenciado `apps/web/tsconfig.node.json` deshabilita emisión. |
| `npm run build` | Falló | API y simulador compilaron. La web falló con el mismo `TS6310`, antes de `vite build`. |
| `npm run lint` | Aprobado con alcance limitado | API y web imprimieron `lint ok`; los scripts no ejecutan ESLint ni otra herramienta de análisis. |
| Tests API con emuladores | No ejecutado | Requieren Java 21 y Firebase CLI/emuladores; no formaron parte de esta comprobación inicial. |
| Recorrido HTTP/UI integrado | Bloqueado | Endpoints funcionales, autenticación, simulador y pantallas de sesiones siguen pendientes de sus responsables. |

## Dependencias de integración

| Flujo | Estado | Dependencia |
| --- | --- | --- |
| Health de API | Implementado | `apps/api` puede arrancar sin credenciales Firebase. |
| Persistencia Firestore | Implementada en repositorios | Requiere configuración Firebase o emuladores y conexión desde rutas HTTP. |
| Contrato A | Bloqueado | `@codsebas` debe implementar autenticación de dispositivo, configuración, heartbeat e ingestión. |
| Contrato B de acceso | Bloqueado | `@Mar-03` debe implementar Firebase Auth, cookie de sesión, CSRF y roles. |
| Contrato B de sesiones | Bloqueado | `@DidhyerOrtiz` debe conectar rutas HTTP con repositorios y aplicar autorización. |
| Simulación IoT | Bloqueado | `@HugoX2024` depende del Contrato A, credencial aprovisionada y sesión activa. |
| Pantallas de operación | Bloqueado | Web depende de autenticación y endpoints de sesiones/mediciones; responsables `@AxelHerrera11`, `@Lis671` y `@Javifa2324`. |

## Diferencia frente a evidencia histórica

[AV1-04](firestore-av1-04.md) registra una ejecución previa de 12 pruebas de repositorios con Firestore/Auth Emulator. Esa ejecución demuestra persistencia local y reglas denegadas, pero no prueba esta rama, los endpoints HTTP, la autenticación web, el simulador ni la interfaz. Esta evidencia solo registra los comandos ejecutados localmente arriba.

## Pendientes de QA

- Resolver `TS6310` en la configuración TypeScript de la web antes de aprobar calidad global.
- Ejecutar pruebas API mediante emuladores y registrar versión de Java/Firebase CLI y resultado real.
- Verificar el recorrido login, sesión, simulador, indicadores, finalización e historial cuando sus módulos estén integrados.
- Probar autorización, CSRF, idempotencia, `no_contact`, datos desactualizados y persistencia tras recarga.
