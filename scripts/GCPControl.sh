#!/bin/bash

# GCPControl.sh - Gestión de Costos DentFlowAi
# Uso: ./GCPControl.sh [up|down|status] [prod|dev|all]
#   target por defecto: all

PROJECT_ID="dentflowai-cbcf2"
REGION="southamerica-west1"

# Instancias Cloud SQL
SQL_INSTANCE_PROD="dentflowai-cbcf2-instance"
SQL_INSTANCE_DEV="dentflowai-psql-dev"

# Servicios Cloud Run
RUN_SERVICE_PROD="dentflowai-frontend"
RUN_SERVICE_DEV="dentflowai-frontend-dev"

# Colores y estilos
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

ACTION="$1"
TARGET="${2:-all}"

# Contadores para el resumen final
COUNT_OK=0
COUNT_SKIP=0
COUNT_ERR=0

# ── Helpers de presentación ───────────────────────────────────────────
hr() {
  printf "${BLUE}──────────────────────────────────────────────────────${NC}\n"
}

banner() {
  printf "\n${BLUE}${BOLD}╔══════════════════════════════════════════════════════╗${NC}\n"
  printf "${BLUE}${BOLD}║   DentFlowAi · Optimizador de Costos GCP (Santiago)  ║${NC}\n"
  printf "${BLUE}${BOLD}╚══════════════════════════════════════════════════════╝${NC}\n"
  printf "  ${DIM}Proyecto:${NC} ${CYAN}$PROJECT_ID${NC}   ${DIM}Región:${NC} ${CYAN}$REGION${NC}\n"
  printf "  ${DIM}Acción:${NC}   ${BOLD}${MAGENTA}${ACTION:-<vacía>}${NC}        ${DIM}Target:${NC} ${BOLD}${MAGENTA}${TARGET}${NC}\n"
  hr
}

section() {
  # Encabezado por entorno
  local label="$1"
  printf "\n${CYAN}${BOLD}▶ Entorno: $label${NC}\n"
}

step_start() {
  # Línea de paso en curso, sin newline. Imprime spinner estático.
  local msg="$1"
  printf "   ${YELLOW}⏳${NC} %-55s " "$msg"
}

step_ok() {
  local detail="$1"
  printf "${GREEN}✔ OK${NC}"
  [ -n "$detail" ] && printf " ${DIM}— $detail${NC}"
  printf "\n"
  COUNT_OK=$((COUNT_OK+1))
}

step_skip() {
  local detail="$1"
  printf "${BLUE}↷ SKIP${NC}"
  [ -n "$detail" ] && printf " ${DIM}— $detail${NC}"
  printf "\n"
  COUNT_SKIP=$((COUNT_SKIP+1))
}

step_err() {
  local detail="$1"
  printf "${RED}✘ ERROR${NC}"
  [ -n "$detail" ] && printf " ${DIM}— $detail${NC}"
  printf "\n"
  COUNT_ERR=$((COUNT_ERR+1))
}

summary() {
  hr
  printf "${BOLD}Resumen:${NC} "
  printf "${GREEN}${COUNT_OK} ok${NC}  "
  printf "${BLUE}${COUNT_SKIP} skip${NC}  "
  printf "${RED}${COUNT_ERR} error${NC}\n"
  hr
}

# ── Lógica de targets ─────────────────────────────────────────────────
build_targets() {
  case "$TARGET" in
    prod)
      TARGETS=("$SQL_INSTANCE_PROD|$RUN_SERVICE_PROD|PROD")
      ;;
    dev|develop|staging)
      TARGETS=("$SQL_INSTANCE_DEV|$RUN_SERVICE_DEV|DEV")
      ;;
    all|"")
      TARGETS=(
        "$SQL_INSTANCE_PROD|$RUN_SERVICE_PROD|PROD"
        "$SQL_INSTANCE_DEV|$RUN_SERVICE_DEV|DEV"
      )
      ;;
    *)
      printf "${RED}Target desconocido: $TARGET${NC} (usa: prod | dev | all)\n"
      exit 1
      ;;
  esac
}

