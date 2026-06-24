# DentFlowAi

Plataforma clínica-laboratorio dental: dentistas crean casos con modelos 3D, el algoritmo Fauchard selecciona técnicos, los técnicos entregan diseños y/o fabricaciones.

## Claude Code y Cursor

- Este archivo es la **guía canónica del monorepo** para **Claude Code** y **Cursor** (una sola fuente de verdad).
- **Claude Code:** partir siempre de este `CLAUDE.md` en la raíz del repo. Si el trabajo es bajo `frontend/`, complementar con los `CLAUDE.md` por carpeta: [frontend/CLAUDE.md](frontend/CLAUDE.md), [frontend/app/CLAUDE.md](frontend/app/CLAUDE.md), [frontend/components/CLAUDE.md](frontend/components/CLAUDE.md), [frontend/lib/db/CLAUDE.md](frontend/lib/db/CLAUDE.md) (contexto local; no reemplazan el stack ni las restricciones globales de la raíz).
- **Cursor:** en *Settings → Rules → Project rules*, incluir al menos [CLAUDE.md](CLAUDE.md) y, si usas la convención del repo, [AGENTS.md](AGENTS.md) en la raíz (puente corto). Convenciones Next del proyecto: [frontend/AGENTS.md](frontend/AGENTS.md). Trabajo intensivo en UCH: skill del proyecto `@uch-reglas-diseno-dentflowai` (cuerpo alineado con la sección **UCH — Reglas de Diseño DentFlowAi** más abajo).
- **Orden de lectura recomendado:** `CLAUDE.md` (raíz) → `AGENTS.md` (raíz) → `frontend/AGENTS.md` → `frontend/CLAUDE.md` → el `CLAUDE.md` del subdirectorio en el que edites.

### Flujo de trabajo con planes (Plan Mode)
Cuando el usuario aprueba un plan vía `ExitPlanMode`, **no implementar automáticamente**. Esperar confirmación explícita del usuario ("sí, adelante", "procede", etc.) antes de ejecutar cualquier cambio. La aprobación del plan no es autorización para implementar. Esto aplica especialmente en cambios sobre la rama `v2`: **nunca** proponer ni ejecutar merge `v2 → main` como parte de una implementación — ese paso requiere validación completa en staging y decisión explícita del dueño del proyecto.

### Acciones destructivas o visibles externamente
Antes de ejecutar cualquier acción que afecte sistemas compartidos o sea difícil de revertir, pedir confirmación explícita aunque el contexto parezca obvio:
- **Deploy** — no ejecutar `deploy.sh`, `deploy_gui.py` ni comandos `gcloud` sin instrucción directa.
- **Push / PR** — no hacer `git push` ni crear pull requests por iniciativa propia.
- **Commits** — no hacer commit sin que el usuario lo pida explícitamente.
- **Operaciones destructivas** — `git reset --hard`, borrar ramas, truncar tablas, etc. requieren confirmación independientemente del contexto.

### Alcance de los comandos de validación
No ejecutar `npm run validate:full` (lint + type-check + build) salvo que se pida explícitamente — es costoso y bloquea el flujo. Para verificar un cambio puntual usar solo lo necesario:
- Cambio de tipos → `npm run type-check`
- Cambio de estilo/linting → `npm run lint`
- Test de una feature → `npm run test:run`
- Pre-deploy o validación completa → `npm run validate:full` (solo si se pide)

## Stack
- Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS 4
- Drizzle ORM + PostgreSQL (Cloud SQL) · NextAuth 5 beta
- Google Cloud Storage (archivos STL/imágenes) · Three.js (visor 3D)
- Vitest + Testing Library · framer-motion · lucide-react · recharts (gráficos del dashboard de observabilidad admin, v5.0)
- Node ≥ 20.19 · npm ≥ 10 (`frontend/package.json` → `engines`)

## Estructura
```
frontend/              Aplicación Next.js (único deploy, output: standalone)
  app/                 Rutas App Router (auth, dashboard, api/cron, api/auth)
  components/          Componentes React (cases/, cases/uch/, admin/, ui/, …)
  lib/db/              Drizzle ORM, schema, infrastructure (migraciones runtime)
    actions/           Server Actions (única capa de mutación/lectura DB)
    actions/catalogs.ts  Catálogos UI: vita_shade, restoration_type, dental_material, urgency_level
  app/dashboard/admin/catalogos/  CRUD admin de catálogos UI
  lib/services/        GCP Storage, notificaciones (EmailJS, API REST server-side; reemplazó a Resend)
  lib/constants/       dental.ts, caseEvents.ts, uchAuditMatrix.ts, addressData.ts, …
  lib/cases/           Presentación ficha, filtros listado, acciones ficha
  lib/dashboard/       KPIs, métricas, clasificación dashboard
  lib/                 uchThreadLane, uchPresentation, uchCasoPublicadoSplit,
                       uchEventVisibility, uchUnread, caseEventsUchFilter,
                       deadlineMs, hooks/useRemainingUntil, …
  context/             AuthContext (+ impersonación admin), ToastContext
  test/                Vitest + Testing Library
  scripts/             seed-uat.ts (datos UAT locales)
scripts/               CLI Python legacy (toolkit.py — sync claims Firebase/admin)
.cursor/skills/        uch-reglas-diseno-dentflowai (skill UCH para Cursor)
```

## Roles del sistema
- `dentista` — crea casos, ve precio/plazo de catálogo, aprueba diseños
- `tecnico` — recibe **asignaciones**, acepta o rechaza, entrega diseños
- `admin` — panel Fauchard, impersonación, métricas

## Tipos de servicio (`clinicalCase.serviceType`)

> **Producto activo (v2):** el wizard y los casos nuevos usan solo `solo_diseno` con **asignación directa** (`runAssignmentAction`, score Q/P/E/B/L/N). Los tipos `integral`/`solo_fabricacion` y el flujo de cotización/comparativo quedan como **legacy** en schema y UCH.

