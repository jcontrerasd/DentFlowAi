# Plan — Ajuste de Login y Migración de Auth

**Fecha de creación:** 2026-05-22
**Estado:** Pendiente de ejecución
**Owner:** Jaime Contreras
**Archivo plan original:** `/Users/jaimecontreras/.claude/plans/glittery-moseying-perlis.md`

---

## 1. Requerimiento original

El producto necesita resolver 5 requisitos que hoy NO están cubiertos por el stack actual (NextAuth 5 con JWT):

1. **Restringir a una sola conexión por usuario.** Si un usuario inicia sesión en un dispositivo nuevo, la sesión anterior queda invalidada.
2. **Asegurar que el sistema funcione en todos los browsers** soportados (matriz oficial definida).
3. **Asegurar que cuando se cierre la sesión quede realmente cerrada**, incluyendo el caso de cerrar la pestaña que contiene la app.
4. **Agregar login con Google (OAuth).**
5. **Validar el email antes de crear la cuenta** (verificación obligatoria por correo electrónico).

Los 5 requisitos comparten una misma cirugía base: migrar de **JWT sessions** a **database sessions** de NextAuth, aprovechando que el `DrizzleAdapter` y las tablas `accounts`, `sessions`, `verificationToken` ya están en el schema pero no se usan.

---

## 2. Estado actual relevante (auditoría hecha 2026-05-22)

| Pieza | Archivo / Ubicación | Estado actual |
|---|---|---|
| Config NextAuth | `frontend/auth.ts`, `frontend/auth.config.ts` | JWT, solo Credentials provider |
| Adapter | DrizzleAdapter ya importado en `auth.ts` líneas 8–13 | Configurado pero subutilizado |
| Identity resolver | `frontend/lib/db/actions/impersonation.ts` `getServerIdentity()` | ~76 call sites; ya hit DB cuando hay impersonación |
| Schema `user` | `frontend/lib/db/schema.ts` líneas 23–53 | `id: text`, `emailVerified` ya existe (nullable) |
| Tablas auth NextAuth | `accounts` (368–393), `sessions` (394–400), `verificationToken` (402–409) | Presentes, vacías |
| Cookie impersonación | `dentflow_impersonate_id` (impersonation.ts línea 36) | Funcional |
| `useSession()` / `useAuth()` | `frontend/context/AuthContext.tsx` líneas 53–188 | Envuelve NextAuth + fetch DB profile |
| Logout | `dashboard/layout.tsx` líneas 119–122 → `signOut()` | Sin server-side cleanup |
| `/auth/verify` | `frontend/app/auth/verify/page.tsx` | Placeholder con auto-redirect |
| Resend | Wired en `frontend/lib/services/notifications.ts` líneas 4–6, 122 | API key actual inválida (ver checklist) |
| Tests auth | `login-page.test.tsx`, `register-page.test.tsx` | Cubren flujo client; nada de session lifecycle |

---

## 3. Estrategia transversal

- **Feature flags por fase**: cada fase sale detrás de un flag (`AUTH_DB_SESSIONS_ENABLED`, `GOOGLE_OAUTH_ENABLED`, `EMAIL_VERIFICATION_ENABLED`, `SINGLE_SESSION_ENABLED`, `TAB_CLOSE_LOGOUT_ENABLED`). Permite activación gradual y rollback inmediato sin redeploy.
- **No tocar la PK `user.id: text`** — respetar el tipo actual para no propagar cambios a `clinicalCase.doctorId`, `caseInvitation.technicianId`, `file.uploaderId`, etc.
- **`getServerIdentity()` queda como único punto de verdad** — adapta internamente JWT vs DB session según el flag; los 76 call sites no se modifican.
- **Impersonación admin** debe seguir funcionando en cada fase — el cookie `dentflow_impersonate_id` se mantiene; gate de test específico en cada fase.
- **Gate de validación al cierre de cada fase:**
  1. `npm run type-check` limpio.
  2. `npm run lint` sin nuevos errores.
  3. `npm run test:run` — todos los tests existentes siguen pasando + nuevos tests verdes.
  4. Smoke manual del flujo crítico de la fase.
  5. Login real + impersonación + flujo clínico completo en staging.

