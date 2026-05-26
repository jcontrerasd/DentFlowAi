# GCS — Lifecycle policy

Reglas para el bucket `dentflowai-assets-prod` (env `GCP_BUCKET_NAME`).

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

## Aplicar

```bash
gsutil lifecycle set infra/gcs/lifecycle.json gs://dentflowai-assets-prod
gsutil lifecycle get gs://dentflowai-assets-prod
```

## Rollout sugerido

1. Aplicar solo la regla Standard → Nearline y `AbortIncompleteMultipartUpload`.
2. Tras 1–2 semanas sin alertas de retrieval, añadir Coldline.
3. Más adelante, añadir Archive.
