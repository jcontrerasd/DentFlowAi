# Ciclo de Desarrollo — DentFlowAi

Guía paso a paso del flujo de trabajo: desde tu máquina local hasta producción. Pensada para que cualquier persona del equipo, sin experiencia previa en GCP o Docker, pueda operar el ciclo completo.

---

## 1. Visión general

Hay **dos líneas de trabajo** (ver [Estrategia_Versionado.md](Estrategia_Versionado.md)). GCP dev y GCP prod tienen **un solo servicio cada uno** — cada deploy reemplaza la versión anterior.

**Importante:** la pestaña **STAGING (dev)** en `deploy_gui.py` despliega a **GCP dev** (Cloud Run). No es la rama Git `develop`.

### Línea A — versión antigua (v1)

| Etapa | Rama Git | Deploy GUI | Destino |
|-------|----------|------------|---------|
| Trabajo | `develop` | — | local |
| Staging | `develop` | pestaña **STAGING** | GCP dev |
| Producción | `main` (tras merge `develop→main`) | pestaña **PRODUCTION** | GCP prod |

Respaldo fijo: rama `v1` + tag `v1.0-produccion` (rollback de emergencia).

### Línea B — cambio estructural (v2)

| Etapa | Rama Git | Deploy GUI | Destino |
|-------|----------|------------|---------|
| Trabajo | `v2` | — | local |
| Staging | `v2` | pestaña **STAGING** | GCP dev |
| Producción | `main` (tras merge `v2→main`) | pestaña **PRODUCTION** | GCP prod |

### Regla común

> **GCP dev** ← rama de trabajo (`develop` o `v2`) · **GCP prod** ← solo `main` (después del merge).

La GUI **bloquea** deploy a PRODUCTION desde `develop` o `v2` y muestra la rama/commit actual antes de desplegar.

```
LOCAL → develop (v1) o v2 → STAGING GUI → GCP dev → merge → main → PRODUCTION GUI → GCP prod
```

**Reglas de oro**:

- Nunca trabajas directo en `main`. `main` = lo que está en producción.
- Mientras v2 está en curso, evita mergear `develop→main` salvo hotfix urgente en la línea v1.
- Las BD de staging y producción están **completamente separadas**.

---

## 2. Prerrequisitos

Instala una vez:

| Herramienta | Verificar con | Notas |
|---|---|---|
| Docker Desktop | `docker --version` | Para BD y storage locales |
| Node.js ≥ 20.19 | `node --version` | Para correr Next.js |
| npm ≥ 10 | `npm --version` | Para dependencias |
| Google Cloud CLI | `gcloud --version` | Para deploy |
| Git | `git --version` | Para versionar |

Configurar gcloud (una sola vez):

```bash
gcloud auth login
gcloud config set project dentflowai-cbcf2
```

---

## 3. Setup inicial (una sola vez por persona)

### 3.1 Clonar el repo

```bash
git clone https://github.com/<org>/DentFlowAi.git
cd DentFlowAi
```

### 3.2 Crear `.env.local`

```bash
cp frontend/.env.example frontend/.env.local
```

Edita `frontend/.env.local` y completa:

- `AUTH_SECRET` → genera con `openssl rand -base64 32`
- `DATABASE_URL` → ya viene apuntando al Postgres de Docker
- `GCP_BUCKET_NAME`, `GCP_PROJECT_ID` → para local pueden quedar como están (fake-gcs)
- `DATABASE_URL_DEV`, `AUTH_URL_DEV`, `NEXT_PUBLIC_APP_URL_DEV`, `GCP_BUCKET_NAME_DEV` → se llenan tras crear staging (paso 3.4). `GCP_BUCKET_NAME_DEV=dentflowai-assets-dev`.
- `DATABASE_URL_PROD`, `AUTH_URL_PROD`, `NEXT_PUBLIC_APP_URL_PROD`, `GCP_BUCKET_NAME_PROD` → se llenan tras el primer deploy a prod. `GCP_BUCKET_NAME_PROD=dentflowai-assets-prod`.

### 3.3 Crear la rama `develop` (la primera vez que el repo no la tiene)

```bash
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
```

A partir de ahora `develop` existe en GitHub y todo el equipo la usa.

### 3.4 Crear la BD de staging en Cloud SQL

```bash
export DB_PASS=$(openssl rand -base64 24)
bash scripts/setup-staging-db.sh
```

