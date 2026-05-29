#!/bin/bash
# DentFlowAi — Crear instancia Cloud SQL de staging (one-time)
#
# Costo aprox: ~10 USD/mes (db-f1-micro, 10GB HDD, zonal).
# Solo se ejecuta UNA vez para crear la BD de develop. Después no se vuelve a tocar.
#
# Uso:
#   export DB_PASS=$(openssl rand -base64 24)
#   bash scripts/setup-staging-db.sh

set -euo pipefail

PROJECT_ID="dentflowai-cbcf2"
REGION="southamerica-west1"
INSTANCE_NAME="dentflowai-psql-dev"
DB_NAME="dentflowai_dev"
DB_USER="dentflow_admin"

if [[ -z "${DB_PASS:-}" ]]; then
  echo "ERROR: define DB_PASS antes de ejecutar."
  echo "  export DB_PASS=\$(openssl rand -base64 24)"
  exit 1
fi

echo ">> Creando instancia Cloud SQL '${INSTANCE_NAME}' en ${REGION}..."
gcloud sql instances create "${INSTANCE_NAME}" \
  --database-version=POSTGRES_16 \
  --edition=ENTERPRISE \
  --tier=db-f1-micro \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --root-password="${DB_PASS}" \
  --storage-size=10GB \
  --storage-type=HDD \
  --availability-type=zonal \
  --backup-start-time=03:00

echo ">> Creando base de datos '${DB_NAME}'..."
gcloud sql databases create "${DB_NAME}" \
  --instance="${INSTANCE_NAME}" \
  --project="${PROJECT_ID}"

echo ">> Creando usuario '${DB_USER}'..."
gcloud sql users create "${DB_USER}" \
  --instance="${INSTANCE_NAME}" \
  --password="${DB_PASS}" \
  --project="${PROJECT_ID}"

echo ">> Obteniendo IP pública..."
DB_IP=$(gcloud sql instances describe "${INSTANCE_NAME}" \
  --project="${PROJECT_ID}" \
  --format="value(ipAddresses[0].ipAddress)")

cat <<EOF

======================================================
BD de staging creada. Agrega esto a frontend/.env.local:

DATABASE_URL_DEV=postgresql://${DB_USER}:${DB_PASS}@${DB_IP}:5432/${DB_NAME}

======================================================

PASO MANUAL siguiente:
  GCP Console → Cloud SQL → ${INSTANCE_NAME} → Connections →
  Authorized networks: agregar tu IP y, temporalmente, 0.0.0.0/0 para que
  Cloud Run pueda conectarse. (Para producción usar VPC connector).

EOF