---

## 4. Fases (plan incremental)

### Fase 0 — Tests baseline (sin cambios de código)

**Objetivo:** asegurar red de seguridad antes de tocar auth.

**Tareas:**
1. Correr suite completa: `npm run validate:full && npm run test:run`. Documentar conteo de tests passing en `frontend/test/auth-baseline.md`.
2. Smoke tests Vitest:
   - `frontend/test/auth-baseline-login.test.tsx`
   - `frontend/test/auth-baseline-logout.test.tsx`
   - `frontend/test/auth-baseline-impersonation.test.ts`
   - `frontend/test/auth-baseline-onboarding.test.tsx`
3. (Opcional, si Playwright se activa en F0) `frontend/e2e/auth.spec.ts`: registro, login+logout, impersonación.

**Gate Fase 0:** snapshot `316+ tests passing`, smoke + E2E verdes. Sin esto NO se pasa a Fase 1.

---

### Fase 1 — Migrar JWT → Database Sessions

**Objetivo:** cambiar `session.strategy` a `'database'` sin romper login, impersonación ni los 76 call sites.

| Archivo | Cambio |
|---|---|
| `frontend/auth.ts` | `session.strategy = 'database'` detrás de flag `AUTH_DB_SESSIONS_ENABLED`. Si flag false, sigue JWT |
| `frontend/auth.config.ts` | Adaptar callbacks: con DB sessions el callback `session` recibe `{ session, user }` (no `{ token }`); hidratar `role`, `organizationId`, `isSystemAdmin` desde DB |
| `frontend/lib/db/actions/impersonation.ts` | `getServerIdentity()`: en modo DB, `auth()` devuelve sesión con `user` ya hidratado |
| `frontend/.env.example` | Documentar `AUTH_DB_SESSIONS_ENABLED` (✅ hecho) |
| `frontend/lib/db/infrastructure.ts` | Confirmar tablas `sessions`, `accounts`, `verificationToken` en runtime; añadir a migraciones idempotentes si faltan |

**Tests intermedios:**
- `frontend/test/auth-db-sessions.test.ts`: login crea fila en `sessions`; logout la elimina; `getServerIdentity()` resuelve desde DB.
- `frontend/test/auth-impersonation-db-sessions.test.ts`: admin con DB session puede impersonar.
- Re-run baseline F0 completo.

**Gate Fase 1:**
- 100% baseline tests verdes.
- Login + impersonación + flujo clínico verificados manualmente en staging con flag ON.
- Plan de rollback: bajar flag → JWT vuelve sin migración inversa.

---

### Fase 2 — Google OAuth

**Objetivo:** añadir login con Google sin romper credenciales ni onboarding actual.

| Archivo | Cambio |
|---|---|
| `frontend/auth.config.ts` | Añadir `GoogleProvider({ clientId, clientSecret })` condicionado a flag `GOOGLE_OAUTH_ENABLED` |
| `frontend/.env.example` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_ENABLED` (✅ hecho) |
| **GCP Console** (pre-requisito externo) | Crear credenciales OAuth 2.0 tipo Web. Redirect URIs: `http://localhost:3000/api/auth/callback/google`, `https://dentflowai.com/api/auth/callback/google`. OAuth consent screen configurado |
| `frontend/app/auth/login/page.tsx` | Botón "Iniciar con Google" condicional al flag |
| `frontend/app/auth/register/page.tsx` | Botón equivalente; flujo de onboarding adaptado para OAuth (no tienen password) |
| `frontend/auth.config.ts` `signIn` callback | Usuario nuevo vía Google: `onboardingStep=20`, `emailVerified: now()` |
| `frontend/app/dashboard/layout.tsx` | Guard redirige a `/auth/register` paso 2 si onboardingStep < 100 |

**Tests intermedios:**
- `frontend/test/auth-google-oauth.test.ts`: mock provider; primer login crea row en `user` + `accounts` + `sessions`; segundo login reusa.
- `frontend/test/auth-google-onboarding.test.tsx`: redirect a register paso rol si perfil incompleto.
- Re-run F0 + F1.

