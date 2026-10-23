**Auditoría responsiva:** `a6a3c6a` → `91bac19` — 8 mejoras, 0 regresiones.

| Ancho | Ruta | Desbordamiento (px) | Controles <44 px | Cabecera (px) | Tablas con scroll horizontal | Textos <12 px | Altura de página (px) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 360 | `/monitoring/monitor-patient` | 0 | 10/13 | 65 | 0 | 0 | 5672 → 5622 (−50) |
| 360 | `/assignments` | 0 | 7/10 | 65 | 0 | 0 | 1227 → 1186 (−41) |
| 360 | `/sessions` | 0 | 6/11 | 65 | 0 | 0 | 1347 → 1322 (−25) |
| 1440 | `/monitoring` | 0 | 14/15 → 12/13 (−2) ✅ | 121 | 0 | 1 | 900 |
| 1440 | `/monitoring/monitor-patient` | 0 | 20/20 → 18/18 (−2) ✅ | 121 | 0 | 1 | 7967 |
| 1440 | `/patients` | 0 | 17/17 → 15/15 (−2) ✅ | 121 | 0 | 1 | 900 |
| 1440 | `/devices` | 0 | 20/20 → 18/18 (−2) ✅ | 121 | 0 | 1 | 900 |
| 1440 | `/assignments` | 0 | 18/18 → 16/16 (−2) ✅ | 121 | 0 | 1 | 900 |
| 1440 | `/sessions` | 0 | 19/19 → 17/17 (−2) ✅ | 121 | 0 | 1 | 900 |
| 1440 | `/admin/users` | 0 | 18/18 → 16/16 (−2) ✅ | 121 | 0 | 1 | 900 |
| 1440 | `/admin/audit` | 0 | 15/15 → 13/13 (−2) ✅ | 121 | 0 | 8 | 900 |

Rutas medidas antes y ausentes después: 360 `/`, 768 `/`, 1440 `/`.

✅ menos es mejor · ⚠️ empeora. La altura de página depende de los datos y no cuenta como regresión.
