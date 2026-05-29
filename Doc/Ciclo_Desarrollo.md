# Ciclo de Desarrollo — DentFlowAi

Guía paso a paso del flujo de trabajo: desde tu máquina local hasta producción. Pensada para que cualquier persona del equipo, sin experiencia previa en GCP o Docker, pueda operar el ciclo completo.

---

## 1. Visión general

```
┌──────────────┐   git push    ┌──────────────┐   bash deploy.sh develop   ┌──────────────────┐
│   LOCAL      │ ────────────▶ │  rama develop│ ────────────────────────▶  │  STAGING         │
│ (tu equipo)  │               │  en GitHub   │                            │  Cloud Run dev   │
└──────────────┘               └──────┬───────┘                            │  + Cloud SQL dev │
                                      │ merge                              └──────────────────┘
                                      ▼
                               ┌──────────────┐   bash deploy.sh production
                               │  rama main   │ ────────────────────────▶  ┌──────────────────┐
                               │  en GitHub   │                            │  PRODUCCIÓN      │
                               └──────────────┘                            │  Cloud Run prod  │
                                                                           │  + Cloud SQL prod│
                                                                           └──────────────────┘
```

**Reglas de oro**:

- Nunca trabajas directo en `main`. `main` = lo que está en `dentflowai.com`.
- Toda feature nueva pasa por `develop` y se prueba en staging antes de ir a producción.
- Las BD de staging y producción están **completamente separadas**. Modificar datos en una no afecta a la otra.

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
- `DATABASE_URL_DEV`, `AUTH_URL_DEV`, `NEXT_PUBLIC_APP_URL_DEV` → se llenan tras crear staging (paso 3.4)
- `DATABASE_URL_PROD`, `AUTH_URL_PROD`, `NEXT_PUBLIC_APP_URL_PROD` → se llenan tras el primer deploy a prod (o ya están si las tienes)

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
| `GCP_BUCKET_NAME` | `dentflowai-local` (fake-gcs) | `dentflowai-assets-prod` | `dentflowai-assets-prod` |
| `RESEND_API_KEY` | `re_123` (stub, no envía) | Real (envía emails) | Real (envía emails) |

> Hoy staging y prod comparten bucket GCS. Si en el futuro quieres separar, crea `dentflowai-assets-dev` y agrega `GCP_BUCKET_NAME_DEV` en `.env.local` y en `deploy.sh`.

---

## 11. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Landing en blanco en staging | Build falló o variables faltantes | `gcloud run services logs read dentflowai-frontend-dev --region southamerica-west1 --limit 50` |
| Hero o logo no aparecen | `public/` no se copió en el Docker build | Verificar Dockerfile línea ~46 `COPY --from=builder /app/public ./public` |
| Login redirige a localhost | `AUTH_URL` en Cloud Run apunta a localhost | Actualizar `AUTH_URL_DEV` o `AUTH_URL_PROD` en `.env.local` y redeploy |
| "Database connection refused" en Cloud Run | Cloud SQL no autoriza la IP de Cloud Run | GCP Console → Cloud SQL → Connections → autorizar `0.0.0.0/0` (temporal) o configurar VPC connector |
| `deploy.sh` dice "falta variable" | El `.env.local` no tiene `*_DEV` o `*_PROD` | Completar según `.env.example` |
| Quiero ver qué tocó Claude antes de commitar | — | `git diff --stat` (resumen) y `git diff` (línea por línea) |

---

## 12. Mantenimiento periódico

- **Mensual**: revisar costos en GCP Console → Billing. La instancia de staging cuesta ~$10/mes.
- **Pausar staging si no se usa**: `bash scripts/GCPControl.sh` (toca activation policy).
- **Backups**: Cloud SQL hace backup diario a las 03:00 (configurado en `setup-staging-db.sh` y en la instancia de producción).