**Gate Fase 2:** login con Google funcional E2E + credenciales sin regresión + impersonación OK.

---

### Fase 3 — Email Verification Real

**Objetivo:** bloquear acceso al dashboard hasta verificar email; reemplazar placeholder `/auth/verify`.

| Archivo | Cambio |
|---|---|
| `frontend/lib/services/notifications.ts` | Añadir función `sendVerificationEmail(email, token)` (Resend ya wired) |
| `frontend/lib/db/actions/auth.ts` (NUEVO) | `requestEmailVerificationAction(email)`: genera token, escribe `verificationToken`, envía email |
| `frontend/lib/db/actions/auth.ts` | `confirmEmailVerificationAction(token)`: valida, setea `user.emailVerified = now()`, borra token |
| `frontend/app/auth/verify/page.tsx` | UI real: lee `?token=` del query, llama confirm action, muestra estado |
| `frontend/app/auth/register/page.tsx` | Tras step "perfil" envía email, bloquea continuación hasta confirmar |
| `frontend/auth.config.ts` `signIn` callback | Rechazar login si `emailVerified === null` y flag ON (excepto OAuth) |
| `frontend/app/auth/login/page.tsx` | Mensaje "verifica tu correo" + link de reenvío |
| `frontend/.env.example` | `RESEND_API_KEY`, `EMAIL_VERIFICATION_ENABLED`, `NOTIFICATION_FROM_EMAIL`, `EMAIL_VERIFICATION_TTL_HOURS` (✅ hecho) |

**Pre-requisito externo crítico:**
- Resend API key válida.
- Dominio (`dentflowai.com` o `dentflow.ai`) verificado en Resend con SPF + DKIM en DNS.
- **Backfill** `emailVerified = now()` para todos los usuarios existentes antes de activar el flag.

**Tests intermedios:**
- `frontend/test/auth-email-verification.test.ts`: registro genera token, confirm setea `emailVerified`, login bloqueado si null + flag ON, token expirado rechazado.
- `frontend/test/auth-email-verification-resend.test.ts`: reenvío invalida viejo token, crea nuevo.
- Re-run F0 + F1 + F2.

**Gate Fase 3:** registro completo con email real en staging; OAuth no requiere verificación adicional; admin bypassa.

---

### Fase 4 — Una sesión activa por usuario

**Objetivo:** nuevo login expulsa al anterior.

| Archivo | Cambio |
|---|---|
| `frontend/auth.config.ts` `signIn` callback | Si flag `SINGLE_SESSION_ENABLED`: tras crear nueva session, borrar filas previas de `sessions` del mismo `userId` |
| `frontend/lib/db/actions/impersonation.ts` `getServerIdentity()` | Si la session del request ya no existe en DB, devolver `null` → middleware redirige a `/auth/login?reason=session_replaced` |
| `frontend/app/auth/login/page.tsx` | Mensaje "Tu sesión anterior fue cerrada" si `?reason=session_replaced` |
| `frontend/middleware.ts` o equivalente | Si `getServerIdentity()` null pero hay cookie → limpiar cookie + redirect |

**Tests intermedios:**
- `frontend/test/auth-single-session.test.ts`: A logueado → B loguea → A pide algo → null → redirect.
- `frontend/test/auth-single-session-impersonation.test.ts`: admin no afectado por impersonación.
- Re-run F0–F3.

**Gate Fase 4:** smoke manual dos tabs / dos browsers / dos devices; solo la última sesión sigue activa.

---

### Fase 5 — Logout real al cerrar pestaña

**Objetivo:** invalidar la sesión server-side cuando cierra la pestaña o navegador.