El script imprime una línea `DATABASE_URL_DEV=...`. Cópiala y pégala en `frontend/.env.local`.

**Paso manual obligatorio**: en GCP Console → Cloud SQL → `dentflowai-psql-dev` → Connections → autoriza tu IP y temporalmente `0.0.0.0/0` para que Cloud Run pueda conectarse.

### 3.5 Primer deploy a staging

```bash
cd frontend
bash deploy.sh develop
```

El primer deploy crea el servicio `dentflowai-frontend-dev` en Cloud Run. Al final imprime la URL real (ej. `https://dentflowai-frontend-dev-abc123-tl.a.run.app`).

**Importante**: copia esa URL y actualiza en `.env.local`:

```bash
AUTH_URL_DEV=https://dentflowai-frontend-dev-abc123-tl.a.run.app
NEXT_PUBLIC_APP_URL_DEV=https://dentflowai-frontend-dev-abc123-tl.a.run.app
```

Y vuelve a ejecutar `bash deploy.sh develop` una segunda vez para que NextAuth use la URL correcta. (Solo necesario en el primer deploy.)

---

## 4. Entorno local — día a día

### 4.1 Arrancar la app

```bash
# Asegúrate que Docker Desktop está abierto
docker compose up -d                        # levanta Postgres + fake-gcs
cd frontend
npm install                                  # solo la primera vez
npm run dev                                  # arranca Next.js en :3000
```

