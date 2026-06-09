#!/bin/bash
# DentFlowAi — Asistente gráfico de Deploy a Cloud Run
# Uso:
#   bash deploy-wizard.sh            # asistente interactivo
#   bash deploy-wizard.sh --dry-run  # muestra el plan, NO despliega
#
# Versión autónoma de deploy.sh (no lo invoca): guía paso a paso, explica cada
# parámetro, muestra la afectación por ambiente y confirma antes de actuar.
# Los ajustes del asistente afectan SOLO a este deploy; no modifican .env.local.

set -uo pipefail

PROJECT_ID="dentflowai-cbcf2"
REGION="southamerica-west1"
ENV_FILE=".env.local"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Colores ──────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  B=$'\e[1m'; DIM=$'\e[2m'; R=$'\e[0m'
  RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; BLU=$'\e[34m'; CYN=$'\e[36m'; MAG=$'\e[35m'
else
  B=""; DIM=""; R=""; RED=""; GRN=""; YEL=""; BLU=""; CYN=""; MAG=""
fi
W=70
line() { printf "${DIM}%s${R}\n" "$(printf '─%.0s' $(seq 1 $W))"; }
hdr()  { printf "\n${B}${CYN}%s${R}\n" "$1"; line; }
note() { printf "  ${DIM}%s${R}\n" "$1"; }

[[ -f "$ENV_FILE" ]] || { echo "${RED}ERROR:${R} no se encontró $ENV_FILE en $(pwd)."; exit 1; }

read_env() {
  local l; l=$(grep -E "^$1=" "$ENV_FILE" | head -n1 || true)
  [[ -z "$l" ]] && { echo ""; return; }
  echo "${l#*=}" | sed -E 's/^"(.*)"$/\1/'
}
resolve() {  # VAR_<SUFFIX> y cae a VAR plana
  if grep -qE "^${1}_${SUFFIX}=" "$ENV_FILE"; then read_env "${1}_${SUFFIX}"
  elif grep -qE "^${1}=" "$ENV_FILE"; then read_env "$1"
  else echo ""; fi
}
src_of() {
  if grep -qE "^${1}_${SUFFIX}=" "$ENV_FILE"; then echo "_${SUFFIX}"
  elif grep -qE "^${1}=" "$ENV_FILE"; then echo "plano"
  else echo "default"; fi
}
nb() { [[ "${1:-}" == "true" ]] && echo "true" || echo "false"; }

# ── Banner ───────────────────────────────────────────────────────────────────
clear 2>/dev/null || true
printf "${B}${MAG}"
cat <<'ART'
  ╔══════════════════════════════════════════════════════════════════╗
  ║            DentFlowAi · Asistente de Deploy (Cloud Run)           ║
  ╚══════════════════════════════════════════════════════════════════╝
ART
printf "${R}"
$DRY_RUN && printf "  ${YEL}MODO DRY-RUN: se mostrará el plan pero NO se desplegará.${R}\n"
note "Local no se despliega aquí: usa 'npm run dev' + docker (recursos en localhost)."

# ── Paso 1: ambiente ─────────────────────────────────────────────────────────
hdr "PASO 1 · ¿A qué ambiente vas a desplegar?"
printf "  ${B}[1]${R} ${GRN}Staging${R}     dentflowai-frontend-dev   ${DIM}(pruebas, BD aislada)${R}\n"
printf "  ${B}[2]${R} ${RED}Producción${R}  dentflowai-frontend       ${DIM}(usuarios reales)${R}\n"
printf "  ${B}[q]${R} Salir\n\n"
ENV_TARGET=""
while [[ -z "$ENV_TARGET" ]]; do
  read -r -p "  Elige 1, 2 o q: " a || true
  case "$a" in
    1) ENV_TARGET="develop" ;;
    2) ENV_TARGET="production" ;;
    q|Q) echo "  Cancelado."; exit 0 ;;
    *) printf "  ${YEL}Opción inválida.${R}\n" ;;
  esac
done
if [[ "$ENV_TARGET" == "develop" ]]; then
  SERVICE_NAME="dentflowai-frontend-dev"; IMAGE_TAG="develop"; SUFFIX="DEV"; ENVCOLOR="$GRN"; ENVNAME="STAGING"
else
  SERVICE_NAME="dentflowai-frontend"; IMAGE_TAG="latest"; SUFFIX="PROD"; ENVCOLOR="$RED"; ENVNAME="PRODUCCIÓN"
fi