| Archivo | Cambio |
|---|---|
| `frontend/lib/db/schema.ts` | Añadir `lastSeenAt: timestamp` a `sessions` (migración idempotente) |
| `frontend/app/api/auth/heartbeat/route.ts` (NUEVO) | Actualiza `sessions.lastSeenAt = now()` para la session del request |
| `frontend/app/api/auth/close/route.ts` (NUEVO) | POST sin body para `sendBeacon`; borra la session |
| `frontend/components/auth/SessionHeartbeat.tsx` (NUEVO, Client) | `setInterval` cada 30s → `fetch('/api/auth/heartbeat', { keepalive: true })`; `beforeunload` → `navigator.sendBeacon('/api/auth/close')` |
| `frontend/app/dashboard/layout.tsx` | Montar `<SessionHeartbeat />` cuando hay sesión y flag ON |
| `frontend/app/api/cron/cleanup-stale-sessions/route.ts` (NUEVO) | Borra sessions donde `lastSeenAt < now() - SESSION_STALE_TTL_SECONDS` |

**Pre-requisito externo:**
- Cloud Scheduler job:
  ```bash
  gcloud scheduler jobs create http cleanup-stale-sessions \
    --schedule="*/2 * * * *" \
    --uri="https://dentflowai.com/api/cron/cleanup-stale-sessions" \
    --http-method=POST \
    --headers="X-Cron-Secret=<CRON_SECRET>"
  ```

**Tests intermedios:**
- `frontend/test/auth-heartbeat-endpoint.test.ts`: heartbeat actualiza, ajeno no toca sessions de otros.
- `frontend/test/auth-close-endpoint.test.ts`: POST borra la session, idempotente.
- `frontend/test/auth-cleanup-stale.test.ts`: cron borra sessions stale, no toca activas.
- `frontend/e2e/auth-tab-close.spec.ts`: cerrar pestaña → sesión no resoluble.
- Re-run F0–F4.

**Gate Fase 5:** TTL 60–90s en config; `sendBeacon` limpio sin warnings; cron OK.

---

### Fase 6 — Cross-browser audit

**Objetivo:** matriz oficial + tests automáticos.

| Archivo | Cambio |
|---|---|
| `frontend/playwright.config.ts` (NUEVO o ampliar) | Matriz: Chromium, Firefox, WebKit desktop + mobile Chrome + mobile Safari |
| `frontend/e2e/` | E2E principales en 3+ browsers (auth, crear caso, cotizar, visor 3D) |
| `package.json` | Script `test:e2e:matrix` |
| `CLAUDE.md` raíz | Matriz oficial documentada |
| `.github/workflows/ci.yml` (o equivalente) | Step E2E matrix en CI |

**Tests:** suite Playwright verde en Chromium/Firefox/WebKit; smoke móvil del visor 3D.

**Gate Fase 6:** CI verde en 3 browsers; matriz documentada (sugerida: Chrome 109+, Firefox 115+, Safari 16.4+, Edge 109+).

---

### Fase 7 — QA integral + Rollout

**Objetivo:** activación gradual sin sorpresas.

**Plan:**
1. Deploy con todos los flags OFF salvo `AUTH_DB_SESSIONS_ENABLED` (que pasó cirugía en F1).
2. Activar flags uno por uno con 48–72h entre cada uno, monitoreando logs, métricas, soporte.
3. Orden: Google OAuth → Email verification → Single session → Tab-close logout.
4. Mantener flags al menos 2 semanas tras activación antes de eliminar código condicional.

**Test final integral:**
- `frontend/test/auth-full-flow.integration.test.ts` con `RUN_DB_INTEGRATION_TESTS=true`: registro + verify + onboarding + flujo clínico + logout + re-login + impersonación + cierre tab + re-login.
- `frontend/e2e/auth-full-flow.spec.ts` equivalente en Playwright.

**Gate final:**
- Suite verde: Vitest + Playwright 3 browsers.
- 72h estables con todos los flags ON en producción.
- Documentación actualizada: `CLAUDE.md`, `frontend/CLAUDE.md`, runbook en `infra/auth/README.md`.

---

## 5. Archivos críticos a modificar (resumen)

