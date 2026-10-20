# Revisión documental de contratos — 18 de octubre de 2026

Alcance: documentación, OpenAPI y plan del contrato aprobado. La primera revisión local partió de `b0a492b`; esta evidencia no implica que aquella rama haya publicado los documentos en `main`.

## Comprobaciones ejecutadas

Validación formal con `@apidevtools/swagger-cli` 4.0.4, sin añadir dependencias al monorepositorio. Reproducción desde la raíz en PowerShell:

```powershell
npx --yes --package @apidevtools/swagger-cli@4.0.4 swagger-cli validate contracts/device.openapi.yaml
npx --yes --package @apidevtools/swagger-cli@4.0.4 swagger-cli validate contracts/web.openapi.yaml
git diff --check
```

Resultados: `contracts/device.openapi.yaml is valid`, `contracts/web.openapi.yaml is valid`; `git diff --check` sin errores. El paquete avisa que está discontinuado; su uso aquí es validación puntual, no una dependencia adoptada por el proyecto.

Además se ejecutó una comprobación local temporal con parser YAML y Ajv (JSON Schema 2020, formatos desactivados para esa comprobación de ejemplos):

- 36 operaciones con identificadores únicos y parámetros de ruta requeridos.
- 285 referencias OpenAPI resueltas y 49 enlaces Markdown locales existentes.
- Cabecera CSRF requerida en mutaciones web; restricciones declaradas de administración y auditoría a `admin`.
- `deviceId` y `capturedAt` obligatorios en mediciones; `deviceId` obligatorio en heartbeat; creación de sesión desde `assignmentId`; enum de rol `admin|viewer`.
- Ejemplo acordado aceptado; `heartRate: null/no_contact` aceptado.
- Ocho cargas rechazadas por esquema: sin deviceId, sin capturedAt, valor numérico con estado invalid, unidad incorrecta, pulso válido igual a cero, temperatura fuera de límites técnicos, patientId introducido por emisor y secuencia negativa.

Estos son resultados de validación de documentos y esquemas. No verifican autenticación efectiva, permisos del servidor, persistencia, índices en nube, hardware ni un recorrido web integrado. No se ejecutaron build, typecheck, pruebas de API ni emuladores para esta tarea documental. Los criterios funcionales siguen pendientes en el [plan de ejecución](../planificacion/ejecucion-2026-10-18.md).

El 19 de octubre se volvió a comparar con `main` (`b056aa4`). Ese árbol ya implementa rutas de sesiones y dispositivos del contrato anterior, pero no contiene el contrato de arquitectura, el modelo objetivo ni el plan nuevo; ambos OpenAPI siguen en 1.0.0. Se incorporaron los documentos en una rama nueva basada en ese `main` y se conservaron las guías existentes en vez de sustituirlas.

En esta revisión se ejecutó de nuevo la validación de ambos OpenAPI 2.0.0 con `swagger-cli` 4.0.4: los dos son válidos. Se comprobaron 46 enlaces Markdown locales de los archivos afectados, sin enlaces rotos, y `git diff --check` no encontró errores. Son verificaciones documentales; no prueban el nuevo flujo funcional. Los issues anteriores sí tienen responsables asignados en GitHub, pero esta rama no publica ni reasigna issues nuevos.