# ── Resolver recursos / secretos (lectura desde .env.local) ──────────────────
DATABASE_URL=$(resolve DATABASE_URL)
GCP_BUCKET_NAME=$(resolve GCP_BUCKET_NAME)
AUTH_SECRET=$(read_env AUTH_SECRET)
GCP_PROJECT_ID=$(read_env GCP_PROJECT_ID)
EMAILJS_SERVICE_ID=$(read_env EMAILJS_SERVICE_ID)
EMAILJS_TEMPLATE_ID=$(read_env EMAILJS_TEMPLATE_ID)
EMAILJS_PUBLIC_KEY=$(read_env EMAILJS_PUBLIC_KEY)
EMAILJS_PRIVATE_KEY=$(read_env EMAILJS_PRIVATE_KEY)

# ── Modelo de parámetros AJUSTABLES (arrays paralelos) ───────────────────────
# Tipos: bool | secret | text | value(num/choice)
PVAR=();   PTYPE=();  PLABEL=(); PGROUP=(); PDESC=(); PAFF=()
add() { PVAR+=("$1"); PTYPE+=("$2"); PLABEL+=("$3"); PGROUP+=("$4"); PDESC+=("$5"); PAFF+=("$6"); }

G1="COMPORTAMIENTO · Modelo de disponibilidad (v5.0)"
G2="SEGURIDAD · secretos y URLs (editables para este deploy)"
G3="CLOUD RUN · recursos del contenedor (opcional; 'sin cambio' = deja el actual)"

add NOTIFICATIONS_LIVE bool "Emails reales" "$G1" \
 "Interruptor maestro de correos. ON = se envían de verdad. OFF = se SIMULAN (se escriben al log, no salen) aunque haya credenciales EmailJS." \
 "Si lo dejas OFF en staging, no llegan correos a usuarios reales que pueda haber en datos clonados de producción. ON solo en prod."
add AVAILABILITY_MODEL_ENABLED bool "Modelo disponibilidad" "$G1" \
 "Switch maestro v5.0. ON = Fauchard usa disponibilidad declarada (AND triple) + score con sanción rolling + cola + countdown de revisión. OFF = comportamiento anterior (exclusión binaria a 3 no-respuestas)." \
 "Si está OFF, los demás flags v5.0 no tienen efecto real (el sistema nuevo queda inerte)."
add AVAILABILITY_UI_TECNICO_ENABLED bool "UI técnico (badge+panel)" "$G1" \
 "Muestra al técnico el badge de disponibilidad en el header y el panel /dashboard/profile/availability para prender/apagar su disponibilidad por categoría." \
 "Sin esto, el técnico no ve ningún elemento nuevo aunque el modelo esté activo."
add AVAILABILITY_ADMIN_PANEL_ENABLED bool "Panel admin Fauchard" "$G1" \
 "Habilita en el admin de Fauchard la pestaña 'Plazos y Sanciones' (umbrales, pesos, ventanas) y el dashboard de Observabilidad (métricas con gráficos)." \
 "Es la consola para operar y calibrar el modelo; útil tenerla en staging para ajustar parámetros."
add REJECTION_INDIVIDUAL_ENABLED bool "Rechazo individual UCH" "$G1" \
 "Muestra el botón 'Rechazar invitación' en el hilo del caso (UCH) del técnico. Al rechazar, Fauchard invita automáticamente al siguiente del pool." \
 "El rechazo explícito NO cuenta como no-respuesta (no penaliza al técnico)."
add POOL_PENDIENTE_ENABLED bool "Cola pendiente_pool" "$G1" \
 "Cuando Fauchard no encuentra técnicos elegibles, el caso entra a una cola de espera (TTL + check-in al dentista) en vez de fallar de inmediato." \
 "Requiere AVAILABILITY_MODEL_ENABLED. Si está OFF, 0 elegibles falla directo a 'sin_cotizaciones'."

add CRON_SECRET secret "CRON_SECRET" "$G2" \
 "Contraseña que protege los endpoints /api/cron/*. Cloud Scheduler la manda en el header Authorization; si no coincide, la llamada se rechaza." \
 "Si está vacía, los endpoints quedan abiertos (cualquiera podría dispararlos). Recomendado distinto por ambiente."
add AUTH_URL text "AUTH_URL" "$G2" \
 "URL pública del sitio que NextAuth usa para los callbacks de login. Debe coincidir con la URL real del servicio Cloud Run." \
 "En el primer deploy puede ir vacía (bootstrap); luego se completa con la URL devuelta y se re-despliega."