Abre [http://localhost:3000](http://localhost:3000). Debes ver:

- Logo "DentFlowAi" arriba izquierda
- Hero: "Conectando el Flujo Digital de la Odontología"
- Dos tarjetas: "Soy Dentista / Clínica" y "Soy Laboratorio / Técnico"
- Footer

Si la landing carga, tu entorno local está OK.

### 4.2 Datos de prueba

```bash
npx tsx frontend/scripts/seed-uat.ts
```

Crea usuarios y casos de prueba.

### 4.3 Apagar al terminar

```bash
# Ctrl+C en la terminal de npm run dev
docker compose stop                          # apaga contenedores conservando datos
# o:
docker compose down -v                       # apaga y BORRA los datos locales
```

---

## 5. Ciclo de trabajo diario

```bash
# 1. Empezar el día sincronizado
git checkout develop
git pull origin develop

# 2. Trabajar en local (editar, npm run dev, probar)

# 3. Ver qué se modificó (resumen rápido)
git diff --stat

# 4. Commit y push
git add -A
git commit -m "feat: descripción breve del cambio"
git push origin develop
```

Convenciones de commit:

- `feat:` nueva funcionalidad
- `fix:` corrección de bug
- `refactor:` reorganización sin cambio de comportamiento
- `docs:` solo documentación
- `perf:` optimización

---

## 6. Validaciones antes de hacer merge a main

Desde `frontend/`:

```bash
npm run lint                  # estilo
npm run type-check            # TypeScript
npm run test:run              # tests unitarios
npm run validate:full         # los 3 anteriores + build (~3 min)
```

Si algo falla, **no** hagas merge a main todavía.

---

## 7. Deploy a staging (develop)

```bash
cd frontend
bash deploy.sh develop
```

> **Asistente gráfico** (alternativa recomendada, sobre todo durante el rollout v5.0):
> `bash deploy-wizard.sh` guía el proceso con un panel por ambiente — elige staging/prod,
> activa o apaga los flags v5.0 y `NOTIFICATIONS_LIVE` **solo para ese deploy** (no toca
> `.env.local`), muestra a qué recursos apunta y avisa si staging enviaría correos reales.
> Es autónomo (no llama a `deploy.sh`). Prueba sin desplegar con `bash deploy-wizard.sh --dry-run`.

El script:

1. Lee `DATABASE_URL_DEV`, `AUTH_URL_DEV`, `NEXT_PUBLIC_APP_URL_DEV` del `.env.local`.
2. Construye la imagen Docker en Cloud Build (~3-5 min).
3. Despliega en Cloud Run servicio `dentflowai-frontend-dev`.
4. Hace un smoke test del landing y muestra la URL.

**Verificación manual tras el deploy**:

1. Abrir la URL devuelta → landing debe cargar (hero visible, logo visible).
2. Ir a `/auth/login` → formulario de login carga.
3. Login con usuario de staging → debe redirigir a `/dashboard`.

---

## 8. Merge a producción

```bash
# 1. En local, mover develop → main
git checkout main
git pull origin main
git merge develop
git push origin main

# 2. Desplegar
cd frontend
bash deploy.sh production
```

El script pide escribir `SI` para confirmar. Tras desplegar:

1. Abrir [https://dentflowai.com](https://dentflowai.com) → landing pública.
2. Probar login real.
3. Volver a `develop` para seguir trabajando:
   ```bash
   git checkout develop
   ```

---

## 9. Rollback en Cloud Run

Si un deploy a producción salió mal:

```bash
# Listar revisiones recientes
gcloud run revisions list \
  --service dentflowai-frontend \
  --region southamerica-west1

# Volver al 100% de tráfico a una revisión anterior
gcloud run services update-traffic dentflowai-frontend \
  --to-revisions=dentflowai-frontend-00042-abc=100 \
  --region southamerica-west1
```

Es instantáneo: Cloud Run mantiene las revisiones anteriores listas para servir.

---

## 10. Variables de entorno — tabla rápida

| Variable | Local (.env.local) | Staging (Cloud Run dev) | Producción (Cloud Run prod) |
|---|---|---|---|
| `DATABASE_URL` | Postgres Docker (`localhost:5432`) | Inyectada desde `DATABASE_URL_DEV` | Inyectada desde `DATABASE_URL_PROD` |
| `AUTH_URL` | `http://localhost:3000` | URL del servicio dev | `https://dentflowai.com` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL del servicio dev | `https://dentflowai.com` |
| `AUTH_SECRET` | Aleatorio local | Mismo que `.env.local` | Mismo que `.env.local` |
| `GCP_BUCKET_NAME` | `dentflowai-local` (fake-gcs) | `dentflowai-assets-dev` | `dentflowai-assets-prod` |
| `RESEND_API_KEY` | `re_123` (stub, no envía) | Real (envía emails) | Real (envía emails) |

> Staging usa `dentflowai-assets-dev` y producción usa `dentflowai-assets-prod`. Ambos buckets están aislados y aplican la misma lifecycle policy ([infra/gcs/lifecycle.json](../infra/gcs/lifecycle.json)). `deploy.sh` lee `GCP_BUCKET_NAME_DEV` o `GCP_BUCKET_NAME_PROD` de `.env.local` según el entorno e inyecta el valor en Cloud Run como `GCP_BUCKET_NAME`.

---

## 11. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Landing en blanco en staging | Build falló o variables faltantes | `gcloud run services logs read dentflowai-frontend-dev --region southamerica-west1 --limit 50` |
| Hero o logo no aparecen | `public/` no se copió en el Docker build | Verificar Dockerfile línea ~46 `COPY --from=builder /app/public ./public` |
| Login redirige a localhost | `AUTH_URL` en Cloud Run apunta a localhost | Actualizar `AUTH_URL_DEV` o `AUTH_URL_PROD` en `.env.local` y redeploy |
| "Database connection refused" en Cloud Run | Cloud SQL no autoriza la IP de Cloud Run | GCP Console → Cloud SQL → Connections → autorizar `0.0.0.0/0` (temporal) o configurar VPC connector |
| `deploy.sh` dice "falta variable" | El `.env.local` no tiene `*_DEV` o `*_PROD` | Completar según `.env.example` |
| Archivos subidos en staging aparecen en bucket de prod (o viceversa) | `GCP_BUCKET_NAME_DEV/PROD` mal configurado en `.env.local`, o falta permiso de la SA de Cloud Run dev sobre `dentflowai-assets-dev` | `grep GCP_BUCKET_NAME frontend/.env.local` y `gsutil iam get gs://dentflowai-assets-dev` — la SA del servicio dev debe tener `objectAdmin` |
| Quiero ver qué tocó Claude antes de commitar | — | `git diff --stat` (resumen) y `git diff` (línea por línea) |

---

## 12. Cron — expiración de invitaciones y evaluación de cotizaciones

El endpoint `GET /api/cron/evaluate-quotes` (ver [frontend/app/api/cron/evaluate-quotes/route.ts](../frontend/app/api/cron/evaluate-quotes/route.ts)) debe invocarse cada 5 min para:
- Marcar como `expired` invitaciones cuyo `expires_at` ya pasó (Countdown 1 de Fauchard).
- Disparar `checkAndExpireInvitationsAction`, que reevalúa cotizaciones del caso y construye la propuesta si corresponde.

Protección: header `Authorization: Bearer ${CRON_SECRET}`. Si la env var no está seteada, el endpoint queda abierto (NO recomendado en prod).

### Configurar Cloud Scheduler (una vez por entorno)

```bash
# Producción
gcloud scheduler jobs create http evaluate-quotes-prod \
  --location=southamerica-west1 \
  --schedule="*/5 * * * *" \
  --uri="https://dentflowai.com/api/cron/evaluate-quotes" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET_PROD}" \
  --project=dentflowai-cbcf2

# Staging (opcional — útil para QA de Fauchard end-to-end)
gcloud scheduler jobs create http evaluate-quotes-dev \
  --location=southamerica-west1 \
  --schedule="*/5 * * * *" \
  --uri="https://dentflowai-frontend-dev-1063035185653.southamerica-west1.run.app/api/cron/evaluate-quotes" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET_DEV}" \
  --project=dentflowai-cbcf2
```

`CRON_SECRET` se define en `.env.local` (una por entorno; `deploy.sh` lo inyecta como `CRON_SECRET` en Cloud Run). Para rotar: generar nuevo valor (`openssl rand -hex 32`), actualizar `.env.local`, redeploy, actualizar header del job: `gcloud scheduler jobs update http evaluate-quotes-prod --update-headers="Authorization=Bearer <nuevo>"`.

#### Crons del modelo de disponibilidad (v5.0 — solo cuando `AVAILABILITY_MODEL_ENABLED=true`)

Dos jobs adicionales por entorno (usan `--http-method=POST` y el mismo `CRON_SECRET`):

```bash
# process-availability: cada hora (expira no-respuestas, auto-OFF preventivo, recordatorio)
gcloud scheduler jobs create http process-availability-prod \
  --location=southamerica-west1 \
  --schedule="0 * * * *" \
  --uri="https://dentflowai.com/api/cron/process-availability" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET_PROD}" \
  --attempt-deadline=120s \
  --project=dentflowai-cbcf2

# process-pool-queue: cada 2 min (reevaluación asignación + check-in 50% TTL + expiración/re-encole)
gcloud scheduler jobs create http process-pool-queue-prod \
  --location=southamerica-west1 \
  --schedule="*/2 * * * *" \
  --uri="https://dentflowai.com/api/cron/process-pool-queue" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET_PROD}" \
  --attempt-deadline=60s \
  --project=dentflowai-cbcf2
```

Para staging: mismos 2 jobs apuntando a `https://dentflowai-frontend-dev-…run.app` con `CRON_SECRET_DEV`. En local no corren solos; probar con `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-availability`. Rollback: `gcloud scheduler jobs pause/delete` (no requiere redeploy); el código permanece inerte con el flag off.

#### Cron del motor de ligas (Fase 2 — solo cuando `LEAGUE_ENGINE_ENABLED=true`)

Un job adicional por entorno, **diario** (POST, mismo `CRON_SECRET`). Evalúa ascenso/transición/descenso de cada técnico; idempotente e inerte con el flag off.

```bash
# process-league: diario a las 04:00 (ascenso/transición/descenso de ligas)
gcloud scheduler jobs create http process-league-prod \
  --location=southamerica-west1 \
  --schedule="0 4 * * *" \
  --uri="https://dentflowai.com/api/cron/process-league" \
  --http-method=POST \
  --headers="Authorization=Bearer ${CRON_SECRET_PROD}" \
  --attempt-deadline=300s \
  --project=dentflowai-cbcf2

# Staging: mismo job apuntando a https://dentflowai-frontend-dev-…run.app con CRON_SECRET_DEV.
```

**En local sí corre solo**: a diferencia de los crons v5.0, el de ligas se dispara también en local mediante un scheduler in-process ([frontend/instrumentation.ts](../frontend/instrumentation.ts) → [frontend/lib/localCron.ts](../frontend/lib/localCron.ts)) que arranca con `npm run dev`. Solo opera fuera de producción (nunca con `NODE_ENV=production`, que es lo que corre en Cloud Run). Controles en `.env.local`: `LOCAL_CRONS_ENABLED=false` lo apaga; `LOCAL_LEAGUE_CRON_INTERVAL_MS` ajusta el intervalo local (default 1h). También se puede invocar a mano: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/process-league`. Rollback en dev/prod: `gcloud scheduler jobs pause/delete` o apagar `LEAGUE_ENGINE_ENABLED`.

#### Aislamiento por ambiente — EmailJS, flags y secretos

EmailJS es **una sola cuenta** y el clon inicial prod→staging (`clone-prod-to-staging.sh`, ejecutado **una única vez** al montar staging — **no** es una operación recurrente) dejó usuarios reales en la BD de staging. Por eso, y porque cualquier correo desde staging saldría desde la misma cuenta EmailJS que producción, hay que mantener los controles de envío. Controles disponibles (todos retrocompatibles con la clave plana):

- **`NOTIFICATIONS_LIVE`** (interruptor maestro de envío real): `notifyUser` solo envía si vale `true`; en cualquier otro caso loguea sin enviar **aunque** haya credenciales EmailJS. Dejar `false` en local/staging, `true` solo en prod. `deploy.sh` lo muestra en el resumen y **avisa** si se deploya staging con `NOTIFICATIONS_LIVE=true`.
- **Override por ambiente**: `deploy.sh` lee `<VAR>_DEV` / `<VAR>_PROD` y cae a `<VAR>` plana si no existe — aplica a `NOTIFICATIONS_LIVE`, `CRON_SECRET` y los 5 flags `AVAILABILITY_*` / `REJECTION_INDIVIDUAL_ENABLED` / `POOL_PENDIENTE_ENABLED`. Ejemplo para encender el modelo en staging sin tocar prod:
  ```bash
  # en .env.local
  AVAILABILITY_MODEL_ENABLED_DEV=true
  AVAILABILITY_MODEL_ENABLED_PROD=false
  NOTIFICATIONS_LIVE_DEV=false      # staging silenciado
  NOTIFICATIONS_LIVE_PROD=true      # prod envía real
  ```
  Sin sufijos, la clave plana se usa para ambos ambientes (comportamiento anterior).

> **Estado actual (pre-lanzamiento).** Mientras producción no tenga usuarios reales, los flags `AVAILABILITY_MODEL_ENABLED` y secundarios se tratan así: **ON en staging/test** (`*_DEV=true`) para que los usuarios de prueba ejerciten el modelo v5.0, y **la decisión en producción se posterga al día del estreno** (`*_PROD=false` hasta entonces). El control de prod sigue siendo "no desplegar lo que no quieras allí"; el flag solo da el control fino de qué corre en test **desde la misma rama `main`**, sin mantener una rama paralela divergente. Recién cuando prod tenga usuarios el flag cumple su rol de kill-switch en caliente (ver §9 y §14).

---

## 13. Mantenimiento periódico

- **Mensual**: revisar costos en GCP Console → Billing. La instancia de staging cuesta ~$10/mes.
- **Pausar staging si no se usa**: `bash scripts/GCPControl.sh` (toca activation policy).
- **Backups**: Cloud SQL hace backup diario a las 03:00 (configurado en `setup-staging-db.sh` y en la instancia de producción).

## 14. Rollback del modelo de disponibilidad (v5.0)

El modelo de disponibilidad vive detrás de feature flags (`AVAILABILITY_MODEL_ENABLED` + secundarios). Rollback:

- **Inmediato (sin redeploy de código)**: poner los flags a `false` en `.env.local` y re-inyectarlos en Cloud Run (`bash deploy.sh production` con las vars en `false`, o `gcloud run services update --update-env-vars AVAILABILITY_MODEL_ENABLED=false,...`). **Reiniciar la instancia** (los flags se leen al arrancar el proceso, no es hot-reload; ~30s de switching). Fauchard vuelve al comportamiento previo (exclusión binaria `consecutiveNoResponse >= 3` + score viejo); las tablas v5.x quedan en BD pero sin uso.
- **Completo (con deploy)**: revertir el merge en `develop`/`main` y redeploy. Las tablas nuevas permanecen (no se borran automáticamente; DDL inverso documentado en el plan, solo si se retira el feature definitivamente).
- **Crons**: pausar/eliminar los jobs de Cloud Scheduler (`process-availability`, `process-pool-queue`) no requiere redeploy; con el flag off las actions ya retornan `skipped`.
