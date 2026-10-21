# Informe de correcciones de PL2-04 — 20 de octubre de 2026

Estado: correcciones locales implementadas y verificadas; sin commit, push ni
publicación de PR. Rama `feat/auth`, base `1385d23`. Se conservaron los cambios
previos de OpenCode. El avance rápido incorporó los PR #38 y #40 ya aprobados;
no se fusionó ni modificó ningún PR remoto. Git conservó un respaldo autostash.

## Qué se corrigió

1. **Escritura tardía en Firebase Auth.** La finalización comprueba versión y
   reclamo. Si un trabajador vencido escribe después de una operación nueva,
   deja reconciliación durable y vuelve a aplicar el perfil vigente, aunque el
   trabajador nuevo ya haya limpiado su journal. Si falla, queda pendiente para
   otra instancia y no se duplica la auditoría administrativa.
2. **PATCH sin cambios con sincronización pendiente.** Otro admin que repite
   valores aplicados debe completar la sincronización o recibir 503; no recibe
   éxito simplemente porque Firestore ya tenga esos valores.
3. **Recuperación paginada.** Los pendientes se recorren por fecha e ID con
   cursor. Una primera página de creaciones esperando contraseña no bloquea
   actualizaciones posteriores. Arranque y CLI continúan por lotes.
4. **Revocación P-06.** Se separaron emisión y revocación por 1200 ms. La cookie
   se rechazó sin deshabilitar la identidad: se corrigió la afirmación previa
   de que Auth Emulator ignoraba revokeRefreshTokens.
5. **Permisos de una sesión existente.** Con Auth/Firestore de emuladores y
   fallos controlados de sincronización, la misma cookie pasa de admin a viewer
   (administración 403, lectura 200), después a perfil deshabilitado (403
   USER_DISABLED) y finalmente a cookie rechazada (401) al sincronizar Auth.
6. **Integración de frontend.** Se resolvió Header conservando navegación
   administrativa, Monitoreo, identidad y Salir. Header, ProtectedRoute y las
   vistas de Lis usan el mismo hook de sesión y caché. Logout limpia la caché
   antes de renovar CSRF. El filtro de usuarios muestra habilitados o
   deshabilitados, sin prometer un listado «Todos» que la API no ofrece.
7. **Errores de login.** Un error CSRF ya no se presenta como cuenta deshabilitada.

## Verificación ejecutada

| Comprobación | Resultado |
| --- | --- |
| API completa, Auth y Firestore Standard de emuladores, proyecto demo | 148/148, 22 archivos; 34,27 s |
| Pruebas de recuperación de usuarios | 12, con Firestore Emulator e identidad controlada |
| Pruebas de usuarios con Auth Emulator real | 2, incluidas revocación y permisos con cookie anterior |
| Typecheck global | Correcto |
| Build global | API, web y simulador correctos |
| Typecheck y build web tras incorporar #38 | Correctos |
| Navegador con API real y emuladores, sin mocks HTTP | AUTH_UI_OK |
| Espacios y conflictos | `git diff --check` y revisión de marcadores |

El recorrido de navegador crea, modifica y deshabilita un usuario, consulta la
auditoría, verifica logout y denegaciones de viewer. También comprueba el foco
de la alerta de login y el ancho móvil del login. No equivale a una auditoría
visual exhaustiva de todas las pantallas.

Comandos, entorno y límites detallados en
[la evidencia reproducible](auth-pl2-2026-10-20.md). El script de navegador está
en `tools/auth/verify-browser.cjs`; solo admite emuladores locales y proyecto
`demo-`. No instala dependencias dentro del repositorio.

## Qué queda para cerrar formalmente #28

- Revisión y aprobación humana del diff, en especial los cambios compartidos
  en UsersRepository, AuditRepository y el journal con Gerson.
- PR enlazado a #28, publicación y proceso de revisión del equipo. Nada de ello
  se ejecutó desde esta sesión.
- QA completa de los módulos de pacientes, placas y asignaciones cuando estén
  disponibles sus endpoints administrativos; no se atribuyen a #28 pruebas de
  rutas que aún pertenecen a #27.
- Validación de índices/IAM y despliegue en Firebase de prueba si el equipo
  requiere demostrar la ejecución en nube. No se accedió a Firebase real.

Permanece la limitación deliberada de creación: no se compara la contraseña de
un reintento ni se persiste un verificador; solo se reconoce compatibilidad con
la operación registrada. Una creación sin identidad requiere reenviarla.

Auth y Firestore no comparten transacción. Las comprobaciones implementadas
garantizan los permisos de la API desde el perfil vigente y corrigen escrituras
tardías detectadas; no se afirma atomicidad distribuida entre ambos servicios.
La advertencia del bundle web (>500 kB, aproximadamente 825 kB con #38) sigue
visible. Los scripts de lint son marcadores, no análisis estático real.
