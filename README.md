# DentFlowAi

Plataforma clínica/laboratorio con frontend en Next.js y backend de datos en Firebase (Auth, Storage y Data Connect).

## Arquitectura actual

- Frontend: Next.js App Router (TypeScript)
- Identidad: Firebase Authentication
- Datos de negocio: Firebase Data Connect
- Base de datos de Data Connect: Cloud SQL PostgreSQL (`dentflowai-psql`)
- Archivos 3D e imágenes: Firebase Storage
- Herramientas admin: scripts Python (`scripts/toolkit.py`, `scripts/toolkit_gui.py`)

## Base de datos

La base de datos NO está en Docker.

Data Connect está configurado para usar Cloud SQL:

- Archivo: `firebase/dataconnect/dataconnect.yaml`
- Instancia: `dentflowai-psql`
- Base: `dentflowai`

## Ejecución local

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Validaciones recomendadas antes de merge

```bash
cd frontend
npm run lint
npm run type-check
npm run build
npm run test:run
```

### Docker mínimo

Por defecto, `docker-compose.yml` levanta solo el frontend.

```bash
docker compose up --build
```

### Herramientas Firebase (manual)

El servicio `firebase-manager` quedó como perfil opcional `tools`.

```bash
docker compose --profile tools run --rm firebase-manager sh
```

### Toolkits Python (entorno estandarizado)

```bash
cd scripts
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Ejecución CLI:

```bash
cd scripts
source .venv/bin/activate
python toolkit.py --list
```

Ejecución GUI:

```bash
cd scripts
source .venv/bin/activate
streamlit run toolkit_gui.py
```

## Seguridad operativa

- Mantener la service account fuera del workspace y del repositorio.
- Usar `FIREBASE_CREDENTIALS_PATH` y `FIREBASE_CREDENTIALS_PATH_HOST` apuntando a una ruta externa al proyecto.
- Habilitar modo admin explícito para toolkits con `DENTFLOW_ADMIN_SECRET` (>=16 chars).
- Habilitar operaciones destructivas en toolkit GUI solo cuando sea estrictamente necesario con `DENTFLOW_ALLOW_DESTRUCTIVE=true`.
- Revisar y desplegar reglas de `firebase/storage.rules` y `firebase/dataconnect/default-connector/*.gql` tras cambios.
- Para observabilidad frontend en producción, definir `NEXT_PUBLIC_LOG_ENDPOINT` (por defecto `/api/telemetry`).
- Configurar `TELEMETRY_ALLOWED_ORIGINS` (lista separada por comas) para restringir origenes válidos de telemetría.
- Ajustar `TELEMETRY_RATE_LIMIT_PER_MINUTE` según volumen esperado.
- Activar reglas de borde (WAF/CDN/bot management) para bloquear abuso automatizado antes de llegar al backend.

### Endpoint de telemetría (seguro)

El endpoint interno `POST /api/telemetry` aplica:

- Validación de origen (`Origin`/`Referer`) y contexto (`Sec-Fetch-Site`) con allowlist configurable.
- Rate limit por IP en ventana de 1 minuto.
- Validación estricta de schema y tamaño de payload.
- Redacción automática en servidor de emails, bearer tokens, claves Firebase y llaves privadas.
- Firma SHA-256 opcional para integraciones server-to-server (`TELEMETRY_INGEST_TOKEN` + `X-Telemetry-Timestamp` + `X-Telemetry-Signature`).

### Sincronización de claims (obligatorio para Storage Rules por organización)

```bash
cd scripts
python toolkit.py --sync-claims
```

También se puede sincronizar un UID puntual:

```bash
cd scripts
python toolkit.py --sync-claims-uid <UID>
```

Claims aplicados: `role`, `organizationId`, `admin`.

### Deploy manual de seguridad Firebase

```bash
firebase deploy --only storage,dataconnect --project dentflowai-cbcf2
```

## CI/CD mínima

- Workflow: `.github/workflows/frontend-ci.yml`
- Trigger: `push` (main/master) y `pull_request` sobre cambios en `frontend/**`
- Pipeline: `lint` -> `type-check` -> `build` -> `test:run`

## Política de versionado de tooling

- El contenedor Firebase usa imagen oficial versionada de Google Cloud SDK (`infra/Dockerfile.firebase`).
- `firebase-tools` se mantiene pinneado por `FIREBASE_TOOLS_VERSION`.
- Las actualizaciones de tooling se hacen por PR dedicado con evidencia de compatibilidad (`lint`, `type-check`, `build`, `test:run`).

## Upgrades mayores de toolchain

- Para upgrades mayores (ej. TypeScript, jsdom, `@types/node`), abrir PR dedicado aislado.
- Ejecutar siempre la matriz completa con `cd frontend && npm run validate:full`.
- Incluir ajustes de tipos/config en el mismo PR y documentar impacto de compatibilidad.
- Mantener separados los cambios funcionales de producto para evitar regresiones silenciosas.

## Mantenimiento de deuda técnica

- Tipado 3D: mantener supresiones centralizadas en `frontend/lib/three-loaders.ts`.
- Revisar trimestralmente si Three.js expone typings estables para loaders y retirar supresiones cuando sea viable.
- Código no usado: ejecutar auditoría periódica con `cd frontend && npm run audit:unused` antes de releases y eliminar únicamente hallazgos confirmados.
- El baseline de knip ignora artefactos generados de Data Connect y excluye categorías de exports/tipos públicos deliberados para mantener reportes accionables.

## Troubleshooting rápido

- Si scripts Python no encuentran credenciales: exportar `FIREBASE_CREDENTIALS_PATH` con la ruta externa del JSON de servicio.
- Si el contenedor de herramientas no levanta: usar `docker compose --profile tools run --rm firebase-manager sh`.
- Si cambian operaciones Data Connect: regenerar SDK del frontend y re-ejecutar `npm run type-check`.