Definidos en `frontend/lib/constants/dental.ts → SERVICE_TYPES`:
- `solo_diseno` — el dentista sube scans. Flujo v2: **Borrador → En evaluación (asignación) → Esperando inicio → En ejecución → En revisión → Completado**.
- `solo_fabricacion` — el dentista sube **un único archivo de diseño** (STL/PLY/OBJ). El laboratorio solo fabrica. Flujo: **Borrador → En evaluación → Propuesta lista → Esperando inicio → En fabricación → Enviado → Completado** (sin pasos de diseño/revisión).
- `integral` — el laboratorio diseña y fabrica. Flujo completo: solo diseño + En fabricación → Enviado → Completado.
- `needsFabrication` (boolean) se mantiene en BD por compatibilidad: `true` para `integral` y `solo_fabricacion`, `false` para `solo_diseno`.

## Flujo de estados del caso (stepper)

**v2 activo (`solo_diseno`):**
```
BORRADOR → EN EVALUACIÓN → ESPERANDO INICIO → EN EJECUCIÓN → EN REVISIÓN → COMPLETADO
[terminal negativo] → RECHAZADO | CERRADO
```
Durante `enEvaluacion`, `internalStatus` puede ser `asignacionPendiente` (técnico debe aceptar) o `pendiente_pool` (sin elegibles).

**Legacy (`integral` / `solo_fabricacion` — solo casos históricos en BD):**
```
BORRADOR → EN EVALUACIÓN → PROPUESTA LISTA → ESPERANDO INICIO → … → COMPLETADO
```
- El componente `CaseWorkflowStepper.tsx` recibe `serviceType` y:
  - Agrega los pasos de fabricación cuando `isIntegral || isSoloFab`.
  - Para `solo_fabricacion` salta `enEjecucion`, `enRevision`, `disenoAprobado`.
  - Cuando un caso integral o `solo_fabricacion` termina en `rechazado` / `cerrado`, los pasos posteriores no cumplidos se pintan en rosa (no en gris).
- Modo `techRejected` (técnico no ganador): banda rosa de Propuesta lista → Diseño aprobado; los pasos posteriores quedan grises.
- El estado `cambiosEnProceso` (internamente entre enRevision y enEjecucion) existe en DB pero no aparece como step propio en el stepper público.

## Cierre del caso por tipo
- `solo_diseno`: tras `approveWorkAction` el caso transiciona directo a `completado` con `completedAt` poblado (la fila de control de responsabilidad se libera).
- `integral` con CAM: tras `approveWorkAction` va a `enFabricacion` y luego sigue su flujo físico.
- `integral` sin CAM (legacy): aún cierra como `disenoAprobado`.
- `solo_fabricacion`: tras `startWorkAction` el caso entra directo a `enFabricacion`; la entrega del despacho cierra el flujo.

## Precio y plazo (v2 — asignación directa)

- Al publicar, el caso queda anclado a una **regla de precio** (`listPriceCost`, `listPriceSale`, `listPriceFeePercent`) resuelta desde catálogos UI.
- El técnico asignado ve **compensación y plazo** fijos en la asignación (`case_assignment.compensation`, `deadlineDays` derivado de `desiredDeliveryAt`).
- No hay ronda de cotización ni comparativo de ofertas en flujos nuevos.

### Legacy — oferta cotizada (`submitQuoteAction`)
- `solo_diseno` y `solo_fabricacion` → un único precio y plazo (`kind: 'flat'`).
- `integral` → desglose obligatorio diseño + fabricación (`kind: 'split'`). Total = suma de ambos.
- `submitQuoteAction` valida coherencia `serviceType` ⇄ `kind`; persiste totales en `quotedPrice`/`quotedDays` y el desglose en `quotedDesignPrice/Days` + `quotedFabricationPrice/Days`.

## Entorno local (Docker)

Entorno aislado para desarrollo sin tocar staging/prod ([docker-compose.yml](docker-compose.yml)):
- `db` — PostgreSQL 16 (puerto 5432, BD `dentflowai_local`).
- `storage` — `fsouza/fake-gcs-server` (puerto 4443) emula GCS. El proxy [frontend/app/api/local-gcs-proxy/route.ts](frontend/app/api/local-gcs-proxy/route.ts) intermedia descargas (descomprime gzip — fake-gcs no hace decompressive transcoding).
- `frontend/lib/gcs.ts` detecta `GCS_API_ENDPOINT` y firma URLs hacia el proxy local.
- Levantar: `docker compose up -d` + `.env.local` apuntando a `localhost`.

## Sistema de tema (claro/oscuro/sistema)

- Provider: [frontend/components/theme/ThemeProvider.tsx](frontend/components/theme/ThemeProvider.tsx) + [ThemeContext.ts](frontend/components/theme/ThemeContext.ts).
- Toggle: [ThemeToggleButton.tsx](frontend/components/theme/ThemeToggleButton.tsx).
- Tokens y variables CSS en [frontend/app/theme.css](frontend/app/theme.css); Tailwind 4 los consume.

## ContactGuard

Moderación de campos libres (notas, trackingId) — bloquea intentos de saltarse el marketplace (URLs, teléfonos, dominios). Reglas administrables en `/dashboard/admin/contactguard`. Código: [frontend/lib/contactGuard/](frontend/lib/contactGuard/) (`guardOrFail`, `normalize`, `cache`, `phonePatterns`). Allowlist de dominios de courier disponible para `trackingId`.

**Detección de teléfonos por país (country-aware).** Los teléfonos **no** se detectan con la regla DB genérica "8+ dígitos" (causaba falsos positivos: tracking, fechas, precios); se detectan en código con los formatos móviles de los **países involucrados** en el caso (`lib/contactGuard/phonePatterns.ts` → `PHONE_PATTERNS_BY_COUNTRY` para los 9 de `SUPPORTED_COUNTRIES` + patrón internacional `+CC`). `guardOrFail.ts → resolveInvolvedCountryCodes` resuelve la unión de países de dentista + técnico + actor (desde `user.country`); si ninguno tiene país declarado, usa **todos los soportados** (máxima protección). Las reglas DB `telefono_*` quedan inertes (el motor las ignora) y el reseed las elimina.

