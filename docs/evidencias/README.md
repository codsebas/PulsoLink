# PulsoLink — Registro de Evidencias y Pruebas

Espacio para registrar resultados reproducibles de integración, comprobaciones de calidad y recorridos demostrables.

- **Responsable principal:** `@orem6` (Issue #11 / AV1-09).
- Las evidencias históricas no sustituyen una ejecución local o de CI actual.
- Nunca registrar secretos, cookies, tokens, credenciales de dispositivo, cuentas de servicio ni datos personales.

## Formato mínimo

Cada evidencia debe indicar, como mínimo:

````markdown
# <Identificador> — <Título>

Fecha de ejecución: <YYYY-MM-DD>.
Responsable: <cuenta>.
Entorno: <Windows/PowerShell, versiones relevantes y emulador o nube>.

## Preparación
- Rama o revisión comprobada: `<referencia>`.
- Configuración usada: <solo nombres de variables y origen seguro; nunca valores sensibles>.

## Comandos ejecutados
```powershell
<comandos exactos>
```

## Resultados
| Comprobación | Resultado | Evidencia observable |
| --- | --- | --- |
| <caso> | Aprobado / Falló / Omitido / No ejecutado | <código de salida, respuesta o archivo> |

## Alcance y pendientes
- <qué demuestra la ejecución>
- <qué no se ejecutó o permanece bloqueado>
````

Use **Aprobado** solo si el comando o recorrido se ejecutó y produjo el resultado esperado. Use **Omitido** cuando una condición documentada evita el caso, y **No ejecutado** cuando no se intentó.

## Evidencias disponibles

- [AV1-02: recepción autenticada de mediciones por API](dispositivo-av1-02.md): verificación de endpoints del Contrato A (`/device/config`, `/device/heartbeat`, `/device/measurements`), autenticación Bearer, validación Zod e idempotencia.
- [AV1-04: persistencia Firestore](firestore-av1-04.md): ejecución histórica de repositorios con emuladores; no acredita el flujo HTTP o web integrado.
- [AV1-09: arranque e integración inicial](integracion-av1-09.md): comprobaciones locales de scripts y estado de dependencias para la rama de integración.
- [PL2-08: línea base de la API antes del contrato 2.0.0](pl2-08-linea-base.md): suite de la API con emuladores (106/106) sobre el contrato anterior; no acredita el contrato 2.0.0.
- [PL2-04: autenticación, usuarios y auditoría](auth-pl2-2026-10-20.md): suite correctiva de API con emuladores (148/148), recuperación, P-06, compilación y evidencia de navegador; distingue verificaciones y límites.
- [PL2-04: informe de correcciones](informe-auth-pl2-2026-10-20.md): cambios de recuperación, integración de #38, resultados y requisitos de cierre formal.
