# PulsoLink — Skills para el agente local y el equipo

**Investigación y selección:** 16 de octubre de 2026.  
**Repositorio de destino:** https://github.com/codsebas/PulsoLink  
**Ruta local:** `C:\Users\sebas\UMG\Octavo Ciclo\Desarrollo Web\Proyecto-Final`  
**Guardar este documento como:** `docs/skills/README.md`. **No reemplazar el README principal.**

## 1. Decisión

Instalar **siete skills de alcance de proyecto**, compartidas mediante Git: cuatro de Firebase, dos de Vercel y una de Microsoft. Añadir dos opcionales solo cuando su tarea exista.

Esta selección prioriza autoría del proveedor, correspondencia con nuestro stack, instrucciones inspeccionables, dependencias disponibles y utilidad para la entrega del 17 de octubre. No es un ranking universal ni una garantía de calidad del código generado.

**Estado:** se verificaron las fuentes y los nombres internos de las siete skills en revisiones concretas. Este documento no significa que ya estén instaladas en la computadora del usuario. Los comandos PowerShell no se ejecutaron allí; el agente local debe ejecutarlos y comprobar el resultado.

Las skills aportan instrucciones; no instalan automáticamente toda la aplicación ni conceden permisos de GitHub, Firebase o Windows.

## 2. Arquitectura que deben respetar

- React + TypeScript + Vite; Tailwind CSS, React Router, TanStack Query y Recharts.
- Node.js 24 LTS + Express 5 + TypeScript + Zod.
- **Cloud Firestore Standard** y Firebase Authentication.
- Firebase Admin SDK exclusivamente en el backend.
- Datos de aplicación y flujos de acceso mediante nuestra API.
- Contrato A: dispositivo/simulador ↔ backend.
- Contrato B: frontend ↔ backend.
- Cookies de sesión HttpOnly, protección CSRF y autorización en el backend, según el README principal.
- Sin PostgreSQL, Prisma, Next.js ni acceso directo a Firestore desde la web en esta versión.
- Firmware y coordinación del dispositivo a cargo de `@codsebas`; simulador a cargo de `@HugoX2024`.

Si una skill recomienda una tecnología o configuración distinta por defecto, conservar las decisiones explícitas del proyecto. No alterar sus instrucciones de seguridad ni eludir permisos; documentar cualquier incompatibilidad real.

## 3. Skills seleccionadas

Los nombres de esta tabla son los valores `name` comprobados en cada `SKILL.md`; no siempre coinciden con el nombre de la carpeta.

| Prioridad | Skill | Fuente | Uso concreto en PulsoLink |
| --- | --- | --- | --- |
| Inicialización | `firebase-basics` | Firebase / Google | Preparar CLI, identificar cuenta y proyecto Firebase. Cargar durante configuración, no en cada tarea. |
| Backend | `firebase-firestore` | Firebase / Google | Modelo de documentos, consultas, índices y operaciones de Firestore. Trabajar expresamente con Standard y acceso de servidor. |
| Acceso | `firebase-auth-basics` | Firebase / Google | Firebase Authentication. Adaptar el flujo a la API y cookies ya acordadas. |
| Reglas | `firestore-rules-creation` | Firebase / Google | Crear las reglas de Firestore. En nuestro diseño, negar acceso directo de clientes y verificarlo. |
| Frontend | `vercel-react-best-practices` | Vercel | Revisar componentes, consultas, renderizados y tamaño del frontend. Aplicar solo recomendaciones pertinentes a React/Vite. |
| Interfaz | `web-design-guidelines` | Vercel | Revisar accesibilidad, formularios, navegación y estados de la interfaz. |
| Integración | `playwright-cli` | Microsoft | Recorrer la web en navegador, comprobar flujos y obtener evidencia de fallos y resultados. |

### Consideraciones detectadas al revisar las fuentes

**Firebase:** parte de la documentación consultada todavía menciona `firebase-firestore-standard`. La revisión del repositorio fijada aquí contiene **`firebase-firestore`**, que distingue ediciones. Su flujo propone Enterprise cuando no hay una base existente: **PulsoLink ya decidió Standard**. Declarar esa elección antes de aprovisionar y comprobar la edición resultante.

