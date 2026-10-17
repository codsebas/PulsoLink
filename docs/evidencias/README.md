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

- [AV1-04: persistencia Firestore](firestore-av1-04.md): ejecución histórica de repositorios con emuladores; no acredita el flujo HTTP o web integrado.
- [AV1-09: arranque e integración inicial](integracion-av1-09.md): comprobaciones locales de scripts y estado de dependencias para la rama de integración.
