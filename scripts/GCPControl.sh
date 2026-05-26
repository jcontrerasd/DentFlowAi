#!/bin/bash

# GCPControl.sh - Gestión de Costos DentFlowAi
# Uso: ./GCPControl.sh [up|down|status]

PROJECT_ID="dentflowai-cbcf2"
REGION="southamerica-west1"
# Instancia REAL detectada por la IP 34.176.243.133
SQL_INSTANCE="dentflowai-cbcf2-instance" 

# Colores para la terminal
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

printf "${BLUE}══════════════════════════════════════════════════════${NC}\n"
printf "${BLUE}   DentFlowAi - Optimizador de Costos GCP (Santiago)  ${NC}\n"
printf "${BLUE}══════════════════════════════════════════════════════${NC}\n"

case "$1" in
  down)
    printf "${YELLOW}🌙 Modo AHORRO (Apagando $SQL_INSTANCE)...${NC}\n"
    
    # 1. Verificar si ya está apagada
    CURRENT_POLICY=$(gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID --format="value(settings.activationPolicy)" 2>/dev/null)
    
    if [ "$CURRENT_POLICY" == "NEVER" ]; then
      printf "🐘 La instancia ya estaba ${GREEN}DETENIDA${NC}. Omitiendo...\n"
    else
      printf "🐘 Solicitando apagado de instancia (asíncrono)... "
      gcloud sql instances patch $SQL_INSTANCE --activation-policy NEVER --project=$PROJECT_ID --quiet --async
      if [ $? -eq 0 ]; then
        printf "${GREEN}SOLICITADO${NC}\n"
        printf "${YELLOW}ℹ️ La factura se detendrá en unos instantes.${NC}\n"
      else
        printf "${RED}ERROR${NC}\n"
      fi
    fi

    # 2. Asegurar Cloud Run en escala cero
    printf "🚀 Asegurando escala cero en Cloud Run... "
    gcloud run services update dentflowai-frontend --min-instances 0 --region $REGION --project=$PROJECT_ID --quiet
    printf "${GREEN}OK${NC}\n"

    printf "\n${GREEN}✅ Servicios en proceso de minimización.${NC}\n"
    ;;

  up)
    printf "${YELLOW}☀️ Iniciando modo DESARROLLO (Despertando servicios)...${NC}\n"
    
    # 1. Verificar si ya está encendida
    CURRENT_POLICY=$(gcloud sql instances describe $SQL_INSTANCE --project=$PROJECT_ID --format="value(settings.activationPolicy)" 2>/dev/null)
    
    if [ "$CURRENT_POLICY" == "ALWAYS" ]; then
      printf "🐘 La instancia ya estaba ${GREEN}ENCENDIDA${NC}. Omitiendo...\n"
    else
      printf "🐘 Solicitando arranque de instancia (asíncrono)... "
      gcloud sql instances patch $SQL_INSTANCE --activation-policy ALWAYS --project=$PROJECT_ID --quiet --async
      if [ $? -eq 0 ]; then
        printf "${GREEN}SOLICITADO${NC}\n"
        printf "${YELLOW}ℹ️ Estará disponible para conectar en 1-2 minutos.${NC}\n"
      else
        printf "${RED}ERROR${NC}\n"
      fi
    fi
    
    printf "\n${GREEN}🚀 Proyecto DentFlowAi en proceso de despertar.${NC}\n"
    ;;

  status)
    printf "${BLUE}📊 Estado actual de recursos en $PROJECT_ID:${NC}\n"
    printf "\n--- Cloud SQL ---\n"
    gcloud sql instances list --project=$PROJECT_ID
    printf "\n--- Cloud Run ---\n"
    gcloud run services list --project=$PROJECT_ID --region=$REGION
    ;;

  *)
    printf "Uso: $0 {up|down|status}\n"
    printf "  up     -> Activa servicios (Modo Trabajo)\n"
    printf "  down   -> Apaga servicios (Modo Ahorro / Noche)\n"
    printf "  status -> Muestra el estado actual\n"
    exit 1
esac

printf "${BLUE}══════════════════════════════════════════════════════${NC}\n"