**Autenticación:** la skill de Auth incluye Google Sign-In y ejemplos de SDK cliente. Para este avance se mantiene correo/contraseña con la integración del backend definida en el contrato B.

**Reglas:** la skill de Firestore deriva la autoría de reglas a `firestore-rules-creation` o a un subagente especializado cuando está disponible. Por eso se incluye esa dependencia. No es obligatorio configurar un sistema de múltiples agentes para utilizarla.

**React:** la carpeta de Vercel se llama `react-best-practices`, pero la skill se invoca como `vercel-react-best-practices`. No copiar recetas de Next.js, React Server Components o `next/dynamic` a una SPA con Vite.

**Diseño:** `web-design-guidelines` es una skill de revisión, no un generador completo de diseño visual. Consulta una guía externa actualizada; fijar la skill no inmoviliza esa guía. Registrar fecha o revisión de la guía usada si una auditoría necesita reproducibilidad.

**Playwright:** elegimos la skill de Microsoft con su CLI. No equivale a instalar el ejecutable ni a tener configurados tests automatizados de CI.

## 4. Revisiones verificadas y rutas de origen

| Fuente | Commit fijado |
| --- | --- |
| `firebase/agent-skills` | `306cc1844c47839bd4f2c7dba7cc3c394e4f3e0b` |
| `vercel-labs/agent-skills` | `063bee94c3f4df8453406c830b0a7df0f2860278` |
| `microsoft/playwright-cli` | `b85c7a736bb473bf55b584e54a09ffa698d6d871` |

| Skill | Ruta dentro de su repositorio |
| --- | --- |
| `firebase-basics` | `skills/firebase-basics/` |
| `firebase-firestore` | `skills/firebase-firestore/` |
| `firebase-auth-basics` | `skills/firebase-auth-basics/` |
| `firestore-rules-creation` | `skills/firestore-rules-creation/` |
| `vercel-react-best-practices` | `skills/react-best-practices/` |
| `web-design-guidelines` | `skills/web-design-guidelines/` |
| `playwright-cli` | `skills/playwright-cli/` |

Instalador propuesto: **`skills@1.7.2`**, versión consultada en npm al preparar esta guía. Usamos copias locales, sin instalación global, para que un clon del repositorio contenga las instrucciones del equipo.

Las revisiones fijan el contenido de las skills, no las versiones de Firebase CLI, Playwright u otras herramientas que puedan ejecutar o consultar. Esas versiones deben registrarse aparte.

## 5. Instrucciones para el agente local

### 5.1 Revisar el repositorio antes de instalar

Ejecutar desde PowerShell:

```powershell
Set-Location "C:\Users\sebas\UMG\Octavo Ciclo\Desarrollo Web\Proyecto-Final"
git rev-parse --show-toplevel
git remote -v
git status --short
node --version
npm --version
codex --version
```

Confirmar que el remoto corresponde a `codsebas/PulsoLink` y leer el README y los archivos `AGENTS.md` existentes. Preservar cambios ajenos. Si las rutas de destino ya contienen skills, revisar las diferencias antes de reemplazarlas.

Si el repositorio aún no tiene commits, completar primero el commit documental acordado con el README principal actualizado que incluye a Hugo. Después, integrar las skills en una rama separada, por ejemplo `chore/project-agent-skills`. No crear issues ni cambiar las asignaciones de compañeros como parte de esta tarea.

### 5.2 Instalar las siete skills en el proyecto

Después de revisar los orígenes, ejecutar **un comando por vez**. Comprobar `$LASTEXITCODE` después de cada comando nativo y detener la instalación si falla; PowerShell no siempre detiene comandos nativos por sí solo.

```powershell
npx --yes skills@1.7.2 add "https://github.com/firebase/agent-skills/tree/306cc1844c47839bd4f2c7dba7cc3c394e4f3e0b/skills" --agent codex --skill firebase-basics firebase-firestore firebase-auth-basics firestore-rules-creation --copy --yes
```

```powershell
npx --yes skills@1.7.2 add "https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills" --agent codex --skill vercel-react-best-practices web-design-guidelines --copy --yes
```

```powershell
npx --yes skills@1.7.2 add "https://github.com/microsoft/playwright-cli/tree/b85c7a736bb473bf55b584e54a09ffa698d6d871/skills/playwright-cli" --agent codex --skill playwright-cli --copy --yes
```