**Reglas de números/URL adicionales:**
- Los números que viven **dentro de una URL/dominio** (incluyendo dominios sin esquema con su path, p. ej. `correos.cl/track/123`, y acortadores como `bit.ly/…` / `t.co/…`) no se marcan como teléfono — exención de spans aplicada a **todos** los campos (`findProtectedSpans` en `index.ts`).
- El campo `dispatchTracking` está **exento** de la detección numérica/telefónica (`NUMERIC_EXEMPT_FIELDS`): su contenido legítimo es un código largo. URL externa / email / handle siguen aplicando ahí.
- Las violaciones de `dominio_explicito` contenidas en una `url_http` se deduplican (se reporta la URL una sola vez).

## Plazos de entrega — `desiredDeliveryAt`

`workDeadline` = `desiredDeliveryAt` fijado por el dentista al publicar. El reloj del caso arranca en **publicación**; el técnico asignado debe cumplir dentro de esa fecha/hora. Sin calendario laboral administrable.

- Helpers: [frontend/lib/cases/workDeadline.ts](frontend/lib/cases/workDeadline.ts) (`resolveWorkDeadline`, `computeProposedDeliveryDays`, `isCompletedOnTime`).
- `startWorkAction` y puntualidad del score (P) usan ventana `publishedAt` → `desiredDeliveryAt`.
- Columnas `business_*` en `fauchard_config` y tabla `fauchard_holiday` permanecen en BD (inertes). `lib/businessTime.ts` es legacy (solo tests).

Configurador Fauchard admin: **3 espacios** — Parámetros · Categorías · Historial (`TabClient`).

## Matriz de browsers soportados (ajuste login, Fase 6)

Matriz oficial mínima para validar el flujo de auth (login Credentials, login Google, logout, registro + verificación de email) — checklist manual, sin Playwright en este repo (ver `Doc/202605022_Plan Ajuste Login.md` para el detalle de fases y el seguimiento del checklist):

| Browser | Versión mínima |
|---|---|
| Chrome | 109+ |
| Firefox | 115+ |
| Safari | 16.4+ |
| Edge | 109+ |

## Comandos
```bash
cd frontend && npm run dev              # desarrollo (Turbopack, puerto 3000)
cd frontend && npm run build            # producción (standalone)
cd frontend && npm run type-check       # tsc --noEmit
cd frontend && npm run test             # vitest (watch)
cd frontend && npm run test:run         # vitest una pasada
cd frontend && npm run test:smoke         # smoke tests páginas clave
cd frontend && npm run lint               # eslint
cd frontend && npm run validate:full      # lint + type-check + build
npx tsx frontend/scripts/seed-uat.ts      # seed UAT local (.env.local)
cd frontend && python3 deploy_gui.py      # GUI gráfica de deploy (Tkinter, sin dependencias externas)
```

## GUI de Deploy (`frontend/deploy_gui.py`)

Interfaz gráfica Python/Tkinter que reimplementa `deploy.sh` sin dependencias externas. Permite desplegar a local/dev/prod con control visual de variables por entorno (incluido `NOTIFICATIONS_LIVE`). Uso: `cd frontend && python3 deploy_gui.py`.

**Política de ramas (dual-track):**
- **STAGING (GCP dev):** desde `develop` (línea v1) o `v2` (cambio estructural)
- **PRODUCTION (GCP prod):** solo desde `main` tras merge; **bloquea** `develop`/`v2`
- **Rollback:** `v1` o tag `v1.0-produccion` en PRODUCTION con advertencia fuerte
- Muestra rama, commit y working tree dirty antes de cada deploy

Ver [Doc/Estrategia_Versionado.md](Doc/Estrategia_Versionado.md) y [Doc/Ciclo_Desarrollo.md](Doc/Ciclo_Desarrollo.md).

**GOTCHA:** `deploy.sh` no recorta comentarios inline de `.env.local`; la GUI sí los recorta al leer, y escribe sin comentario inline al guardar (evita romper comparaciones `=== 'true'`).

## Sistema de preview de emails (DEMO local)

Para facilitar demos del flujo sin enviar correos reales. Gated por `NEXT_PUBLIC_DEMO_EMAIL_PREVIEW=true` (default off):
- **`lib/services/emailPreviewBuffer.ts`** — ring buffer en memoria (hasta 50 entradas, proceso único). `pushEmailPreview()` es llamado por `notifyUser` cuando el flag está activo y `NOTIFICATIONS_LIVE` no lo es.
- **`app/api/demo/email-preview/route.ts`** — `GET` con `?since=<timestamp>`; devuelve lista vacía si el flag está off.
- **`components/demo/DemoEmailPreviewListener.tsx`** — polling cada 2s desde `dashboard/layout.tsx`. Muestra un modal "este correo se enviaría" con el asunto, cuerpo y tipo del correo. Solo se monta si el flag está on.

## Flujo Git y Deploy

