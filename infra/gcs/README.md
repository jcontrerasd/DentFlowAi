# GCS — Lifecycle policy

Reglas para los buckets `dentflowai-assets-prod` (producción) y `dentflowai-assets-dev` (staging). Ambos usan la misma policy (`lifecycle.json`).

| Entorno | Bucket | Cloud Run |
|---|---|---|
| Producción | `dentflowai-assets-prod` | `dentflowai-frontend` |
| Staging | `dentflowai-assets-dev` | `dentflowai-frontend-dev` |

`deploy.sh` inyecta `GCP_BUCKET_NAME` con el valor correcto según `ENV_TARGET` (lee `GCP_BUCKET_NAME_DEV` o `GCP_BUCKET_NAME_PROD` de `.env.local`).

## Cómo opera

La app marca cada archivo de un caso con metadata `customTime` cuando el caso
transiciona a estado terminal (`completado`, `disenoAprobado`, `cerrado`).
Ver `frontend/lib/db/archiveCaseFiles.ts`.

La lifecycle policy del bucket lee ese `customTime` y migra el objeto a clases
más baratas conforme pasa el tiempo:

- 30 días → Nearline
- 120 días → Coldline
- 365 días → Archive

Además, aborta uploads multipart incompletos a los 7 días para liberar espacio.

Cada bucket es independiente: una transición o `customTime` aplicado en
`-dev` **no** afecta objetos de `-prod` (y viceversa).

## Aplicar

```bash
# Producción
gsutil lifecycle set infra/gcs/lifecycle.json gs://dentflowai-assets-prod
gsutil lifecycle get gs://dentflowai-assets-prod

# Staging
gsutil lifecycle set infra/gcs/lifecycle.json gs://dentflowai-assets-dev
gsutil lifecycle get gs://dentflowai-assets-dev
```

## Crear bucket de staging (one-time)

```bash
gsutil mb -p dentflowai-cbcf2 -c STANDARD -l southamerica-west1 -b on gs://dentflowai-assets-dev
gsutil lifecycle set infra/gcs/lifecycle.json gs://dentflowai-assets-dev
# Replicar CORS desde prod (la config no vive en el repo)
gsutil cors get gs://dentflowai-assets-prod > /tmp/cors.json
gsutil cors set /tmp/cors.json gs://dentflowai-assets-dev
# Permisos para la service account de Cloud Run dev
gsutil iam ch serviceAccount:<SA>@dentflowai-cbcf2.iam.gserviceaccount.com:objectAdmin gs://dentflowai-assets-dev
```

## Rollout sugerido

1. Aplicar solo la regla Standard → Nearline y `AbortIncompleteMultipartUpload`.
2. Tras 1–2 semanas sin alertas de retrieval, añadir Coldline.
3. Más adelante, añadir Archive.