La CLI documenta selección por nombre, agente, URL de subcarpeta y modo de copia. El resultado debe verificarse en esta computadora; no se ha probado esta secuencia en Windows desde esta conversación.

**No usar `--global`, `--all` ni un comodín de skills.** La selección es deliberada.

Si el instalador no resuelve una URL fijada:

1. Clonar el repositorio de origen en una carpeta temporal fuera de PulsoLink.
2. Hacer checkout del SHA exacto de la tabla y comprobar `git rev-parse HEAD`.
3. Instalar desde la ruta local de `skills` con los mismos nombres y opciones, o copiar las carpetas seleccionadas completas a `.agents/skills/`.
4. Conservar `references/`, `scripts/`, `assets/` y los metadatos que acompañen a cada skill.
5. No copiar el `.git` del origen dentro de PulsoLink.
6. No sustituir silenciosamente el SHA por `main` o por un fork.

Este método alternativo resuelve instalación de archivos públicos; no sirve para eludir un rechazo de acceso o de aprobación.

### 5.3 Conservar licencias y procedencia

Revisar las licencias de las revisiones descargadas. Conservar los avisos incluidos en cada skill y los archivos LICENSE/NOTICE aplicables del repositorio de origen, por ejemplo bajo `docs/skills/licenses/`.

Crear `docs/skills/sources.json` con, por cada skill:

- Nombre interno.
- Repositorio y URL.
- SHA del origen.
- Subcarpeta de origen.
- Ruta instalada.
- Fecha de instalación.
- Licencia y archivos de aviso conservados.
- Versión del instalador y, si es posible, hash de los archivos copiados.

Si el instalador genera `skills-lock.json`, revisarlo y versionarlo. No inventar un formato de lock para hacerlo parecer generado por la herramienta. Los archivos completos y el registro de SHAs permiten revisar la selección aunque una reinstalación automática no esté disponible.

### 5.4 Verificar que el agente descubre las skills

```powershell
npx --yes skills@1.7.2 list --agent codex
Get-ChildItem ".agents\skills" -Recurse -Filter SKILL.md
git status --short
git diff --check
```

Comprobar los siete nombres internos, la existencia de sus referencias y que no hay enlaces hacia carpetas personales de otro integrante. Codex descubre skills del repositorio desde `.agents/skills`; comprobar la lista con `/skills` o la selección mediante `$`. Si no aparecen, abrir una nueva sesión del agente.

Otros agentes pueden requerir una configuración distinta. Las carpetas usan el formato Agent Skills, pero no se debe afirmar que cualquier editor las cargará sin comprobarlo.

## 6. Herramientas adicionales: no confundirlas con skills

| Herramienta | Necesidad |
| --- | --- |
| Git | Versionar y compartir las skills |
| Node.js/npm | Backend, frontend e instalador |
| Firebase CLI | Configuración, índices, reglas y emuladores |
| Firebase Admin SDK | Dependencia del backend, no de la skill |
| Playwright CLI | Ejecutar la skill de navegador |
| Playwright Test | Solo si se añaden pruebas E2E reproducibles a CI |
| GitHub CLI | Opcional para PR y comprobaciones; no es necesaria para un `git push` normal |
| Firebase MCP | Opcional; una skill no concede acceso a proyectos Firebase |

Para Playwright, la documentación de Microsoft publica el paquete `@playwright/cli`. El agente debe elegir una versión compatible, registrarla y comprobar `playwright-cli --help`. Si se instala como dependencia de desarrollo, ejecutarla mediante un script npm o el ejecutor local; no asumir que el binario está disponible globalmente. Instalar el navegador requerido cuando corresponda.

No ejecutar un segundo instalador de skills de Playwright si ya se copió la selección anterior. No añadir al repositorio perfiles de navegador, cookies, sesiones, trazas con secretos ni credenciales de prueba reales.

Para tests E2E de CI se puede agregar `@playwright/test` en una tarea posterior. La exploración realizada por la skill no reemplaza una prueba versionada.

## 7. Asignación de uso por integrante