add NEXT_PUBLIC_APP_URL text "NEXT_PUBLIC_APP_URL" "$G2" \
 "URL base que se incrusta en el bundle del cliente y en los links de los correos." \
 "Debe apuntar al dominio de ESTE ambiente, o los links de email llevarían al ambiente equivocado."

add CR_MEMORY value "Memoria" "$G3" \
 "Memoria del contenedor (p.ej. 512Mi, 1Gi, 2Gi). Next.js standalone va cómodo con 1Gi." \
 "Poca memoria puede causar reinicios bajo carga; 'sin cambio' deja el valor actual del servicio."
add CR_CPU value "CPU (vCPU)" "$G3" \
 "vCPU asignadas (1, 2, 4)." \
 "Más CPU = build/SSR más rápido pero más costo. 'sin cambio' mantiene el actual."
add CR_MIN_INSTANCES value "Min instancias" "$G3" \
 "Instancias mínimas siempre encendidas. 0 = escala a cero (más barato, con cold start). 1 = sin arranque en frío." \
 "En prod 1 evita latencia del primer request; en staging 0 ahorra. 'sin cambio' mantiene el actual."
add CR_MAX_INSTANCES value "Max instancias" "$G3" \
 "Tope de instancias para picos de tráfico." \
 "Limita costo máximo. 'sin cambio' mantiene el actual."
add CR_CONCURRENCY value "Concurrencia" "$G3" \
 "Requests simultáneos por instancia antes de escalar (default Cloud Run ~80)." \
 "Bajar si cada request consume mucha memoria/CPU. 'sin cambio' mantiene el actual."
add CR_TIMEOUT value "Timeout (s)" "$G3" \
 "Tiempo máximo de una request en segundos (default 300)." \
 "Subir si hay operaciones largas (export, build). 'sin cambio' mantiene el actual."

# Valores iniciales (defaults desde .env.local; CR_* arrancan vacíos = sin cambio)
PSRC=()
for i in "${!PVAR[@]}"; do
  k="${PVAR[$i]}"
  case "$k" in
    CR_*) printf -v "$k" '%s' ""; PSRC+=("nuevo") ;;
    *)    if [[ "${PTYPE[$i]}" == "bool" ]]; then printf -v "$k" '%s' "$(nb "$(resolve "$k")")";
          else printf -v "$k" '%s' "$(resolve "$k")"; fi
          PSRC+=("$(src_of "$k")") ;;
  esac
done

# ── Helpers de visualización / ajuste ────────────────────────────────────────
disp() { # idx -> string del valor
  local k="${PVAR[$1]}"; local t="${PTYPE[$1]}"; local v="${!k}"
  case "$t" in
    bool)   [[ "$v" == "true" ]] && printf "${GRN}● ON ${R}" || printf "${DIM}○ OFF${R}" ;;
    secret) [[ -n "$v" ]] && printf "${GRN}•••• definido${R}" || printf "${RED}vacío${R}" ;;
    text)   [[ -n "$v" ]] && printf "%s" "$v" || printf "${YEL}(vacío)${R}" ;;
    value)  [[ -n "$v" ]] && printf "%s" "$v" || printf "${DIM}(sin cambio)${R}" ;;
  esac
}
adjust() { # idx -> modifica el valor del parámetro
  local i="$1"; local k="${PVAR[$1]}"; local t="${PTYPE[$1]}"; local cur="${!k}"; local nv
  if [[ "$t" == "bool" ]]; then
    [[ "$cur" == "true" ]] && printf -v "$k" '%s' "false" || printf -v "$k" '%s' "true"
    PSRC[$i]="asistente"; return
  fi
  printf "\n  ${B}%s${R}\n" "${PLABEL[$i]}"
  note "${PDESC[$i]}"
  if [[ "$t" == "secret" ]]; then
    read -r -p "  Nuevo valor (ENTER = mantener, '-' = vaciar): " nv || true
  else
    printf "  Actual: ${DIM}%s${R}\n" "${cur:-(vacío)}"
    read -r -p "  Nuevo valor (ENTER = mantener, '-' = vaciar): " nv || true
  fi
  if [[ "$nv" == "-" ]]; then printf -v "$k" '%s' ""; PSRC[$i]="asistente"
  elif [[ -n "$nv" ]]; then printf -v "$k" '%s' "$nv"; PSRC[$i]="asistente"; fi
}

