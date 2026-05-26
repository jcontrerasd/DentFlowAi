#!/bin/bash

# DentFlowAi - Script de Despliegue Nativo (Santiago)
# Este script extrae variables de .env.local y las inyecta en GCP.

PROJECT_ID="dentflowai-cbcf2"
REGION="southamerica-west1"
SERVICE_NAME="dentflowai-frontend"

echo "🚀 Iniciando despliegue de DentFlowAi en $REGION..."

# 1. Extraer variables de build (NEXT_PUBLIC)
echo "📦 Capturando configuracion de Firebase para el bundle..."
API_KEY=$(grep NEXT_PUBLIC_FIREBASE_API_KEY .env.local | cut -d '=' -f2)
AUTH_DOMAIN=$(grep NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN .env.local | cut -d '=' -f2)
PROJECT_ID_FB=$(grep NEXT_PUBLIC_FIREBASE_PROJECT_ID .env.local | cut -d '=' -f2)
STORAGE_BUCKET=$(grep NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET .env.local | cut -d '=' -f2)
SENDER_ID=$(grep NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID .env.local | cut -d '=' -f2)
APP_ID=$(grep NEXT_PUBLIC_FIREBASE_APP_ID .env.local | cut -d '=' -f2)

# 2. Extraer variables de ejecucion
echo "🔐 Capturando secretos de produccion..."
DB_URL=$(grep DATABASE_URL .env.local | cut -d '=' -f2)
AUTH_SEC=$(grep AUTH_SECRET .env.local | cut -d '=' -f2 | tr -d '"')
GCP_BUCKET=$(grep GCP_BUCKET_NAME .env.local | cut -d '=' -f2)

# 3. Construccion en la nube con Substitutions
echo "🛠️ Ejecutando Cloud Build en Santiago..."
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --region=$REGION \
  --substitutions="_API_KEY=$API_KEY,_AUTH_DOMAIN=$AUTH_DOMAIN,_PROJECT_ID_FB=$PROJECT_ID_FB,_STORAGE_BUCKET=$STORAGE_BUCKET,_SENDER_ID=$SENDER_ID,_APP_ID=$APP_ID"

# 4. Despliegue en Cloud Run con Env Vars
echo "🚀 Lanzando servicio en Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/frontend \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="DATABASE_URL=$DB_URL,AUTH_SECRET=$AUTH_SEC,GCP_PROJECT_ID=$PROJECT_ID,GCP_BUCKET_NAME=$GCP_BUCKET,NEXT_TELEMETRY_DISABLED=1,AUTH_TRUST_HOST=true"

echo "✅ Despliegue completado exitosamente!"