| Categoría | Archivos |
|---|---|
| Config NextAuth | `frontend/auth.ts`, `frontend/auth.config.ts` |
| Identity | `frontend/lib/db/actions/impersonation.ts` |
| Schema | `frontend/lib/db/schema.ts` (columna `lastSeenAt`) |
| Infrastructure | `frontend/lib/db/infrastructure.ts` |
| Pages | `frontend/app/auth/login/page.tsx`, `register/page.tsx`, `verify/page.tsx`, `dashboard/layout.tsx` |
| Server actions | `frontend/lib/db/actions/auth.ts` (NUEVO) |
| Notifications | `frontend/lib/services/notifications.ts` |
| Components nuevos | `frontend/components/auth/SessionHeartbeat.tsx` |
| API routes nuevas | `app/api/auth/heartbeat/route.ts`, `app/api/auth/close/route.ts`, `app/api/cron/cleanup-stale-sessions/route.ts` |
| E2E | `frontend/playwright.config.ts`, `frontend/e2e/*.spec.ts` |

## 6. Funciones / utilidades a reutilizar

- `getServerIdentity()` (`frontend/lib/db/actions/impersonation.ts`) — único punto de identidad; mantener firma.
- `DrizzleAdapter` ya configurado en `auth.ts`.
- Tablas `accounts`, `sessions`, `verificationToken` del schema actual.
- `AuthContext` / `useAuth()` (`frontend/context/AuthContext.tsx`) — extender sin reemplazar.
- `cookies()` de `next/headers` (ya usado para `dentflow_impersonate_id`).
- `lib/services/notifications.ts` (Resend ya wired).

---

## 7. Verificación end-to-end (transversal)

### En cada fase
1. `npm run type-check` limpio.
2. `npm run lint` sin nuevos errores.
3. `npm run test:run` — baseline + tests nuevos verdes.
4. Smoke manual del flujo de la fase + impersonación admin.
5. Flujo clínico completo (publicar → cotizar → aceptar → entregar → completar) sin regresión.

### Antes del rollout final
- Test de carga ligero: 50 usuarios concurrentes con heartbeat activo, sin saturar DB.
- Auditoría de seguridad: tokens de verificación con expiración real, single-use, no leaked.
- Backup de DB con plan de rollback documentado.
- Runbook de incidentes: cómo desactivar cada flag y volver a estado anterior en <5 min.

---

## 8. Riesgos críticos

- **Migración de usuarios con sesión activa al activar Fase 1**: JWT viejos siguen aceptándose en ventana de gracia (1 semana) mientras se generan DB sessions paralelas; tras la ventana se invalidan los JWT por endurecimiento del callback.
- **Impersonación admin** debe sobrevivir cada fase — gate de test específico.
- **`onboardingStep` y OAuth**: usuario nuevo con Google entra con step 20; verificar que no caiga en loop.
- **`emailVerified` en usuarios existentes pre-Fase 3**: backfill automático con `emailVerified = now()` antes de activar el flag.
- **`sendBeacon` no es 100% confiable** (móviles, crashes). El cron de limpieza es el plan B obligatorio.
- **Resend en producción**: deliverability, configurar SPF/DKIM antes de Fase 3.
- **Tests E2E flakiness** en Playwright multi-browser: presupuestar tiempo de estabilización.

---

## 9. Checklist de pre-requisitos

### ✅ Completado (verificado / hecho al 2026-05-22)