# ── Paso 2: menú de ajuste ───────────────────────────────────────────────────
draw_menu() {
  hdr "PASO 2 · Ajusta los parámetros de ESTE deploy a ${ENVCOLOR}${ENVNAME}${R}${B}${CYN}"
  note "Cambian solo este deploy; NO modifican .env.local."
  local i lastg="" warn
  for i in "${!PVAR[@]}"; do
    if [[ "${PGROUP[$i]}" != "$lastg" ]]; then printf "\n  ${B}${BLU}%s${R}\n" "${PGROUP[$i]}"; lastg="${PGROUP[$i]}"; fi
    warn=""
    if [[ "${PVAR[$i]}" == "NOTIFICATIONS_LIVE" && "${NOTIFICATIONS_LIVE}" == "true" && "$ENV_TARGET" == "develop" ]]; then
      warn=" ${YEL}⚠ correos REALES en staging${R}"
    fi
    printf "  ${B}[%2d]${R} %-24s %b  ${DIM}(%s)${R}%b\n" "$((i+1))" "${PLABEL[$i]}" "$(disp "$i")" "${PSRC[$i]}" "$warn"
  done
  printf "\n  Escribe ${B}1-%d${R} para ajustar · ${B}d${R} descripciones · ${B}ENTER${R} continuar\n" "${#PVAR[@]}"
}
help_all() {
  hdr "Descripción de cada parámetro"
  local i lastg=""
  for i in "${!PVAR[@]}"; do
    if [[ "${PGROUP[$i]}" != "$lastg" ]]; then printf "\n  ${B}${BLU}%s${R}\n" "${PGROUP[$i]}"; lastg="${PGROUP[$i]}"; fi
    printf "  ${B}%s${R} ${DIM}(%s)${R}\n" "${PLABEL[$i]}" "${PVAR[$i]}"
    printf "    %s\n" "${PDESC[$i]}"
    printf "    ${DIM}Afecta: %s${R}\n" "${PAFF[$i]}"
  done
  printf "\n  ${B}${BLU}RECURSOS DEL AMBIENTE${R} ${DIM}(se cambian en .env.local, no aquí)${R}\n"
  note "DATABASE_URL_${SUFFIX} · GCP_BUCKET_NAME_${SUFFIX} · AUTH_SECRET · GCP_PROJECT_ID · EMAILJS_* (cuenta compartida)"
  read -r -p "  ENTER para volver " _ || true
}
while true; do
  draw_menu
  read -r -p "  > " choice || true
  [[ -z "$choice" ]] && break
  if [[ "$choice" == "d" ]]; then help_all; continue; fi
  if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#PVAR[@]} )); then
    adjust "$((choice-1))"
  else
    printf "  ${YEL}Opción inválida.${R}\n"
  fi
done

# ── Validación ───────────────────────────────────────────────────────────────
missing=()
[[ -z "$DATABASE_URL" ]]        && missing+=("DATABASE_URL_${SUFFIX}")
[[ -z "$AUTH_SECRET" ]]         && missing+=("AUTH_SECRET")
[[ -z "$GCP_PROJECT_ID" ]]      && missing+=("GCP_PROJECT_ID")
[[ -z "$GCP_BUCKET_NAME" ]]     && missing+=("GCP_BUCKET_NAME_${SUFFIX}")
[[ -z "$EMAILJS_SERVICE_ID" ]]  && missing+=("EMAILJS_SERVICE_ID")
[[ -z "$EMAILJS_TEMPLATE_ID" ]] && missing+=("EMAILJS_TEMPLATE_ID")
[[ -z "$EMAILJS_PUBLIC_KEY" ]]  && missing+=("EMAILJS_PUBLIC_KEY")
[[ -z "$EMAILJS_PRIVATE_KEY" ]] && missing+=("EMAILJS_PRIVATE_KEY")
BOOTSTRAP=false
if [[ -z "$AUTH_URL" || -z "$NEXT_PUBLIC_APP_URL" ]]; then
  BOOTSTRAP=true
  [[ "$ENV_TARGET" == "production" ]] && missing+=("AUTH_URL" "NEXT_PUBLIC_APP_URL")
