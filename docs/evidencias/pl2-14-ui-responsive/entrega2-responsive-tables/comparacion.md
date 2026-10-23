**Auditoría responsiva:** `3db477a` → `00be19f` — 11 mejoras, 0 regresiones.

| Ancho | Ruta | Desbordamiento (px) | Controles <44 px | Cabecera (px) | Tablas con scroll horizontal | Textos <12 px | Altura de página (px) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 360 | `/monitoring/monitor-patient` | 0 | 10/12 | 65 | 1 | 22 | 9419 → 9469 (+50) |
| 360 | `/patients` | 0 | 6/9 → 3/9 (−3) ✅ | 65 | 1 → 0 (−1) ✅ | 0 | 800 |
| 360 | `/devices` | 0 | 9/12 → 3/12 (−6) ✅ | 65 | 1 → 0 (−1) ✅ | 0 | 800 → 1244 (+444) |
| 360 | `/assignments` | 0 | 8/10 → 7/10 (−1) ✅ | 65 | 1 → 0 (−1) ✅ | 0 | 1035 → 1227 (+192) |
| 360 | `/sessions` | 0 | 7/11 → 6/11 (−1) ✅ | 65 | 1 → 0 (−1) ✅ | 0 | 969 → 1347 (+378) |
| 360 | `/admin/users` | 0 | 7/10 → 3/10 (−4) ✅ | 65 | 1 → 0 (−1) ✅ | 0 | 800 → 944 (+144) |
| 360 | `/admin/audit` | 0 | 5/7 | 65 | 1 → 0 (−1) ✅ | 5 | 1111 → 1691 (+580) |

✅ menos es mejor · ⚠️ empeora. La altura de página depende de los datos y no cuenta como regresión.