- **Versionado mayor:** línea v1 (`develop`→`main`) y línea v2 (`v2`→`main`) en paralelo; respaldo `v1` + tag `v1.0-produccion`. Ver [Doc/Estrategia_Versionado.md](Doc/Estrategia_Versionado.md).
- **GCP dev:** deploy desde `develop` (v1) o `v2` vía pestaña STAGING en `deploy_gui.py`.
- **GCP prod:** deploy solo desde `main` vía pestaña PRODUCTION (GUI bloquea `develop`/`v2`).
- Deploy alternativo: `cd frontend && bash deploy.sh [develop|production]` — o usar la GUI (`deploy_gui.py`).
- **Staging**: Cloud Run `dentflowai-frontend-dev` + Cloud SQL `dentflowai-psql-dev` (BD aislada de prod).
- **Producción**: Cloud Run `dentflowai-frontend` + Cloud SQL `dentflowai-cbcf2-instance`.
- Variables por entorno (`DATABASE_URL_DEV`/`_PROD`, `AUTH_URL_DEV`/`_PROD`, `NEXT_PUBLIC_APP_URL_DEV`/`_PROD`) viven en `frontend/.env.local` y se inyectan en Cloud Run por `deploy.sh`.
- Crear BD staging (one-time): `export DB_PASS=$(openssl rand -base64 24) && bash scripts/setup-staging-db.sh`.
- Clon inicial prod→staging (**one-time**, ya ejecutado al montar staging — no es rutina recurrente): `bash scripts/clone-prod-to-staging.sh` (clone completo, incluye usuarios y passwordHash).
- Flujo paso a paso completo: [Doc/Ciclo_Desarrollo.md](Doc/Ciclo_Desarrollo.md).

### Versionado mayor (cambios estructurales >50%)

- Rama `v1` + tag `v1.0-produccion` → snapshot inmutable del sistema actual (commit `d9a9f5a`). **No eliminar nunca.**
- Rama `v2` → desarrollo del nuevo sistema. **Nunca** hacer merge `v2 → main` sin validación completa en staging.
- Para volver a la versión anterior: `git checkout v1` o `git checkout v1.0-produccion`.
- Deploy desde v1: `git checkout v1` → `python3 frontend/deploy_gui.py` (funciona igual que hoy).
- Guía completa: [Doc/Estrategia_Versionado.md](Doc/Estrategia_Versionado.md).

## Almacenamiento GCS — compresión y lifecycle

- **Gzip transparente en uploads**: los modelos 3D (`.stl/.ply/.obj`) se comprimen en el cliente con `CompressionStream('gzip')` antes del PUT. La URL firmada se genera con `extensionHeaders['content-encoding']='gzip'` (`frontend/lib/gcs.ts` → `getUploadUrl`). GCS persiste `Content-Encoding: gzip` y aplica decompressive transcoding al servir, por lo que el visor 3D no requiere cambios. Helper: `frontend/lib/uploadCompression.ts` (`maybeGzipForUpload`, `isGzipCompressible`). Imágenes/PDF/WebP pasan intactos.
- **Marca de archivado**: al transicionar un caso a estado terminal (`completado` en `confirmReceptionAction` y `approveWorkAction` solo_diseno; `disenoAprobado` en `approveWorkAction` integral legacy; `cerrado` en `rejectInvitationOfferAction` y `expireDentistComparativeWindowAction`), se invoca `archiveCaseFilesBestEffort(caseId)` en `frontend/lib/db/archiveCaseFiles.ts`. Esto setea `customTime` en cada objeto GCS del caso. Es best-effort: nunca bloquea la transición.
- **Buckets por entorno**: `dentflowai-assets-prod` (producción) y `dentflowai-assets-dev` (staging). `deploy.sh` selecciona el bucket según `ENV_TARGET` y lo inyecta como `GCP_BUCKET_NAME` en Cloud Run. Cada bucket es independiente (un `customTime` en dev no afecta prod).
- **Lifecycle policy**: misma para ambos buckets (`infra/gcs/lifecycle.json`). A partir de `customTime`: 30d → Nearline, 120d → Coldline, 365d → Archive. Multipart incompletos abortados a 7d. Aplicar: `gsutil lifecycle set infra/gcs/lifecycle.json gs://dentflowai-assets-prod` (y lo mismo con `-dev`).
- **Clonar caso** (`cloneCaseFromTerminalAction`): tras `copyFile`, se llama `GCPStorageService.clearArchivalMark()` para resetear el `customTime` heredado del origen. El clon arranca como caso nuevo en Standard sin reloj de lifecycle iniciado.

## Catálogos UI (listas administrables)
Diseño de lookup tables uniforme:
- **Tablas**: `vita_shade`, `restoration_type`, `dental_material`, `urgency_level`. Misma estructura:
  - `id` (uuid PK) — referenciado por FK desde `clinical_case`.
  - `code` (text UNIQUE) — **opaco, system-generated** (`mat_001`, `vita_001`, `rest_001`, `urg_001`). Identificador estable sin relación semántica con el label.
  - `label` (text) — **único campo editable** por admin.
  - `sort_order`, `is_active`. DDL + seed en [frontend/lib/db/infrastructure.ts](frontend/lib/db/infrastructure.ts) (`INFRA_VERSION` actual: **v5.11** — … v5.11 `price_rule.code` (`prc_NNN`), delete condicionado y búsqueda en mantenedor; **v5.12** validación cascada de dimensiones en admin (`priceRuleDimensions.ts`). Ver [Doc Servicio Orquestado/plan_flujo_tiempos.md](Doc%20Servicio%20Orquestado/plan_flujo_tiempos.md)).
- **FKs en clinical_case**: `material_id`, `restoration_type_id`, `shade_id`, `urgency_id` (todos con `ON DELETE RESTRICT`).
- **Reglas de uso desde código**:
  - Form envía `code` opaco para material/restoration/shade y `label` para urgency. El resolver ([catalogResolver.ts](frontend/lib/db/catalogResolver.ts)) lo convierte a `*_id` antes de persistir.
  - Lógica de negocio (Fauchard: `RESTORATION_TO_WORK_TYPE`, complejidad crítica para "Guía Quirúrgica", comparaciones `urgency === 'Alta'`) referencia **label**. Los labels de restauraciones y urgencias son estándares clínicos estables — admin no debería renombrarlos.
  - Reads (JOINs en cases/invitations/fauchard) aplanan: `material/restorationType/shade/urgency` = `label`. Los `*Code` opacos se exponen solo para selects que persisten el code.