- ✅ **Node y npm** instalados (Node 20.17 — apenas por debajo del 20.19 requerido por `engines`; ver pendientes).
- ✅ **`.env.local` existente y poblado.**
- ✅ **`AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST`** ya configurados (NextAuth v5 usa `AUTH_*`).
- ✅ **`DATABASE_URL`** seteado y funcional.
- ✅ **`RESEND_API_KEY`** presente en `.env.local` (pero **inválida**: `re_123456789` — ver pendientes).
- ✅ **Resend wired**: `frontend/lib/services/notifications.ts` líneas 4–6, 122.
- ✅ **GCP/GCS completo**: `GCP_PROJECT_ID`, `GCP_BUCKET_NAME`, `GOOGLE_APPLICATION_CREDENTIALS`.
- ✅ **`.nvmrc` en raíz** con `20.19.0` (solo falta activar la versión).
- ✅ **Backup de BD producción** generado vía `pg_dump` local en `/Users/jaimecontreras/Documents/Projects/DentFlowAi/Backup/pre-auth-migration-20260522-1816.dump` (161K, formato custom, restaurable con `pg_restore`).
- ✅ **`frontend/.env.example`** creado con todas las variables del plan (NextAuth, Resend, Google OAuth, 5 feature flags, cron).
- ✅ **`frontend/.env.local`** ampliado con los 13 nuevos vars en valores seguros (todos los flags `false` → comportamiento idéntico al actual). Variables añadidas:
  - `AUTH_DB_SESSIONS_ENABLED=false`
  - `GOOGLE_OAUTH_ENABLED=false`
  - `EMAIL_VERIFICATION_ENABLED=false`
  - `SINGLE_SESSION_ENABLED=false`
  - `TAB_CLOSE_LOGOUT_ENABLED=false`
  - `SESSION_HEARTBEAT_SECONDS=30`
  - `SESSION_STALE_TTL_SECONDS=90`
  - `EMAIL_VERIFICATION_TTL_HOURS=24`
  - `NOTIFICATION_FROM_EMAIL=DentFlowAi <notifications@dentflowai.com>`
  - `GOOGLE_CLIENT_ID=` (vacío)
  - `GOOGLE_CLIENT_SECRET=` (vacío)
  - `CRON_SECRET=` (vacío)
- ✅ **Diagnóstico de Cloud SQL** completado: instancia `dentflowai-cbcf2-instance` en `southamerica-west1-b`, tier `db-f1-micro`, edition ENTERPRISE en "No Cost Trial for Firebase Data Connect" — **bloquea backups on-demand**.

### 🔴 Pendiente bloqueante (acción del usuario)

#### Pre-requisitos generales (antes de Fase 0)

- [ ] **Actualizar Node a 20.19+**:
  ```bash
  nvm install 20.19.0
  nvm use 20.19.0
  nvm alias default 20.19.0
  node --version    # verificar v20.19.0
  ```

- [ ] **Resend: generar API key real**:
  1. Entrar a `https://resend.com/api-keys`.
  2. Generar API key real (formato `re_...` largo) con permisos `Send`.
  3. Reemplazar en `.env.local`: `RESEND_API_KEY=re_<tu_key_real>`.
  - **Hoy** la key `re_123456789` es inválida → notificaciones fallan silenciosamente.

- [ ] **Resend: verificar dominio**:
  1. `https://resend.com/domains` → "Add Domain".
  2. Confirmar dominio real: ¿`dentflowai.com` o `dentflow.ai`? El default actual en `NOTIFICATION_FROM_EMAIL` es `dentflowai.com`.
  3. Cargar registros DNS (SPF + DKIM) en proveedor (Cloudflare/Route53/etc.).
  4. Esperar propagación y dar "Verify".
  - **Sin esto, Fase 3 no puede activarse en producción.**

- [ ] **Habilitar backups automáticos de Cloud SQL** (recomendado, no bloqueante de F0/F1):
  - Opción A: salir del trial.
    ```bash
    gcloud sql instances patch dentflowai-cbcf2-instance \
      --edition=ENTERPRISE \
      --backup-start-time=03:00 \
      --backup-location=southamerica-west1
    ```
    Consultar impacto de facturación antes.
  - Opción B: cron de `pg_dump` diario a GCS bucket. Más barato pero menos confiable.

#### Decisiones técnicas pendientes

- [ ] **¿BD de staging?**
  - A: Cloud SQL espejo (nueva instancia o DB, ~pocos USD/mes).
  - B: Sin staging, dev local + feature flags OFF en prod.
  - C: Postgres local en Docker con dump restaurado.
  - **Recomendado:** B + C combinados.

- [ ] **¿Playwright en Fase 0?**
  - Recomendado: NO en Fase 0, incorporarlo en Fase 6.

#### Pre-requisitos por fase (resolver cuando llegue cada una)

##### Fase 2 (Google OAuth)
- [ ] **Crear credenciales OAuth en GCP Console** (`https://console.cloud.google.com/apis/credentials?project=dentflowai-cbcf2`):
  - OAuth consent screen configurado (External, scopes `email/profile/openid`).
  - Crear OAuth client ID tipo Web.
  - Authorized origins: `http://localhost:3000` y `https://dentflowai.com`.
  - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`, `https://dentflowai.com/api/auth/callback/google`.
