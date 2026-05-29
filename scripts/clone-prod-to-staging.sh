#!/bin/bash
# DentFlowAi — Clonar BD de producción a staging (Cloud SQL → Cloud SQL vía GCS)
#
# Sobreescribe la BD `dentflowai_dev` en la instancia `dentflowai-psql-dev`
# con un snapshot completo de `dentflowai-cbcf2-database` (prod). Incluye
# usuarios, passwordHash, casos, eventos, todo.
#
# Uso:
#   bash scripts/clone-prod-to-staging.sh             # interactivo
#   bash scripts/clone-prod-to-staging.sh --yes       # sin confirmación
#   bash scripts/clone-prod-to-staging.sh --dry-run   # imprime comandos sin ejecutar
#   bash scripts/clone-prod-to-staging.sh --keep-dump # no borra el .sql.gz tras import
#
# Requisitos:
#   - roles/cloudsql.admin + roles/storage.admin en el proyecto.
#   - psql instalado localmente (brew install postgresql) para el reset de schema.
#   - frontend/.env.local con DATABASE_URL_DEV definido.

set -euo pipefail

# ─── Constantes ──────────────────────────────────────────────────────────────
PROJECT_ID="dentflowai-cbcf2"

PROD_INSTANCE="dentflowai-cbcf2-instance"
PROD_DB="dentflowai-cbcf2-database"

DEV_INSTANCE="dentflowai-psql-dev"
DEV_DB="dentflowai_dev"
DEV_USER="dentflow_admin"

BUCKET="gs://dentflowai-assets-prod"
DUMP_PREFIX="backups/db-clones"
TS="$(date +%Y%m%d-%H%M%S)"
DUMP_PATH="${BUCKET}/${DUMP_PREFIX}/prod-${TS}.sql.gz"

# ─── Flags ───────────────────────────────────────────────────────────────────
SKIP_CONFIRM=0
DRY_RUN=0
KEEP_DUMP=0
for arg in "$@"; do
  case "$arg" in
    --yes)       SKIP_CONFIRM=1 ;;
    --dry-run)   DRY_RUN=1 ;;
    --keep-dump) KEEP_DUMP=1 ;;
    *) echo "ERROR: flag desconocido: $arg" >&2; exit 1 ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────
CURRENT_STEP="(init)"
trap 'echo ""; echo "✗ Script abortado en paso: ${CURRENT_STEP}" >&2' ERR

run() {
  echo "  → $*"
  if [[ $DRY_RUN -eq 0 ]]; then
    eval "$@"
  fi
}

step() {
  CURRENT_STEP="$1"
  echo ""
  echo "─── $1 ───"
}

# ─── 1. Sanity check de gcloud ───────────────────────────────────────────────
step "Verificando configuración gcloud"
ACTIVE_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
if [[ "$ACTIVE_PROJECT" != "$PROJECT_ID" ]]; then
  echo "ERROR: gcloud está en proyecto '${ACTIVE_PROJECT}', se esperaba '${PROJECT_ID}'." >&2
  echo "  Ejecuta: gcloud config set project ${PROJECT_ID}" >&2
  exit 1
fi
echo "  ✓ Proyecto activo: ${PROJECT_ID}"

# Necesitamos psql + DATABASE_URL_DEV para el reset del schema (paso 5).
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql no está instalado. Instala con: brew install postgresql" >&2
  exit 1
fi
ENV_FILE="$(dirname "$0")/../frontend/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no encuentro ${ENV_FILE}" >&2
  exit 1
fi
DATABASE_URL_DEV=$(grep -E '^DATABASE_URL_DEV=' "$ENV_FILE" | head -1 | cut -d= -f2-)
if [[ -z "$DATABASE_URL_DEV" ]]; then
  echo "ERROR: DATABASE_URL_DEV no definido en ${ENV_FILE}" >&2
  exit 1
fi
echo "  ✓ psql + DATABASE_URL_DEV listos"

# ─── 2. Confirmación destructiva ─────────────────────────────────────────────
if [[ $SKIP_CONFIRM -eq 0 && $DRY_RUN -eq 0 ]]; then
  step "Confirmación"
  cat <<EOF
Vas a EJECUTAR un clone completo:
  ORIGEN:  ${PROD_INSTANCE} / ${PROD_DB}
  DESTINO: ${DEV_INSTANCE} / ${DEV_DB}  (será BORRADA y recreada)