- **UI admin**: `/dashboard/admin/catalogos`. Admin **solo edita label**; code se genera automáticamente. Borrar una opción en uso devuelve error de FK; admin solo desactiva.
- **Sin texto libre**: el wizard no permite "Otro" libre. Si falta una opción, admin la agrega.
- **Scripts one-time** (ya aplicados):
  - [scripts/migrate-catalogs-fk.ts](frontend/scripts/migrate-catalogs-fk.ts) (deprecated): text → FK.
  - [scripts/migrate-catalogs-opaque-codes.ts](frontend/scripts/migrate-catalogs-opaque-codes.ts) (deprecated): codes slug → opacos.
  - [scripts/migrate-recovery-v39.ts](frontend/scripts/migrate-recovery-v39.ts): dedup catálogos + backfill FK + drop columnas text.
- `SERVICE_TYPES` y `WORK_TYPES` **se mantienen como constantes** (state machine y sistema de tipos).

## Dirección geográfica del usuario (`INFRA_VERSION=v5.7`)

Columnas en tabla `user` (todas `TEXT`, nullable, agregadas vía `ALTER TABLE … ADD COLUMN IF NOT EXISTS`):

| Columna DB | Campo Drizzle | Descripción |
|---|---|---|
| `country` | `country` | Código de país (`CL`, `AR`, `CO`, …) |
| `region` | `region` | Código de región (`CL-RM`, `CL-AT`, …) |
| `comuna` | `comuna` | Código de comuna (`CL-RM-SAN`, …) |
| `address` | `address` | Nombre de calle |
| `address_number` | `addressNumber` | Número de calle |
| `address_office` | `addressOffice` | Número de oficina / depto |

**Datos geográficos**: `frontend/lib/constants/addressData.ts` exporta:
- `REGIONS_BY_COUNTRY` — regiones y comunas para 9 países: Chile (completo, 16 regiones y 346 comunas), Argentina, Colombia, Brasil, Perú, Bolivia, Uruguay, Ecuador y México (principales ciudades como comunas).
- `SUPPORTED_COUNTRIES` — array de los 9 países soportados `{ code, name }` para filtrar los selects de país en UI.

**UI**: registración (`auth/register`) y perfil (`dashboard/profile`) muestran el bloque de dirección para ambos roles (dentista y técnico). Los selects son en cascada: País → Región → Comuna; los campos de calle son text inputs.

**Ficha del caso — badge de ubicación (v5.8, divulgación en tres niveles)**: en `dashboard/cases/[id]/page.tsx`, en casos con fabricación (`needsFabrication=true`) el badge del header (junto al ID `DF-XXXX`) muestra la ubicación del dentista con distinto detalle según el viewer:
- **Dirección completa** (`País · Región · Comuna · Calle Número · Of. X`): admin, dentista dueño y el técnico **ganador** (asignado, para despachar la fabricación).
- **Solo ubicación gruesa** (`País · Región · Comuna`): cualquier otro técnico **con asignación al caso** (legacy fabricación), para cotizar traslado. Nunca ve calle/número/oficina.
- **Sin badge**: técnico sin asignación al caso, casos sin fabricación, o dentista sin dirección registrada.

**getCaseDetails**: el join de `doctor` en `getCaseDetails` (`cases.ts`) incluye los 6 campos de dirección y aplica el gate autoritativo en servidor vía `getDoctorAddressDisclosure` (`caseListVisibility.ts`), que devuelve `full | coarse | none`: `coarse` anula solo calle/número/oficina; `none` anula los 6. Para `coarse` se consulta si el viewer tiene asignación al caso. El cliente solo refuerza el render (el armado de partes filtra los campos vacíos).

## Restricciones críticas
<important>NUNCA acceder a la DB desde componentes — solo Server Actions en frontend/lib/db/actions/</important>
<important>getServerIdentity() es el único resolver de identidad — soporta impersonación admin</important>
<important>Migraciones se ejecutan en runtime vía infrastructure.ts — NO usar drizzle-kit push en producción</important>
<important>Leer frontend/AGENTS.md antes de escribir código Next.js</important>

## Motor Fauchard (algoritmo de selección — v2 asignación directa)

El motor Fauchard es el núcleo de orquestación. Flujo de vida de un caso **nuevo** (`solo_diseno`):

1. **Publicar** → `publishCaseAction` → `classifyCaseAction` (work type v5.13, regla de precio) → `runAssignmentAction` (ranking Q/P/E/B/L/N).
2. **Asignar** → si `ranked.length > 0`: `assignCaseAction` (top-1 en `case_assignment`, `internalStatus: asignacionPendiente`); si no hay elegibles y pool on: `enterPendingPoolAction` (`pendiente_pool`, evento `CASO_EN_COLA`).
3. **Aceptar o rechazar** → técnico: `acceptAssignmentAction` (precio/plazo de catálogo) o `rejectInvitationIndividualAction` → `tryReplaceAfterRejectAction` (siguiente del ranking, hasta `maxAssignmentAttempts`, evento `ASIGNACION_REASIGNADA`).
4. **Ejecutar** → `startWorkAction` → entregas iterativas → `approveWorkAction` / `requestRevisionAction` → `completado`.

`sendInvitationsAction` es un **wrapper legacy** que delega en `assignCaseAction` (un solo técnico, no N invitados).