| Integrante | Skills pertinentes | Resultado esperado |
| --- | --- | --- |
| `@AxelHerrera11` | React + diseño | Layout y componentes consistentes, navegación y accesibilidad |
| `@DidhyerOrtiz` / `@DidhyerOrtizG` | Firestore; Auth al integrar permisos | API conforme a contratos, sin acceso a datos desde controladores |
| `@gioore` | Firebase basics, Firestore y creación de reglas | Modelo, índices, transacciones y configuración Standard |
| `@Mar-03` | Auth; React para login | Identidad, cookies, CSRF y roles conforme al contrato B |
| `@Javifa2324` | React + diseño | Dashboard y gráficas con calidad y antigüedad de datos visibles |
| `@Lis671` | React + diseño | Sesiones e historial paginado |
| `@HugoX2024` | Contrato A y reglas del proyecto; Playwright solo al verificar interfaz | Simulador que usa la API, sin credenciales administrativas Firebase |
| `@orem6` | Playwright + diseño; auditor de reglas opcional | Recorrido integrado y evidencia verificable |
| `@codsebas` | Contrato A y documentación de la placa | Dispositivo real y coordinación de integración |

No cargar todas las skills para cada tarea. Las de Firebase basics y reglas solo se necesitan cuando se trabaja en esas áreas.

## 8. Guía de repositorio que acompaña a las skills

Crear o actualizar **`AGENTS.md` en la raíz**, integrándolo con las instrucciones existentes. Es una guía común del proyecto, no una octava skill externa.

Incluir estas reglas específicas:

- Leer el README y el contrato correspondiente antes de cambiar endpoints.
- Mantener Firebase Firestore Standard, API Express y React/Vite.
- Cargar las skills pertinentes a la tarea y leer sus archivos de referencia cuando se requieran.
- Respetar la autoridad de las instrucciones del usuario y las restricciones de acceso del entorno.
- No sustituir las decisiones de arquitectura por los valores predeterminados de una skill.
- Usar Firebase Auth por el flujo del backend acordado; no introducir login directo del cliente sin revisar el contrato.
- Denegar acceso directo de clientes a Firestore. Admin SDK no aplica las Security Rules: validar roles, propiedad y estado de sesión en la API.
- Preservar idempotencia por dispositivo, bootId y sequence; no duplicar mediciones al reintentar.
- Distinguir datos simulados, válidos, sin contacto, ausentes y desactualizados.
- No presentar temperatura superficial como temperatura central ni tendencias como ECG.
- Separar la frecuencia de adquisición del sensor del intervalo de envío.
- Trabajar en ramas por tarea y no incorporar cambios ajenos al commit.
- Mantener secretos fuera de Git; no imprimir credenciales al verificar herramientas.
- Usar PowerShell con rutas entre comillas; no pegar comandos Bash como si fueran equivalentes.
- Verificar cambios con pruebas pertinentes; no desactivar permisos o validaciones para lograr que la demo pase.
- No afirmar que una prueba, despliegue o publicación se completó sin evidencia.
- Las tareas sobre Firebase en la nube necesitan un proyecto inequívoco y acceso válido. Instalar skills no autoriza crear infraestructura, activar costes o desplegar.

No hace falta una skill externa genérica para “Git”, “Express” o “OpenAPI” si las reglas específicas y los contratos resuelven la tarea. Esta investigación no seleccionó una skill de esos temas con mejor ajuste que la documentación oficial y la guía del repositorio; no implica que no existan alternativas.

## 9. Opcionales y descartes

| Candidata | Decisión |
| --- | --- |
| `firebase-security-rules-auditor`, Firebase | Opcional para revisar reglas una vez escritas. No sustituye revisión de autorización del backend. |
| `firebase-hosting-basics`, Firebase | Opcional si se elige Firebase Hosting. Preservar el diseño de origen común y API; no asumir que alojar una SPA despliega Express. |
| `security-best-practices`, catálogo antiguo de OpenAI | No instalar como base nueva: el README actual de `openai/skills` marca ese catálogo como obsoleto y remite a `openai/plugins`. |
| Codex Security y otros plugins completos | Evaluar después si hay una tarea concreta y sus herramientas están disponibles; copiar solo una skill puede dejar dependencias sin resolver. |
| Skills de PostgreSQL, Prisma, SQL Connect o Next.js | No corresponden al stack decidido. |
| Skills de IA, presión arterial o despliegue automático | Fuera del avance actual. |
| Skills genéricas de ESP32/Raspberry | Posponer hasta confirmar la placa; no trasladar instrucciones de hardware entre plataformas. |
| Paquetes masivos de cientos de skills | No necesarios para esta entrega; dificultan revisar procedencia y solapamientos. |