- [ ] Pegar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env.local` y en secrets de producción.

##### Fase 5 (Tab-close logout)
- [ ] **Definir `CRON_SECRET`** en `.env.local` y producción.
- [ ] **Crear Cloud Scheduler job** `cleanup-stale-sessions`:
  ```bash
  gcloud scheduler jobs create http cleanup-stale-sessions \
    --schedule="*/2 * * * *" \
    --uri="https://dentflowai.com/api/cron/cleanup-stale-sessions" \
    --http-method=POST \
    --headers="X-Cron-Secret=<CRON_SECRET>"
  ```

#### Decisiones de producto pendientes

| Fase | Decisión | Opciones | Recomendación |
|---|---|---|---|
| 2 | Vincular Google con cuenta email existente | sí / no | sí (estándar) |
| 2 | Onboarding tras primer Google login | directo a paso 2 / nuevo paso 0 | directo a paso 2 |
| 3 | Backfill `emailVerified=now()` para usuarios existentes | sí / no / lista de exclusión | sí, todos |
| 3 | Texto del email de verificación | tu redacción / plantilla | plantilla simple texto plano |
| 4 | Política single-session | last-write-wins / block-new | last-write-wins |
| 4 | Admin exento de single-session | sí / no | sí |
| 5 | TTL del heartbeat | 60 / 90 segundos | 90s |
| 6 | Matriz oficial de browsers | propuesta | Chrome 109+, Firefox 115+, Safari 16.4+, Edge 109+ |

---

## 10. Cómo retomar este trabajo en el futuro

1. **Leer este archivo completo** (`/Backlog/202605022_Plan Ajuste Login.md`).
2. **Leer el plan original** en `/Users/jaimecontreras/.claude/plans/glittery-moseying-perlis.md` (versión más extensa con justificaciones).
3. **Verificar el checklist de la sección 9**:
   - Marcar lo que cambió desde la última vez.
   - Confirmar que los pre-requisitos bloqueantes están resueltos antes de arrancar Fase 0.
4. **Confirmar el estado del repo**:
   - `.env.local` debe tener los 13 vars añadidos en valores seguros (todos los flags `false`).
   - `frontend/.env.example` debe existir y estar actualizado.
   - Backup `pre-auth-migration-*.dump` existe en `/Backup/`.
5. **Tomar las decisiones de producto pendientes** (sección 9 final) — sin esto, las fases 2+ no pueden empezar.
6. **Arrancar por Fase 0** (baseline tests) y avanzar fase por fase con su gate de validación.
7. **Cada fase**: feature flag OFF → cambios + tests intermedios → flag ON en staging → validar gate → activar en prod.

### Orden sugerido si arrancas hoy

1. **Día 1**: resolver bloqueantes (Node, Resend key, dominio Resend, decisión BD staging, decisión Playwright).
2. **Día 2–3**: Fase 0 (baseline + smoke tests).
3. **Día 4–7**: Fase 1 (DB sessions) — el corazón de la migración.
4. **Sprint 2**: Fase 2 (Google OAuth) — depende de OAuth credentials.
5. **Sprint 3**: Fase 3 (Email verification) — depende de Resend OK + backfill.
6. **Sprint 4**: Fase 4 + Fase 5 (single session + tab close).
7. **Sprint 5**: Fase 6 (cross-browser) + Fase 7 (rollout).

**Esfuerzo total estimado**: 12–20 días de desarrollo efectivo → 3–6 semanas calendario con QA, ajustes y rollout.

---

## 11. Referencias

- Plan extendido: `/Users/jaimecontreras/.claude/plans/glittery-moseying-perlis.md`
- Backup pre-migración: `/Backup/pre-auth-migration-20260522-1816.dump`
- Frontend `.env.example` actualizado: `/frontend/.env.example`
- Documentación arquitectura: `/CLAUDE.md`, `/frontend/CLAUDE.md`, `/frontend/lib/db/CLAUDE.md`
- Tablas auth NextAuth ya en schema: `/frontend/lib/db/schema.ts` líneas 368–409