### Modelo de disponibilidad del técnico (v5.0, detrás de `AVAILABILITY_MODEL_ENABLED`)
Reemplaza la exclusión binaria `consecutiveNoResponse >= 3` por un sistema gradual (todo inerte hasta encender el flag). Ver `Doc Servicio Orquestado/`:
- **Elegibilidad AND triple**: el técnico declara disponibilidad en 3 niveles (global · CAD/CAM · **7 categorías**). Fauchard filtra por `computeEligibleAction` en cada corrida (sin caché). Campo clínico `replacesMissingTeeth` (pónticos) + árbol de decisión en `lib/fauchard/caseWorkType.ts` (v5.13).
- **Sanción rolling 14d**: las no-respuestas suman a un nivel 1/2/3 (warning · penalización al score `−αN·N` · auto-OFF del switch global). Decae sola al salir de la ventana. Tablas `technician_availability` / `technician_no_response_event`.
- **Cola `pendiente_pool`**: si no hay elegibles, el caso espera técnicos (TTL + check-in al dentista) en vez de fallar; `runAssignmentAction` retorna `{ pooled: true }`. Reactivación event-driven al encender un técnico + cron `processPendingPoolReevaluationAction`.
- **Rechazo explícito** (individual/masivo) + **reemplazo automático** del siguiente del ranking. Notificaciones vía EmailJS (`lib/services/notifications.ts`); reglas de canal por tipo en `channelsForNotification` (§9.5). **Envío real gated por `NOTIFICATIONS_LIVE`** (interruptor maestro de seguridad por ambiente: si no es `true`, `notifyUser` loguea sin enviar aunque haya credenciales — evita correos reales desde staging con datos clonados). Actions en `lib/db/actions/{availability,availabilityCron,noResponseEvents,rejection,replacement,poolQueue}.ts`.
- **Crons (Cloud Scheduler, header `Authorization: Bearer ${CRON_SECRET}`)**: `/api/cron/process-availability` (cada hora → expira no-respuestas fuera de ventana, auto-OFF preventivo por inactividad, recordatorio) y `/api/cron/process-pool-queue` (cada **2 min** → reevaluación pool, check-in al dentista al 50% del TTL + expiración/re-encole). Inertes con `AVAILABILITY_MODEL_ENABLED` off. La Fase 2 de ligas agrega `/api/cron/process-league` (diario, gated por `LEAGUE_ENGINE_ENABLED`; además corre en local vía instrumentation). Comandos `gcloud` en `Doc/Ciclo_Desarrollo.md`.
- **Republicar / cancelar**: caso en `sin_asignacion_fallo` o `sin_cotizaciones_fallo` (legacy) → botón Republicar (`republicarCaseAction`, modal de doble confirmación); durante `pendiente_pool` el dentista ve banner "Buscando técnicos…" + Cancelar publicación (`cancelPendingPoolAction`) y un check-in modal al 50% del TTL.

### Motor de ligas (Fase 2, detrás de `LEAGUE_ENGINE_ENABLED`)
Mueve a los técnicos entre 4 categorías fijas (Bronce/Plata/Oro/Élite) según desempeño. El **gating** de selección por liga opera en `runAssignmentAction` (expansión en 3 intentos); Fase 2 agrega el **movimiento automático**. Diseño: [Doc/DentFlowAI_Diseño_Funcional_Liga.md](Doc/DentFlowAI_Diseño_Funcional_Liga.md).
- **Ascenso**: triple criterio (`avgRating ≥ lMinRating` ∧ `puntualidad ≥ lMinPunctuality` ∧ `completados ≥ lCasesCompleted`) sobre los últimos `lCasesEvaluated` casos de la liga actual → sube un nivel + abre **transición** (`lCasesTransition` casos con penalización `score·(1−lPenaltyTransition)`). Consolida al completar la ventana.
- **Descenso**: rating `< lDescentRating` sostenido `lDescentDays` (watch `league_demotion_watch_since`); tope en bronce.
- **Estado** en `user`: `league_level`, `league_transition_started_at`, `league_demotion_watch_since`, `league_last_evaluated_at`; auditoría en `league_change_event`. Esquema `INFRA_VERSION=v5.5`. Ver también v5.7 (dirección del usuario) más abajo.
- **Código**: motor en `lib/db/actions/league.ts`; helpers puros en `lib/league.ts`; penalización al score en `lib/leagueScore.ts` (aplicada en `calculateTechnicianScore`/`calculateScoreFromBulkData`). Surface del flag: `getLeagueEngineEnabledAction`.
- **Cron**: `processLeagueMaintenanceAction` (`lib/db/actions/leagueCron.ts`) → endpoint `/api/cron/process-league` (diario, Cloud Scheduler en dev/prod) **y** scheduler in-process en **local** (`frontend/instrumentation.ts` → `lib/localCron.ts`, solo fuera de `NODE_ENV=production`; controles `LOCAL_CRONS_ENABLED` / `LOCAL_LEAGUE_CRON_INTERVAL_MS`).
- **UI admin**: badge de categoría + chip "Transición" en `TechnicianRankingTable`; `LeagueConfigPanel` con banner según flag e invariante `lDescentRating < lMinRating`.

### Idempotencia y lecturas
- **Lecturas** (`getCaseDetails`, `listCasesByOrganization`): solo expiran asignaciones vencidas — **no** re-ejecutan motor ni resetean deadlines.
- Casos históricos con comparativo: ver bloque Legacy abajo.

### Countdowns independientes (etapas distintas)
| Etapa | Config | Campo BD | Estado caso |
|-------|--------|----------|-------------|
| Técnico acepta asignación | `tQuoteMinutes` | `case_assignment.expires_at` | `enEvaluacion` |
| Dentista revisa entrega (v5.0) | `tDentistReviewHours` | `clinical_case.last_revision_submitted_at` (+config) | `enRevision` |

**Legacy — comparativo de ofertas:** `tProposalHours` → `clinical_case.proposal_expires_at` en `propuestaLista` (solo casos v1 en BD).

Helpers: `frontend/lib/db/caseDeadlines.ts`.
- **Etapa revisión (v5.0):** `getCaseReviewDeadlineAt` = `last_revision_submitted_at + tDentistReviewHours` (wall-clock, gated). HMS en cabecera UCH (dentista + técnico); cada entrega reinicia el countdown. **Sin auto-acción** al vencer: marca "Respuesta vencida" + escalación por cron (`REVISION_PLAZO_POR_VENCER` / `REVISION_PLAZO_VENCIDO`).

