# Plan de cierre técnico de PulsoAI

Solicitud de coordinación: resolver el fallo de concurrencia propio del backend y completar #72/#76. No depende de Groq, del rediseño #74 ni del hardware #35.

1. Integrar main actualizado sin alterar otras tareas. Base incorporada: 3db477a (#78).
2. Ordenar solicitudes de una misma sesión dentro del proceso API mediante ejecución FIFO compartida por cliente Firestore/sesión. Límite: 32 solicitudes vivas, RATE_LIMITED/429 con Retry-After al saturar. Las sesiones distintas siguen en paralelo; Groq no entra en este coordinador.
3. Aplicar a ingestión y transiciones. Mantener transacciones, validaciones, idempotencia, auditoría y trabajo PulsoAI atómicos. Firestore conserva consistencia entre procesos: el coordinador local es una optimización, no un bloqueo distribuido. No almacena muestras offline ni reenvía periodos desconectados.
4. Probar ambos órdenes de carrera, duplicados después del cierre, liberación ante error, saturación y seis rondas bajo 5000 ms. Repetir por HTTP real y ejecutar suite API con Auth/Firestore Standard emulados.
5. Verificar web, tipos, build y recorrido PulsoAI con Groq real. Registrar resultados y límites; no atribuir latencia de emulador a nube.
6. Actualizar #72/#76 y retirar borrador si pasa la aceptación. Despliegue/configuración y ensayo HTTPS son pasos posteriores, distintos de marcar el PR listo para revisión.

Referencia: [contención transaccional de Firestore](https://firebase.google.com/docs/firestore/transaction-data-contention). No se aumenta el timeout para aprobar ni se cambia de edición Standard.