# ── Operaciones ───────────────────────────────────────────────────────
sql_patch() {
  local instance="$1"
  local policy="$2"   # NEVER | ALWAYS

  step_start "Cloud SQL · $instance → $policy"

  local current
  current=$(gcloud sql instances describe "$instance" --project=$PROJECT_ID --format="value(settings.activationPolicy)" 2>/dev/null)

  if [ -z "$current" ]; then
    step_err "instancia no encontrada"
    return
  fi

  if [ "$current" == "$policy" ]; then
    if [ "$policy" == "NEVER" ]; then
      step_skip "ya estaba DETENIDA"
    else
      step_skip "ya estaba ENCENDIDA"
    fi
    return
  fi

  if gcloud sql instances patch "$instance" --activation-policy "$policy" --project=$PROJECT_ID --quiet --async >/dev/null 2>&1; then
    step_ok "patch async solicitado ($current → $policy)"
  else
    step_err "fallo al aplicar patch"
  fi
}

run_min_instances() {
  local service="$1"
  local min="$2"

  step_start "Cloud Run · $service → min-instances=$min"

  if ! gcloud run services describe "$service" --region=$REGION --project=$PROJECT_ID >/dev/null 2>&1; then
    step_err "servicio no encontrado"
    return
  fi

  if gcloud run services update "$service" --min-instances "$min" --region $REGION --project=$PROJECT_ID --quiet >/dev/null 2>&1; then
    step_ok "aplicado"
  else
    step_err "fallo al actualizar servicio"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────
banner

case "$ACTION" in
  down)
    build_targets
    printf "${YELLOW}${BOLD}🌙 Modo AHORRO${NC} ${DIM}— apagando SQL y escalando Cloud Run a 0${NC}\n"
    for entry in "${TARGETS[@]}"; do
      IFS='|' read -r sql run label <<< "$entry"
      section "$label"
      sql_patch "$sql" "NEVER"
      run_min_instances "$run" 0
    done
    summary
    printf "${GREEN}✅ Servicios en proceso de minimización.${NC}\n"
    printf "${DIM}ℹ️  La factura SQL se detiene en cuanto cada patch async termina.${NC}\n"
    ;;

  up)
    build_targets
    printf "${YELLOW}${BOLD}☀️  Modo DESARROLLO${NC} ${DIM}— despertando instancias SQL${NC}\n"
    for entry in "${TARGETS[@]}"; do
      IFS='|' read -r sql run label <<< "$entry"
      section "$label"
      sql_patch "$sql" "ALWAYS"
    done
    summary
    printf "${GREEN}🚀 Instancias en proceso de arranque (1-2 min).${NC}\n"
    printf "${DIM}ℹ️  Cloud Run no se modifica en 'up' (escala bajo demanda).${NC}\n"
    ;;

  status)
    printf "${CYAN}${BOLD}📊 Estado actual de recursos${NC}\n"
    printf "\n${BOLD}── Cloud SQL ──${NC}\n"
    gcloud sql instances list --project=$PROJECT_ID
    printf "\n${BOLD}── Cloud Run ($REGION) ──${NC}\n"
    gcloud run services list --project=$PROJECT_ID --region=$REGION
    hr
    ;;

  *)
    printf "${BOLD}Uso:${NC} $0 {up|down|status} [prod|dev|all]\n\n"
    printf "  ${BOLD}up${NC}     → Activa instancias SQL (Modo Trabajo)\n"
    printf "  ${BOLD}down${NC}   → Apaga instancias SQL + Cloud Run min=0 (Modo Ahorro)\n"
    printf "  ${BOLD}status${NC} → Muestra el estado actual\n\n"
    printf "${BOLD}Targets:${NC}\n"
    printf "  ${CYAN}prod${NC} → $SQL_INSTANCE_PROD + $RUN_SERVICE_PROD\n"
    printf "  ${CYAN}dev${NC}  → $SQL_INSTANCE_DEV + $RUN_SERVICE_DEV\n"
    printf "  ${CYAN}all${NC}  → ambos (default)\n"
    exit 1
esac