No instalar un plugin completo y también las mismas skills sueltas sin revisar duplicados. Las skills no deben cambiar de versión automáticamente entre integrantes durante la entrega: las actualizaciones se revisan en un PR común.

## 10. Comprobación de aceptación

La instalación se considera terminada cuando el agente local entrega:

- [ ] Este documento en `docs/skills/README.md`, sin reemplazar el README del proyecto.
- [ ] Siete carpetas de skills completas y detectables por Codex.
- [ ] Procedencia y licencias conservadas.
- [ ] Registro de revisiones y herramientas utilizadas.
- [ ] `AGENTS.md` integrado con las decisiones de PulsoLink.
- [ ] Confirmación de que no se incorporaron secretos ni enlaces a rutas personales.
- [ ] Prueba breve de descubrimiento: pedir al agente que enumere las skills y diga cuáles aplicaría a login, Firestore y dashboard.
- [ ] Revisión del diff y un commit que contenga solo estos cambios.
- [ ] Publicación en la rama acordada si está autorizada y el acceso Git funciona.
- [ ] Resumen de lo instalado, lo pendiente y las pruebas realmente ejecutadas.

Comprobar el descubrimiento no exige crear una base de datos ni desplegar la aplicación. Las pruebas funcionales se ejecutan cuando exista código: login, permisos entre operadores, recepción del simulador, reintentos, pérdida de señal y persistencia.

## 11. Encargo listo para entregar al agente local

> Integra esta selección en PulsoLink desde la ruta local indicada. Lee primero el README actual y cualquier AGENTS.md. Conserva cambios existentes y la asignación de HugoX2024 al simulador. Instala únicamente las siete skills seleccionadas, con las revisiones fijadas y alcance de repositorio; conserva sus recursos y licencias. Guarda esta guía en docs/skills/README.md y documenta procedencia y versiones. Actualiza AGENTS.md para mantener Firestore Standard, React/Vite, Express y los dos contratos de API. Comprueba que Codex descubre las skills y que no hay secretos ni dependencias rotas. No implementes funciones de la aplicación, abras issues ni despliegues infraestructura como parte de esta tarea. Prepara un commit separado; realiza push solo conforme a la autorización de esta sesión y a los permisos disponibles. Reporta evidencia concreta y cualquier bloqueo.

## 12. Fuentes verificadas

Consultadas el 16 de octubre de 2026. Para los nombres e instalación fijada prevalecen los archivos de las revisiones inspeccionadas frente a un índice web desactualizado.

1. [OpenAI: descubrimiento y estructura de skills](https://learn.chatgpt.com/docs/build-skills)
2. [Firebase: documentación de agent skills](https://firebase.google.com/docs/ai-assistance/agent-skills)
3. [Firebase: repositorio fijado](https://github.com/firebase/agent-skills/tree/306cc1844c47839bd4f2c7dba7cc3c394e4f3e0b)
4. [Firebase: skill Firestore inspeccionada](https://github.com/firebase/agent-skills/blob/306cc1844c47839bd4f2c7dba7cc3c394e4f3e0b/skills/firebase-firestore/SKILL.md)
5. [Vercel: colección oficial fijada](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278)
6. [Vercel: CLI de instalación y sus opciones](https://github.com/vercel-labs/skills)
7. [Microsoft: Playwright CLI y requisitos](https://github.com/microsoft/playwright-cli)
8. [Microsoft: skill fijada](https://github.com/microsoft/playwright-cli/blob/b85c7a736bb473bf55b584e54a09ffa698d6d871/skills/playwright-cli/SKILL.md)
9. [OpenAI: aviso de obsolescencia del catálogo anterior](https://github.com/openai/skills)
10. [OpenAI: catálogo actual de plugins](https://github.com/openai/plugins)

**Límite de verificación:** se inspeccionaron archivos fuente, nombres y revisiones; no se realizó una evaluación comparativa de rendimiento de agentes ni se ejecutó la instalación en Windows. “Seleccionadas” significa adecuadas a nuestro alcance, no probadas exhaustivamente en todos los entornos.

