# PulsoAI — resumen descriptivo de sesiones

Ampliación solicitada por coordinación el 22 de octubre de 2026, seguimiento #72. **PulsoAI** es el nombre de la IA integrada en PulsoLink. Proveedor Groq, modelo `openai/gpt-oss-20b`; no es un chatbot. El diseño posterior pertenece a #74.

## Experiencia mínima

En `/sessions/:id`, debajo de los indicadores y la información de última muestra/contacto, mostrar **Resumen generado por PulsoAI** solo cuando exista texto generado. Durante el trabajo o ante fallo, titular **PulsoAI — resumen de sesión**, mostrar estado y estadísticas disponibles. Las fechas de última muestra/contacto conservan su significado.

Se procesa al finalizar una sesión. Las sesiones históricas anteriores permiten a admin solicitar generación con el mismo botón de reintento. Admin/viewer leen; solo admin genera/reintenta, con cookie/CSRF. No llamar Groq desde frontend ni GET.

## Exactitud y generación restringida

Express calcula todas las páginas de lecturas de una sesión cerrada: total, duración y estadísticas por magnitud (válidas, promedio aritmético, mínimo, máximo y conteos por calidad). Solo `valid` numéricos contribuyen; sin válidas devuelve null. No inferir tiempo sin contacto, estabilidad ni diagnóstico. La temperatura es superficial y SpO₂ estimada; origen real/simulado explícito.

Las pruebas libres del modelo devolvieron afirmaciones sin respaldo. Esta versión usa **generación restringida**: el backend construye hechos con dos redacciones aprobadas y Groq selecciona orden y redacción de cada hecho con JSON Schema estricto. Zod exige cobertura completa, IDs únicos y variantes permitidas; el backend compone el texto. No se publica prosa arbitraria del proveedor. El modelo organiza el resumen; no calcula ni interpreta clínicamente. Esta restricción forma parte del producto inicial, no es un resultado médico.

## Persistencia y recuperación

`sessionSummaries/{sessionId}` contiene un trabajo por sesión. El cierre crea `pending` en la misma transacción; la ingestión también lee/escribe la sesión, de modo que el cierre fija un conjunto estable. Sesiones previas no se migran automáticamente: POST de admin crea su trabajo. Estados públicos: `not_requested`, `pending`, `generating`, `ready`, `failed`, `disabled`, `insufficient_data`.

Documento: sessionId, status, attempts, createdAt, updatedAt, leaseToken y availableAt internos, stats, text, generatedAt, provider/model, promptVersion/statsVersion/inputHash, errorCode sanitizado. No guardar clave ni respuesta/prompt crudos. `stats` guarda source, durationSeconds, total y metrics (heartRate/spo2/skinTemperature), cada una con unit, validCount, mean/min/max nullable y quality (valid/no_contact/invalid/unavailable).

Worker del proceso API, una ejecución a la vez y revisión cada 5 s: consulta ordenada por availableAt (índice simple). Pending tiene fecha de ejecución; generating tiene fecha de vencimiento del lease de 5 minutos; terminales tienen null. Recupera generating expirados tras reinicio. No llama Groq dentro de transacción. Publicación exige el mismo lease; resultados antiguos no sobrescriben trabajos nuevos. Máximo tres intentos por trabajo y espera entre llamadas de al menos 30 s por proceso. 429 respeta Retry-After; fallos permanentes/validación quedan failed hasta reintento admin, con enfriamiento. Ready no regenera. No se promete exactamente una llamada externa ante timeout/reinicio.

Duración acotada de cálculo: hasta 2 minutos; cada página renueva comprobación de plazo. Un trabajo demasiado grande falla explícitamente en lugar de truncar lecturas. Groq timeout 30 s y salida 2048 tokens. Si no hay datos válidos, no llamar proveedor. Si IA deshabilitada, calcular estadísticas y devolver disabled. La generación no bloquea el cierre ni altera sus respuestas.

El worker necesita un proceso servidor activo; en Render con suspensión, reanuda cuando vuelve el proceso. No garantiza generación mientras el host está dormido. No introduce cron, Batch API, Redis ni un servicio pago. Varios procesos mantienen leases por trabajo, pero el presupuesto global de cuota del proveedor requiere coordinación adicional antes de escalar.

## Contrato B adicional

GET `/api/v1/sessions/{id}/summary`: admin/viewer, autorización de la sesión, 200 `{data:SessionSummary}`. Activa/creada o histórica sin trabajo devuelve not_requested sin efectos secundarios. POST `/api/v1/sessions/{id}/summary/retry`: admin + CSRF, cuerpo `{}`, exige finished (409 INVALID_SESSION_STATE). Devuelve 202 estado actual; pending/generating/ready idempotentes; failed/disabled/insufficient_data tienen enfriamiento 60 s (409 SUMMARY_RETRY_TOO_SOON). No reabrir sesión. 401/403/404 y errores generales del proyecto.

## Configuración

Solo backend: `SESSION_SUMMARY_ENABLED=false`, `GROQ_API_KEY` privada y `GROQ_MODEL=openai/gpt-oss-20b`. Activar explícitamente localmente y en Environment de Render. No usar variables VITE_* ni versionar `.env`. Sin flag/clave, estadísticas disponibles y texto IA deshabilitado. Sin cambio automático de modelo/proveedor. No activar planes pagos. Consulta de referencia: 22-10-2026; Free y límites confirmados por el usuario, acceso API probado (3 HTTP 200); cuotas pueden cambiar.

## Validación y fuentes

Tests: estadísticas con varias páginas/null/calidad, generación con cobertura/variantes inválidas y errores sanitizados, reintentos, leases, cierre atómico, permisos API y UI. Recorrido con emulador y datos sintéticos; una llamada real adicional comprueba el adaptador restringido. La prueba de Groq no acredita por sí sola Firestore/UI ni despliegue.

- [Modelo Groq](https://console.groq.com/docs/model/openai/gpt-oss-20b)
- [Structured Outputs](https://console.groq.com/docs/structured-outputs)
- [Referencia HTTP](https://console.groq.com/docs/api-reference)
- [Límites](https://console.groq.com/docs/rate-limits)
- [Tratamiento de datos](https://console.groq.com/docs/your-data)

Fuera: diagnóstico, tratamientos, predicciones, alarmas, PDF, chatbot y cambios de hardware.
