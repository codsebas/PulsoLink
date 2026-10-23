**Auditoría responsiva:** `00be19f` → `a6a3c6a` — 4 mejoras, 0 regresiones.

| Ancho | Ruta | Desbordamiento (px) | Controles <44 px | Cabecera (px) | Tablas con scroll horizontal | Textos <12 px | Altura de página (px) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 360 | `/monitoring/monitor-patient` | 0 | 10/13 | 65 | 1 → 0 (−1) ✅ | 22 → 0 (−22) ✅ | 9469 → 5672 (−3797) |
| 768 | `/monitoring/monitor-patient` | 0 | 10/12 | 65 | 0 | 28 → 0 (−28) ✅ | 8649 |
| 1440 | `/monitoring/monitor-patient` | 0 | 20/20 | 121 | 0 | 26 → 1 (−25) ✅ | 7967 |

✅ menos es mejor · ⚠️ empeora. La altura de página depende de los datos y no cuenta como regresión.