### Config Fauchard
- **Global:** `getActiveConfig()` — config activa actual.
- **Por caso:** `getConfigForCase(caseId)` — usa `fauchard_config_id` anclado si existe; si no, la activa.
- **Publicar / republicar:** `classifyCaseAction` + `runAssignmentAction` anclan `fauchardConfigId` al caso; `assignCaseAction` usa esa config.

### Simulador y monitor (asignación directa)
- **Simulador admin** (`/dashboard/admin/fauchard/simulate`): **funnel workspace** con stepper navegable (Caso · Clasificación · Filtros · Ranking · Asignación) — no wizard obligatorio. Panel activo izquierda + resultado persistente derecha. Motor: `simulateAssignmentAction` (alias `simulateFauchardAction`): caso virtual con **4 catálogos de precio** (`pricePreview`) + escenario (piezas, complejidad, pónticos Sí/No, notas) → `buildEligiblePoolForScenario` + `rankCandidatesForScenario` (Q/P/E/B/L/N). Salida: `retryChainDetails`, `chainPosition`, cadena coloreada hasta `maxAssignmentAttempts`. Override α solo en paso Ranking (sandbox, no persiste). Componentes en `components/admin/fauchard/simulator/`. Ruta legacy `sandbox-diagram` redirige a `/simulate`.
- **Monitor** (`getFauchardMetricsAction`): agregados sobre `case_assignment` (`assignmentsCount`, tasas respuesta/aceptación, fallos vía `sin_asignacion_fallo` / `sin_cotizaciones_fallo`).

### Legacy (no usar en flujos nuevos)
- **Cotización múltiple:** `runFauchardAction` + `sendInvitationsAction` (N técnicos), `submitQuoteAction`, `evaluateQuotesAction`, `buildProposalAction`, `acceptProposalAction`, `ComparativeOffersPanel` (eliminado del código activo).
- **Idempotencia comparativo:** `evaluateQuotesAction` / `buildProposalAction` solo desde `enEvaluacion`; cron `/api/cron/evaluate-quotes` (cada 5 min) para casos históricos.
- **Fabricación:** `transitionToManufacturingAction`, `registerDispatchAction`, `confirmReceptionAction` (`integral` / `solo_fabricacion`).
- Tabla `case_invitation` (alias Drizzle `caseInvitation`) y campos `quoted*` persisten datos históricos.

## UCH — Reglas de Diseño DentFlowAi

### Qué ES el UCH
El UCH (UnifiedCaseHub) NO es un chat libre. Es una pantalla de flujo guiado con tres capas:
1. **CaseWorkflowStepper** → línea de tiempo del estado del caso (`frontend/components/cases/CaseWorkflowStepper.tsx`).
2. **EventStream** → historial de eventos renderizado por rol en `frontend/components/cases/UnifiedCaseHub.tsx` (vista única tipo Actividad; sin pestaña Resumen; filtros de fase: Todos / Propuesta / Diseño / Produc.).
3. **ActionPanel** → acciones y formularios embebidos en el **mismo hilo** (`buildUchTimelineRows`, filas expandibles en `frontend/components/cases/uch/`), sin overlays `fixed inset-0` centrados por defecto.

### Principio fundamental
Fauchard prioriza **una acción primaria** visible expandida en el hilo (aceptar asignación, revisión dentista, entrega de diseño, bloque Fauchard, etc.); el resto puede quedar colapsado en la misma lista. **No** hay chat libre al pie del UCH.

### Mensajes estandarizados por tipo
| Tipo | Quién lo ve | Componente / ubicación en repo |
|------|-------------|--------------------------------|
| ASIGNACION_RECIBIDA / INVITACION_RECIBIDA | Técnico asignado | `UchFauchardActionsPanel.tsx` + `acceptAssignmentAction` |
| ASIGNACION_REASIGNADA | Técnico (nuevo asignado) | Evento Fauchard tras `tryReplaceAfterRejectAction` |
| CASO_EN_COLA | Dentista | `PendingPoolBanner` + evento en hilo (pool sin elegibles) |
| PROPUESTA_ACEPTADA / ASIGNACION_ACEPTADA | Ambos | `AcceptedProposalSummary.tsx`, `UchDealSummary.tsx` |
| OFERTA_RECHAZADA / OFERTA_NO_SELECCIONADA | Técnico (perdedor) | `UchEventBubble.tsx` con bloque de detalle snapshot (legacy) |
| OFERTA_RECHAZADA_POR_TECNICO | Sistema (enmascarado Fauchard) | `UchRejectInvitationDialog.tsx` + `rejectInvitationIndividualAction` — el técnico rechaza explícitamente su asignación pendiente (gated por `REJECTION_INDIVIDUAL_ENABLED`). **No** cuenta como no-respuesta; dispara reemplazo automático si `AVAILABILITY_MODEL_ENABLED`. El dentista no ve detalle explícito (el reemplazo aparece como nueva asignación). Distinto del rechazo **masivo** (`rejectInvitationsBulkAction`, al pausar el switch global). |
| TRABAJO_INICIADO | Ambos | `UchFauchardActionsPanel.tsx` + `startWorkAction` |
| REVISION_ENVIADA | Ambos | `UchDeliveryPanel.tsx` + `submitRevisionAction` |
| TRABAJO_APROBADO / REVISION_SOLICITADA | Ambos | `UchDentistReviewPanel.tsx` + `approveWorkAction` / `requestRevisionAction` |
| FABRICACION_INICIADA / CASO_DESPACHADO | Ambos | `transitionToManufacturingAction`, `registerDispatchAction` en `cases.ts` |
| RECEPCION_CONFIRMADA | Ambos | `confirmReceptionAction` en `cases.ts` |
| CASO_PUBLICADO | Dentista (split) | Dos burbujas: "Yo" (derecha) + Fauchard (izquierda) — ver split logic |
| CALIFICACION_ENVIADA | Dentista (autor) + técnico ganador | `UchRatingPanel.tsx` + `submitUserRatingAction` en `cases.ts`. **Solo** el técnico calificado (`revieweeId`) ve su calificación — otros técnicos invitados/perdedores no la ven (regla en `caseEventsUchFilter.ts`). Payload lleva `dimension: 'design' \| 'fabrication'`, `rating`, `revieweeId`; el comentario se oculta al técnico vía `sanitizeUchPayloadForViewer` |

