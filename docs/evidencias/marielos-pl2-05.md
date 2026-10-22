# PL2-05: estados visuales y accesibilidad

Issue #29; complemento de #56, sin modificar hooks ni persistencia.

Se distinguen calidad por magnitud (etiqueta y borde/color), tres estados de conexión y datos desactualizados. Se conservan nulos, unidades, horas, origen y avisos académicos. El menú ocupa su propia fila, permite desplazamiento horizontal y muestra una indicación en móvil; incluye foco visible y movimiento reducido. La tabla es una región desplazable accesible por teclado.

Las regresiones de `vital-card.test.tsx` verifican las cuatro calidades y la ausencia inicial. El recorrido de QA #33 comprueba la página real en 360×800, 768×1024 y 1440×900, el desplazamiento del menú, teclado y movimiento reducido. Las comprobaciones de navegador y sus resultados se documentan allí, separadas de jsdom.

La aceptación final de diseño corresponde a Axel y coordinación; este documento no declara una aprobación en su nombre ni cierra #29 automáticamente.
