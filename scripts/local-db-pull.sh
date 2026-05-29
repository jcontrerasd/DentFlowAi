#!/usr/bin/env bash
# local-db-pull.sh
# Copia usuarios y configuraciones desde producción a la DB local Docker.
# NO copia casos clínicos, archivos ni datos de sesión.
# Sanitiza passwords antes de importar.
#
# Uso: bash scripts/local-db-pull.sh
# Rollback: pg_restore -d "$LOCAL_URL" --no-owner --no-acl <ruta_del_backup_impresa_al_inicio>

set -euo pipefail

PROD_URL="postgresql://dentflow_admin:dentflow_secure_pass_2026@34.176.243.133:5432/dentflowai-cbcf2-database"
LOCAL_URL="postgresql://dentflow_admin:dentflow_secure_pass_2026@localhost:5432/dentflowai_local"
DB_CONTAINER="dentflowai-db-1"
DB_ADMIN="postgres"   # superuser del contenedor (creado en init)
DB_USER="dentflow_admin"
DB_NAME="dentflowai_local"

# Hash bcrypt de 'dentflow_local_2026' (generado con bcryptjs rounds=10)
LOCAL_PASS_HASH='$2a$10$4iMdpd965poesszNRczbsu6GCNUnYy3cE5IBsmMUi.1J3iQz94WTi'

# Tablas a copiar en orden que respeta FKs
TABLES=(
  organization
  '"user"'
  technician_skill
  fauchard_config
  fauchard_config_log
  fauchard_holiday
  vita_shade
  restoration_type
  dental_material
  urgency_level
  contact_guard_rule
  contact_guard_courier_allowlist
)

# Helper: ejecuta psql dentro del contenedor (como admin o con DB específica)
db_exec() {
  docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -c "$1"
}
db_admin() {
  docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d postgres -c "$1"
}

# ── 1. Levantar DB local ──────────────────────────────────────────────────────
echo "→ Levantando DB local..."
docker compose up -d db 2>&1 | grep -v "^What's next" | grep -v "Filter, search" | grep -v "in one place" | grep -v "docker-desktop" || true
sleep 3

# ── 1b. Asegurar que el usuario dentflow_admin existe en el contenedor ─────────
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d postgres -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='dentflow_admin') THEN CREATE ROLE dentflow_admin LOGIN PASSWORD 'dentflow_secure_pass_2026'; END IF; END \$\$;" &>/dev/null
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d postgres -c \
  "SELECT 'CREATE DATABASE dentflowai_local OWNER dentflow_admin' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='dentflowai_local')" \
  | grep -q "CREATE DATABASE" && \
  docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d postgres -c \
    "CREATE DATABASE dentflowai_local OWNER dentflow_admin;" 2>/dev/null || true

# ── 2. Backup de la DB local antes de sobreescribir (rollback automático) ─────
BACKUP_FILE="/tmp/dentflowai_local_backup_$(date +%Y%m%d_%H%M%S).dump"
if docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -c "SELECT 1" &>/dev/null 2>&1; then
  pg_dump "$LOCAL_URL" -Fc -f "$BACKUP_FILE" 2>/dev/null && \
    echo "→ Backup local guardado en: $BACKUP_FILE" || \
    echo "→ DB local vacía, no se requiere backup"
else
  echo "→ DB local no existe aún, no se requiere backup"
fi

echo ""
echo "  Si algo falla, restaura con:"
echo "  pg_restore -d \"$LOCAL_URL\" --no-owner --no-acl $BACKUP_FILE"
echo ""

# ── 3. Limpiar schema local ───────────────────────────────────────────────────
echo "→ Limpiando schema local..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO dentflow_admin; CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dentflow_admin; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dentflow_admin;"

# ── 4. Copiar datos de producción tabla por tabla ─────────────────────────────
echo "→ Copiando tablas desde producción..."
FAILED=()
for TABLE in "${TABLES[@]}"; do
  printf "   %-40s" "Copiando $TABLE..."
  if pg_dump "$PROD_URL" \
    --table="$TABLE" \
    --no-owner \
    --no-acl \
    2>/dev/null | docker exec -i "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" &>/dev/null 2>&1; then
    echo "✓"
  else
    echo "⚠ falló"
    FAILED+=("$TABLE")
  fi
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "⚠ Las siguientes tablas no se copiaron (pueden no existir aún en prod):"
  for T in "${FAILED[@]}"; do echo "   - $T"; done
  echo "  Esto es normal en la primera ejecución. infrastructure.ts las creará al arrancar Next.js."
fi

# ── 4b. Permisos sobre tablas copiadas ───────────────────────────────────────
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -c \
  "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO dentflow_admin; GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO dentflow_admin;" &>/dev/null

# ── 5. Sanitizar datos sensibles ──────────────────────────────────────────────
echo ""
echo "→ Sanitizando passwords y sesiones..."
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -c \
  "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user' AND column_name='password') THEN EXECUTE 'UPDATE \"user\" SET password = ''${LOCAL_PASS_HASH}'' WHERE password IS NOT NULL'; END IF; END \$\$;" 2>/dev/null || true
docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -c \
  "SET search_path TO public; DELETE FROM sessions; DELETE FROM accounts; DELETE FROM \"verificationToken\";" 2>/dev/null || true

# ── 6. Reporte final ──────────────────────────────────────────────────────────
USER_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -tAc 'SET search_path TO public; SELECT COUNT(*) FROM "user"' 2>/dev/null || echo "?")
ORG_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_ADMIN" -d "$DB_NAME" -tAc 'SET search_path TO public; SELECT COUNT(*) FROM organization' 2>/dev/null || echo "?")

echo ""
echo "─────────────────────────────────────────────────────────"
echo "✓ DB local lista"
echo "  Usuarios: $USER_COUNT | Organizaciones: $ORG_COUNT"
echo "  Password de todos los usuarios: dentflow_local_2026"
echo ""
echo "  Próximo paso: cd frontend && npm run dev"
echo "  Al primer request, infrastructure.ts aplicará el DDL completo."
echo "─────────────────────────────────────────────────────────"