### Split de CASO_PUBLICADO
El evento `CASO_PUBLICADO` llega del servidor enmascarado como Fauchard. El cliente lo divide en dos burbujas para el dentista mediante `splitCasoPublicadoForDentista()` en `lib/uchCasoPublicadoSplit.ts`:
- Mitad dentista (`::dentist`): payload lleva `__uchPresentationSelfHalf: true` → carril **self** ("Yo", derecha).
- Mitad Fauchard (`::fauchard`): payload lleva `presentationAuthor: 'fauchard'` → carril **thread** ("Fauchard", izquierda).
- El split solo aplica cuando el contenido incluye ambas frases. Eventos legacy ya partidos pasan intactos.

### Resolución de carril (uchThreadLane.ts)
`resolveUchThreadLane(event, viewer)` determina si una burbuja va a la izquierda (`thread`) o derecha (`self`) y si muestra cabecera "Fauchard" o el nombre del usuario:
- **Tabla A (dentista)**: prioridades explícitas por acción; `isSelfHalfMarker` toma precedencia para `CASO_PUBLICADO`.
- **Tabla B (técnico)**: `ASIGNACION_RECIBIDA` / `INVITACION_RECIBIDA` siempre thread+Fauchard; emisiones propias del técnico → self.
- `uchPresentationRole` fuerza tabla A o B cuando admin tiene ambos flags activos.

### Ficha de caso — botones de gestión
- Lógica de visibilidad/habilitación: `lib/cases/caseDetailActions.ts` → UI en `CaseDetailManagementBar.tsx`.
- **Borrador:** Grabar, Publicar (una sola vez por `publishedAt`), Eliminar. Campos clínicos editables.
- **Intermedios:** mismos botones visibles pero deshabilitados; ficha en solo lectura; flujo en UCH.
- **Terminal** (`completado` | `rechazado` | `cerrado`): Archivar / Restaurar (por usuario en `case_user_archive`), **Crear copia** (`cloneCaseFromTerminalAction` → nuevo borrador, archivos copiados en GCS).
- **No** usar `republishCaseAction` en UI (ronda comercial legacy en el mismo `caseId`).
- Lecturas (`getCaseDetails`, listados) no deben re-evaluar Fauchard ni resetear deadlines.

### Countdowns
**Etapa 1 — aceptar asignación:** `evaluationExpiresAt` / `invitationExpiresAt` desde `getCaseQuoteDeadlineAt` (max `expires_at` de asignaciones `pending`). HMS en cabecera UCH (técnico) y tarjetas de asignaciones; banner en ficha dentista durante `enEvaluacion` + `asignacionPendiente`.

**Legacy — comparativo:** `proposalExpiresAt` → `proposalDeadlineMs` solo en casos históricos con `propuestaLista`.

- `serverClockAnchor` sincroniza reloj cliente-servidor.
- `uchPanelMounted` evita desmontar el UCH al cerrar/abrir (preserva tick del timer en cliente).

### Anonimato
- Dentista NUNCA ve nombre del técnico ni cantidad de candidatos evaluados.
- Técnico NUNCA ve eventos de otros técnicos del mismo caso.
- `sanitizeUchPayloadForViewer()` en `uchPresentation.ts` limpia `presentationAuthor`, `technicianId`, `revieweeId` según rol.
- Admin ve identidades reales sin enmascarado.

### Archivos UCH clave
```
components/cases/
  UnifiedCaseHub.tsx             Componente principal del hub (EventStream + ActionPanel)
  CaseWorkflowStepper.tsx        Línea de tiempo de estados
  PendingPoolBanner.tsx          Banner dentista durante pendiente_pool
  uch/
    UchEventBubble.tsx           Burbuja individual de evento
    UchFauchardActionsPanel.tsx  Acciones Fauchard (aceptar/rechazar asignación, iniciar trabajo, etc.)
    UchDeliveryPanel.tsx         Panel de entrega (técnico)
    UchDentistReviewPanel.tsx    Panel de revisión (dentista)
    UchDealSummary.tsx           Resumen del acuerdo aceptado (precio/plazo de catálogo)
    UchRatingPanel.tsx           Calificación del dentista al técnico (v5.3, dimension: design|fabrication)
    buildUchTimelineRows.ts      Construye filas del timeline (eventos + acciones)
    uchTimelineTypes.ts          Tipos del timeline
    uchHubActionVisibility.ts    Lógica de visibilidad de acciones

lib/
  uchThreadLane.ts               Resolución de carril (self/thread) y voz Fauchard
  uchPresentation.ts             Enmascarado Fauchard + sanitización de payload
  uchCasoPublicadoSplit.ts       Split client-side de CASO_PUBLICADO para dentista
  uchEventVisibility.ts          Regla de visibilidad para eventos visibleTo:tecnico
  uchUnread.ts                   Contadores de mensajes no leídos
  caseEventsUchFilter.ts         Filtro de eventos por rol (espeja getCaseEventsAction)
                                   — incluye regla CALIFICACION_ENVIADA: solo el técnico con
                                     revieweeId === identity.id la ve (fallback a assignedTechnicianId)
  deadlineMs.ts                  Utilidades de deadline (toDeadlineMs, effectiveNowMs)
  hooks/useRemainingUntil.ts     Hook para countdown sincronizado con servidor

Legacy (solo casos históricos): UchQuoteBreakdown.tsx, uchQuoteDisplay.ts
```

### Stack y rutas (UCH en este repo)
- Server Actions **solo** en `frontend/lib/db/actions/` (nunca DB desde componentes).
- Identidad: **solo** `getServerIdentity()` como resolver (impersonación admin incluida).