La BD de staging contendrá emails, passwordHash y datos clínicos REALES
de producción. Asegúrate de que esto es lo que quieres.

EOF
  read -r -p "Escribe CLONAR para continuar: " CONFIRM
  if [[ "$CONFIRM" != "CLONAR" ]]; then
    echo "Cancelado."
    exit 0
  fi
fi

# ─── 3. Permisos de los SAs sobre el bucket ──────────────────────────────────
step "Otorgando permisos a los Service Accounts de Cloud SQL"
SA_PROD=$(gcloud sql instances describe "$PROD_INSTANCE" \
  --project="$PROJECT_ID" --format="value(serviceAccountEmailAddress)")
SA_DEV=$(gcloud sql instances describe "$DEV_INSTANCE" \
  --project="$PROJECT_ID" --format="value(serviceAccountEmailAddress)")
echo "  SA prod:    ${SA_PROD}"
echo "  SA staging: ${SA_DEV}"
run "gsutil iam ch \"serviceAccount:${SA_PROD}:objectAdmin\" ${BUCKET}"
run "gsutil iam ch \"serviceAccount:${SA_DEV}:objectViewer\" ${BUCKET}"

# ─── 4. Export prod → GCS ────────────────────────────────────────────────────
step "Exportando ${PROD_DB} → ${DUMP_PATH}"
# Nota: NO usamos --offload porque el tier de prod ("No Cost Trial for Firebase
# Data Connect") no lo permite. El export corre contra la instancia primaria;
# Cloud SQL toma un snapshot consistente sin bloquear escrituras, pero puede
# generar carga moderada. Ejecutar en off-peak si es necesario.
run "gcloud sql export sql ${PROD_INSTANCE} ${DUMP_PATH} \
  --database=${PROD_DB} --quiet --project=${PROJECT_ID}"

# ─── 5. Reset del schema public en staging ───────────────────────────────────
# No borramos la DB (rompería conexiones de Cloud Run staging). En su lugar
# DROP SCHEMA public CASCADE elimina todas las tablas, secuencias, tipos, etc.
# El dump de prod incluirá los CREATE TABLE necesarios al importar.
step "Reseteando schema public en ${DEV_DB}"
RESET_SQL="DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO ${DEV_USER}; GRANT ALL ON SCHEMA public TO public;"
if [[ $DRY_RUN -eq 0 ]]; then
  echo "  → psql DATABASE_URL_DEV -c \"${RESET_SQL}\""
  psql "$DATABASE_URL_DEV" -v ON_ERROR_STOP=1 -c "$RESET_SQL"
else
  echo "  → psql DATABASE_URL_DEV -c \"${RESET_SQL}\""
fi

# ─── 6. Import → staging ─────────────────────────────────────────────────────
step "Importando dump → ${DEV_INSTANCE}/${DEV_DB}"
run "gcloud sql import sql ${DEV_INSTANCE} ${DUMP_PATH} \
  --database=${DEV_DB} --user=${DEV_USER} --quiet --project=${PROJECT_ID}"

# ─── 7. Limpieza del dump ────────────────────────────────────────────────────
if [[ $KEEP_DUMP -eq 0 ]]; then
  step "Borrando dump intermedio"
  run "gsutil rm ${DUMP_PATH}"
else
  echo ""
  echo "  Dump preservado en: ${DUMP_PATH}"
fi

# ─── 8. Banner final ─────────────────────────────────────────────────────────
CURRENT_STEP="(done)"
cat <<EOF

======================================================
✓ Clone prod → staging completado.

ADVERTENCIAS:
  • Staging ahora contiene PII real (emails, passwordHash).
  • Las URLs de archivos en DB apuntan al bucket de PROD.
    Lectura OK desde staging; NO escribir/borrar.
  • Si NEXTAUTH_SECRET difiere entre entornos, todos los
    usuarios deberán re-loguearse en staging (esperado).

VERIFICACIÓN MANUAL SUGERIDA:
  psql "\$DATABASE_URL_DEV" -c '
    SELECT
      (SELECT count(*) FROM "user")        AS users,
      (SELECT count(*) FROM clinical_case) AS cases,
      (SELECT count(*) FROM organization)  AS orgs;'

======================================================
EOF