fi
if (( ${#missing[@]} > 0 )); then
  hdr "✗ Faltan valores obligatorios"
  for m in "${missing[@]}"; do printf "  ${RED}- %s${R}\n" "$m"; done
  note "Complétalos en .env.local (o en el menú si es AUTH_URL / NEXT_PUBLIC_APP_URL) y reintenta."
  exit 1
fi

# ── Paso 3: panel de impacto ─────────────────────────────────────────────────
DB_HOST=$(echo "$DATABASE_URL" | sed -E 's|.*@([^:/]+).*|\1|')
mark() { [[ -n "$1" ]] && printf "${GRN}✓ definido${R}" || printf "${RED}✗ vacío${R}"; }
printf "\n"; line
printf "  ${B}PLAN DE DEPLOY  ▸  ${ENVCOLOR}%s${R}${B}   (%s)${R}\n" "$ENVNAME" "$SERVICE_NAME"
line

hdr "RECURSOS DEL AMBIENTE  ${DIM}(a qué apunta · se configuran en .env.local)"
printf "  %-22s %s ${DIM}← DATABASE_URL_%s${R}\n" "Base de datos" "$DB_HOST" "$SUFFIX"
printf "  %-22s %s\n" "Bucket GCS" "$GCP_BUCKET_NAME"
printf "  %-22s %s\n" "AUTH_URL" "${AUTH_URL:-${YEL}<bootstrap>${R}}"
printf "  %-22s %s\n" "NEXT_PUBLIC_APP_URL" "${NEXT_PUBLIC_APP_URL:-${YEL}<bootstrap>${R}}"
printf "  %-22s %s   %-22s %s\n" "AUTH_SECRET" "$(mark "$AUTH_SECRET")" "GCP_PROJECT_ID" "$(mark "$GCP_PROJECT_ID")"
printf "  %-22s %s ${DIM}(cuenta compartida entre ambientes)${R}\n" "EmailJS creds" "$(mark "$EMAILJS_PRIVATE_KEY")"

hdr "COMPORTAMIENTO · Modelo v5.0"
for i in 0 1 2 3 4 5; do printf "  %b  %-24s ${DIM}origen: %s${R}\n" "$(disp "$i")" "${PLABEL[$i]}" "${PSRC[$i]}"; done

hdr "SEGURIDAD · secretos / URLs"
for i in 6 7 8; do printf "  %-24s %b ${DIM}origen: %s${R}\n" "${PLABEL[$i]}" "$(disp "$i")" "${PSRC[$i]}"; done

hdr "CLOUD RUN · recursos del contenedor"
any_cr=false
for i in 9 10 11 12 13 14; do
  k="${PVAR[$i]}"; v="${!k}"
  [[ -n "$v" ]] && any_cr=true
  printf "  %-24s %b\n" "${PLABEL[$i]}" "$(disp "$i")"
done
$any_cr || note "Todos 'sin cambio': el servicio conserva su configuración actual de Cloud Run."

if [[ "$ENV_TARGET" == "develop" && "$NOTIFICATIONS_LIVE" == "true" ]]; then
  printf "\n  ${YEL}⚠ Staging enviará correos REALES (NOTIFICATIONS_LIVE=ON). Con datos clonados\n    de prod, llegarían a usuarios reales. Apágalo en el menú (opción 1) si no quieres.${R}\n"
fi
if [[ "$BOOTSTRAP" == "true" ]]; then
  hdr "Nota · MODO BOOTSTRAP"
  note "AUTH_URL/NEXT_PUBLIC_APP_URL vacías: NextAuth usará el host del request."
  note "Tras desplegar, copia la URL devuelta a esos campos (o a .env.local) y re-despliega."
fi
printf "\n"; line

if $DRY_RUN; then
  printf "  ${YEL}DRY-RUN:${R} fin del plan. No se desplegó nada.\n"
  exit 0
fi

# ── Confirmación ─────────────────────────────────────────────────────────────
printf "\n"
if [[ "$ENV_TARGET" == "production" ]]; then
  printf "  ${RED}${B}Vas a desplegar a PRODUCCIÓN.${R}\n"
  read -r -p "  Escribe 'SI' (mayúsculas) para continuar: " c || true
  [[ "$c" == "SI" ]] || { echo "  Abortado."; exit 0; }
else
  read -r -p "  ¿Continuar con el deploy a STAGING? [y/N]: " c || true
  c=$(echo "${c:-}" | tr '[:upper:]' '[:lower:]')
  [[ "$c" == "y" || "$c" == "yes" || "$c" == "s" || "$c" == "si" ]] || { echo "  Abortado."; exit 0; }
fi

# ── Deploy (autónomo; mismos comandos base que deploy.sh) ────────────────────
set -e
printf "\n${B}>> [1/3] Cloud Build (tag: %s)...${R}\n" "$IMAGE_TAG"
gcloud builds submit . --config=cloudbuild.yaml --substitutions="_TAG=$IMAGE_TAG" --project="$PROJECT_ID"

ENV_VARS="DATABASE_URL=$DATABASE_URL"
ENV_VARS+=",AUTH_SECRET=$AUTH_SECRET,AUTH_TRUST_HOST=true"
ENV_VARS+=",GCP_PROJECT_ID=$GCP_PROJECT_ID,GCP_BUCKET_NAME=$GCP_BUCKET_NAME"
ENV_VARS+=",EMAILJS_SERVICE_ID=$EMAILJS_SERVICE_ID,EMAILJS_TEMPLATE_ID=$EMAILJS_TEMPLATE_ID"
ENV_VARS+=",EMAILJS_PUBLIC_KEY=$EMAILJS_PUBLIC_KEY,EMAILJS_PRIVATE_KEY=$EMAILJS_PRIVATE_KEY"
ENV_VARS+=",NEXT_TELEMETRY_DISABLED=1,NODE_ENV=production"
[[ -n "$AUTH_URL" ]]            && ENV_VARS+=",AUTH_URL=$AUTH_URL"
[[ -n "$NEXT_PUBLIC_APP_URL" ]] && ENV_VARS+=",NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"
[[ -n "$CRON_SECRET" ]]         && ENV_VARS+=",CRON_SECRET=$CRON_SECRET"
ENV_VARS+=",NOTIFICATIONS_LIVE=$NOTIFICATIONS_LIVE"
ENV_VARS+=",AVAILABILITY_MODEL_ENABLED=$AVAILABILITY_MODEL_ENABLED"
ENV_VARS+=",AVAILABILITY_UI_TECNICO_ENABLED=$AVAILABILITY_UI_TECNICO_ENABLED"
ENV_VARS+=",AVAILABILITY_ADMIN_PANEL_ENABLED=$AVAILABILITY_ADMIN_PANEL_ENABLED"
ENV_VARS+=",REJECTION_INDIVIDUAL_ENABLED=$REJECTION_INDIVIDUAL_ENABLED"
ENV_VARS+=",POOL_PENDIENTE_ENABLED=$POOL_PENDIENTE_ENABLED"

CR_FLAGS=()
[[ -n "$CR_MEMORY" ]]        && CR_FLAGS+=(--memory "$CR_MEMORY")
[[ -n "$CR_CPU" ]]          && CR_FLAGS+=(--cpu "$CR_CPU")
[[ -n "$CR_MIN_INSTANCES" ]] && CR_FLAGS+=(--min-instances "$CR_MIN_INSTANCES")
[[ -n "$CR_MAX_INSTANCES" ]] && CR_FLAGS+=(--max-instances "$CR_MAX_INSTANCES")
[[ -n "$CR_CONCURRENCY" ]]   && CR_FLAGS+=(--concurrency "$CR_CONCURRENCY")
[[ -n "$CR_TIMEOUT" ]]       && CR_FLAGS+=(--timeout "$CR_TIMEOUT")

printf "\n${B}>> [2/3] Desplegando %s en Cloud Run...${R}\n" "$SERVICE_NAME"
gcloud run deploy "$SERVICE_NAME" \
  --image "gcr.io/$PROJECT_ID/frontend:$IMAGE_TAG" \
  --region "$REGION" --platform managed --allow-unauthenticated \
  --project="$PROJECT_ID" --set-env-vars="$ENV_VARS" \
  ${CR_FLAGS[@]+"${CR_FLAGS[@]}"}

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project="$PROJECT_ID" --format='value(status.url)')
printf "\n${B}>> [3/3] Smoke test...${R}\n"
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 30 "$SERVICE_URL/" || echo "000")
line
printf "  ${GRN}${B}✓ Deploy completado.${R}\n"
printf "  URL: ${B}%s${R}\n" "$SERVICE_URL"
[[ "$HTTP_CODE" == "200" ]] && printf "  Landing: ${GRN}HTTP 200${R}\n" || printf "  Landing: ${YEL}HTTP %s (revisa logs)${R}\n" "$HTTP_CODE"
line
if [[ -n "$AUTH_URL" && "$AUTH_URL" != "$SERVICE_URL"* ]]; then
  printf "  ${YEL}NOTA: AUTH_URL (%s) no coincide con la URL del servicio.\n  Ajústalo (menú o .env.local AUTH_URL_%s) y re-despliega.${R}\n" "$AUTH_URL" "$SUFFIX"
fi
