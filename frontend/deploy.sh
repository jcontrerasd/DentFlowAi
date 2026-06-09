#!/bin/bash
# DentFlowAi — Deploy a Cloud Run (Santiago)
# Uso: bash deploy.sh [develop|production]
#
# Lee variables de .env.local según entorno e inyecta en Cloud Run.
# El servicio dev y el de prod son independientes; cada uno con su BD.

set -euo pipefail

ENV_TARGET="${1:-}"
PROJECT_ID="dentflowai-cbcf2"
REGION="southamerica-west1"
ENV_FILE=".env.local"

usage() {
  cat <<EOF
Uso: bash deploy.sh [develop|production]

  develop     Despliega a 'dentflowai-frontend-dev' (staging)
  production  Despliega a 'dentflowai-frontend' (producción, requiere confirmación)

Requisitos:
  - Estar autenticado en gcloud (gcloud auth login)
  - Tener $ENV_FILE con las variables del entorno objetivo
EOF
}

if [[ "$ENV_TARGET" != "develop" && "$ENV_TARGET" != "production" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: no se encontró $ENV_FILE en el directorio actual ($(pwd))."
  exit 1
fi

# Helper: lee una variable del .env.local (preserva '=' en el valor)
read_env() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$ENV_FILE" | head -n1 || true)
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  echo "${line#*=}" | sed -E 's/^"(.*)"$/\1/'
}

# Lee una variable con override por ambiente: prueba VAR_<SUFFIX> (p.ej.
# AVAILABILITY_MODEL_ENABLED_PROD) y cae a la VAR plana (compartida) si no existe.
# Permite encender flags / cambiar secretos por ambiente sin tocar .env.local entre
# deploys, manteniendo retrocompatibilidad con las claves planas existentes.
read_env_scoped() {
  local base="$1"
  local v
  v=$(read_env "${base}_${SUFFIX}")
  [[ -z "$v" ]] && v=$(read_env "$base")
  echo "$v"
}

# Configuración por entorno
if [[ "$ENV_TARGET" == "develop" ]]; then
  SERVICE_NAME="dentflowai-frontend-dev"
  IMAGE_TAG="develop"
  SUFFIX="DEV"
  DATABASE_URL=$(read_env DATABASE_URL_DEV)
  AUTH_URL=$(read_env AUTH_URL_DEV)
  NEXT_PUBLIC_APP_URL=$(read_env NEXT_PUBLIC_APP_URL_DEV)
  GCP_BUCKET_NAME=$(read_env GCP_BUCKET_NAME_DEV)
else
  SERVICE_NAME="dentflowai-frontend"
  IMAGE_TAG="latest"
  SUFFIX="PROD"
  DATABASE_URL=$(read_env DATABASE_URL_PROD)
  AUTH_URL=$(read_env AUTH_URL_PROD)
  NEXT_PUBLIC_APP_URL=$(read_env NEXT_PUBLIC_APP_URL_PROD)
  GCP_BUCKET_NAME=$(read_env GCP_BUCKET_NAME_PROD)
fi

# Variables comunes
AUTH_SECRET=$(read_env AUTH_SECRET)
GCP_PROJECT_ID=$(read_env GCP_PROJECT_ID)
RESEND_API_KEY=$(read_env RESEND_API_KEY)
NOTIFICATION_FROM_EMAIL=$(read_env NOTIFICATION_FROM_EMAIL)
CRON_SECRET=$(read_env_scoped CRON_SECRET)
# Interruptor maestro de envío real de correos (seguridad por ambiente). Si no es
# 'true', notifyUser loguea sin enviar aunque haya credenciales EmailJS. Por defecto
# se deja apagado en develop/staging (datos clonados de prod) y on solo en producción.
NOTIFICATIONS_LIVE=$(read_env_scoped NOTIFICATIONS_LIVE)
# EmailJS (transport email v5.0 — reemplaza Resend gradualmente). Cuenta compartida.
EMAILJS_SERVICE_ID=$(read_env EMAILJS_SERVICE_ID)
EMAILJS_TEMPLATE_ID=$(read_env EMAILJS_TEMPLATE_ID)
EMAILJS_PUBLIC_KEY=$(read_env EMAILJS_PUBLIC_KEY)
EMAILJS_PRIVATE_KEY=$(read_env EMAILJS_PRIVATE_KEY)
# Feature flags — Modelo de disponibilidad (v5.0). Override por ambiente con sufijo
# _DEV/_PROD (p.ej. AVAILABILITY_MODEL_ENABLED_PROD); cae a la clave plana si no existe.
AVAILABILITY_MODEL_ENABLED=$(read_env_scoped AVAILABILITY_MODEL_ENABLED)
AVAILABILITY_UI_TECNICO_ENABLED=$(read_env_scoped AVAILABILITY_UI_TECNICO_ENABLED)
AVAILABILITY_ADMIN_PANEL_ENABLED=$(read_env_scoped AVAILABILITY_ADMIN_PANEL_ENABLED)
REJECTION_INDIVIDUAL_ENABLED=$(read_env_scoped REJECTION_INDIVIDUAL_ENABLED)
POOL_PENDIENTE_ENABLED=$(read_env_scoped POOL_PENDIENTE_ENABLED)
# Motor de ligas (Fase 2).
LEAGUE_ENGINE_ENABLED=$(read_env_scoped LEAGUE_ENGINE_ENABLED)

# Validar requeridas (AUTH_URL y NEXT_PUBLIC_APP_URL pueden estar vacías
# en el primer deploy — se completan después con la URL real del servicio).
missing=()
[[ -z "$DATABASE_URL" ]]            && missing+=("DATABASE_URL_${SUFFIX}")
[[ -z "$AUTH_SECRET" ]]             && missing+=("AUTH_SECRET")
[[ -z "$GCP_PROJECT_ID" ]]          && missing+=("GCP_PROJECT_ID")
[[ -z "$GCP_BUCKET_NAME" ]]         && missing+=("GCP_BUCKET_NAME_${SUFFIX}")
# Email: requerimos EmailJS (transport actual). Resend queda deprecado y opcional
# hasta que Fase 2 retire el código que lo consume.
[[ -z "$EMAILJS_SERVICE_ID" ]]      && missing+=("EMAILJS_SERVICE_ID")
[[ -z "$EMAILJS_TEMPLATE_ID" ]]     && missing+=("EMAILJS_TEMPLATE_ID")
[[ -z "$EMAILJS_PUBLIC_KEY" ]]      && missing+=("EMAILJS_PUBLIC_KEY")
[[ -z "$EMAILJS_PRIVATE_KEY" ]]     && missing+=("EMAILJS_PRIVATE_KEY")

# Aviso de bootstrap (primer deploy sin URL aún)
BOOTSTRAP_MODE=false
if [[ -z "$AUTH_URL" || -z "$NEXT_PUBLIC_APP_URL" ]]; then
  BOOTSTRAP_MODE=true
  if [[ "$ENV_TARGET" == "production" ]]; then
    missing+=("AUTH_URL_PROD" "NEXT_PUBLIC_APP_URL_PROD")
  fi
fi

if (( ${#missing[@]} > 0 )); then
  echo "ERROR: faltan variables en $ENV_FILE:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

# Resumen
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
echo "=================================================="
echo "  Entorno     : $ENV_TARGET"
echo "  Servicio    : $SERVICE_NAME"
echo "  Imagen      : gcr.io/$PROJECT_ID/frontend:$IMAGE_TAG"
echo "  Región      : $REGION"
echo "  BD host     : $DB_HOST"
echo "  Bucket GCS  : $GCP_BUCKET_NAME"
echo "  AUTH_URL    : ${AUTH_URL:-<pendiente - bootstrap>}"
echo "  APP_URL     : ${NEXT_PUBLIC_APP_URL:-<pendiente - bootstrap>}"
echo "  Emails real : ${NOTIFICATIONS_LIVE:-false} (NOTIFICATIONS_LIVE)"
echo "  Modelo disp.: ${AVAILABILITY_MODEL_ENABLED:-false} (AVAILABILITY_MODEL_ENABLED)"
echo "=================================================="
if [[ "$ENV_TARGET" == "develop" && "$NOTIFICATIONS_LIVE" == "true" ]]; then
  echo ""
  echo "⚠️  ATENCIÓN: NOTIFICATIONS_LIVE=true en STAGING. Si la BD tiene datos"
  echo "   clonados de producción, se enviarán correos REALES a usuarios reales."
  echo "   Usa NOTIFICATIONS_LIVE_DEV=false para silenciar staging."
  echo "=================================================="
fi
if [[ "$BOOTSTRAP_MODE" == "true" ]]; then
  echo ""
  echo "MODO BOOTSTRAP: primer deploy sin AUTH_URL_${SUFFIX} ni"
  echo "NEXT_PUBLIC_APP_URL_${SUFFIX} configuradas. NextAuth usará el"
  echo "host del request (AUTH_TRUST_HOST=true). Tras el deploy, copia"
  echo "la URL devuelta a esas dos variables en .env.local y vuelve a"
  echo "ejecutar el deploy para que el bundle JS use la URL correcta."
  echo ""
fi

# Confirmación
if [[ "$ENV_TARGET" == "production" ]]; then
  read -r -p "Vas a desplegar a PRODUCCIÓN. Escribe 'SI' para continuar: " confirm
  if [[ "$confirm" != "SI" ]]; then
    echo "Abortado."
    exit 0
  fi
else
  read -r -p "¿Continuar con el deploy a staging? [s/N]: " confirm
  confirm_lc=$(echo "$confirm" | tr '[:upper:]' '[:lower:]')
  if [[ "$confirm_lc" != "s" && "$confirm_lc" != "si" ]]; then
    echo "Abortado."
    exit 0
  fi
fi

# 1. Cloud Build
echo ""
echo ">> Ejecutando Cloud Build (tag: $IMAGE_TAG)..."
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --substitutions="_TAG=$IMAGE_TAG" \
  --project="$PROJECT_ID"

# 2. Construir ENV_VARS
ENV_VARS="DATABASE_URL=$DATABASE_URL"
ENV_VARS+=",AUTH_SECRET=$AUTH_SECRET"
ENV_VARS+=",AUTH_TRUST_HOST=true"
ENV_VARS+=",GCP_PROJECT_ID=$GCP_PROJECT_ID"
ENV_VARS+=",GCP_BUCKET_NAME=$GCP_BUCKET_NAME"
ENV_VARS+=",EMAILJS_SERVICE_ID=$EMAILJS_SERVICE_ID"
ENV_VARS+=",EMAILJS_TEMPLATE_ID=$EMAILJS_TEMPLATE_ID"
ENV_VARS+=",EMAILJS_PUBLIC_KEY=$EMAILJS_PUBLIC_KEY"
ENV_VARS+=",EMAILJS_PRIVATE_KEY=$EMAILJS_PRIVATE_KEY"
ENV_VARS+=",NEXT_TELEMETRY_DISABLED=1"
ENV_VARS+=",NODE_ENV=production"
[[ -n "$RESEND_API_KEY" ]]          && ENV_VARS+=",RESEND_API_KEY=$RESEND_API_KEY"
[[ -n "$NOTIFICATION_FROM_EMAIL" ]] && ENV_VARS+=",NOTIFICATION_FROM_EMAIL=$NOTIFICATION_FROM_EMAIL"
[[ -n "$AUTH_URL" ]]                && ENV_VARS+=",AUTH_URL=$AUTH_URL"
[[ -n "$NEXT_PUBLIC_APP_URL" ]]     && ENV_VARS+=",NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"
[[ -n "$CRON_SECRET" ]]             && ENV_VARS+=",CRON_SECRET=$CRON_SECRET"
[[ -n "$NOTIFICATIONS_LIVE" ]]      && ENV_VARS+=",NOTIFICATIONS_LIVE=$NOTIFICATIONS_LIVE"
# Feature flags v5.0 (solo se inyectan si están definidos; default = false en el código)
[[ -n "$AVAILABILITY_MODEL_ENABLED" ]]        && ENV_VARS+=",AVAILABILITY_MODEL_ENABLED=$AVAILABILITY_MODEL_ENABLED"
[[ -n "$AVAILABILITY_UI_TECNICO_ENABLED" ]]   && ENV_VARS+=",AVAILABILITY_UI_TECNICO_ENABLED=$AVAILABILITY_UI_TECNICO_ENABLED"
[[ -n "$AVAILABILITY_ADMIN_PANEL_ENABLED" ]]  && ENV_VARS+=",AVAILABILITY_ADMIN_PANEL_ENABLED=$AVAILABILITY_ADMIN_PANEL_ENABLED"
[[ -n "$REJECTION_INDIVIDUAL_ENABLED" ]]      && ENV_VARS+=",REJECTION_INDIVIDUAL_ENABLED=$REJECTION_INDIVIDUAL_ENABLED"
[[ -n "$POOL_PENDIENTE_ENABLED" ]]            && ENV_VARS+=",POOL_PENDIENTE_ENABLED=$POOL_PENDIENTE_ENABLED"
[[ -n "$LEAGUE_ENGINE_ENABLED" ]]             && ENV_VARS+=",LEAGUE_ENGINE_ENABLED=$LEAGUE_ENGINE_ENABLED"

# 3. Deploy a Cloud Run
echo ""
echo ">> Desplegando $SERVICE_NAME en Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/frontend:$IMAGE_TAG" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --set-env-vars="$ENV_VARS"

# 4. Mostrar URL y smoke test
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project="$PROJECT_ID" \
  --format='value(status.url)')

echo ""
echo "=================================================="
echo "  Deploy completado."
echo "  URL: $SERVICE_URL"
echo "=================================================="

# Smoke test del landing (no falla el script si responde mal)
echo ""
echo ">> Smoke test del landing..."
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$SERVICE_URL/" || echo "000")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo "OK — landing responde 200."
else
  echo "ADVERTENCIA — landing respondió HTTP $HTTP_CODE."
  echo "Revisa logs: gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
fi

# Recordatorio: si AUTH_URL no coincide con SERVICE_URL, login fallará
if [[ "$AUTH_URL" != "$SERVICE_URL"* ]]; then
  echo ""
  echo "NOTA: AUTH_URL ($AUTH_URL) no coincide con la URL del servicio ($SERVICE_URL)."
  echo "Si es el primer deploy de develop, actualiza AUTH_URL_DEV y NEXT_PUBLIC_APP_URL_DEV"
  echo "en $ENV_FILE con la URL real y vuelve a ejecutar el deploy."
fi
