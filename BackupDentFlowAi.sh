#!/bin/zsh

# Script de Respaldo para DentFlowAi (PostgreSQL + Next.js Native)
# Uso: ./BackupDentFlowAi.sh "Resumen de los cambios realizados"

# 1. Validar parámetros
if [ -z "$1" ]; then
    echo "❌ Error: Debes proporcionar un resumen de los cambios."
    echo "Uso: ./BackupDentFlowAi.sh \"Mi resumen de cambios\""
    exit 1
fi

RESUMEN=$1
FECHA_ID=$(date +"%Y%m%d_%H%M")
# Formatear fecha en español (macOS compatible)
DIA=$(date +"%d")
MES_NUM=$(date +"%m")
ANIO=$(date +"%Y")
HORA=$(date +"%H:%M")

case $MES_NUM in
    01) MES="enero" ;;
    02) MES="febrero" ;;
    03) MES="marzo" ;;
    04) MES="abril" ;;
    05) MES="mayo" ;;
    06) MES="junio" ;;
    07) MES="julio" ;;
    08) MES="agosto" ;;
    09) MES="septiembre" ;;
    10) MES="octubre" ;;
    11) MES="noviembre" ;;
    12) MES="diciembre" ;;
esac

FECHA_HUMANA="$DIA de $MES de $ANIO - $HORA"
NOMBRE_ARCHIVO="${FECHA_ID}_DentFlowAi.zip"
DIRECTORIO_RESPALDO="./Backup"
DIRECTORIO_GOOGLE_DRIVE="/Users/jaimecontreras/Library/CloudStorage/GoogleDrive-jaime.contreras.d@gmail.com/Mi unidad/Backup DentFlowAi"
ARCHIVO_LOG="Backup/BackupDentFlowAi.md"
DB_DUMP_FILE="Backup/latest_db_dump.sql"

echo "🚀 Iniciando proceso de respaldo para DentFlowAi (Versión Nativa)..."

# 2. Crear carpetas de destino si no existen
mkdir -p "$DIRECTORIO_RESPALDO"
mkdir -p "$DIRECTORIO_GOOGLE_DRIVE"

# 3. Respaldo de ESQUEMA de Base de Datos (Estructura para Reconstrucción)
echo "🐘 Extrayendo estructura SQL (Schema Only)..."
ENV_PATH="./frontend/.env.local"
if [ -f "$ENV_PATH" ]; then
    DB_URL=$(grep DATABASE_URL "$ENV_PATH" | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    if [ ! -z "$DB_URL" ]; then
        # Extraemos solo la estructura (-s / --schema-only) para reconstrucción rápida
        pg_dump -s "$DB_URL" > "$DB_DUMP_FILE" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "   ✅ Estructura SQL exportada en $DB_DUMP_FILE"
            DB_STATUS="Esquema Extracted (Solo Estructura)"
        else
            echo "   ⚠️ No se pudo extraer el esquema vía pg_dump. Se dependerá de los archivos de Drizzle."
            DB_STATUS="Estructura vía Código (Drizzle)"
        fi
    else
        DB_STATUS="No configurada (DATABASE_URL no encontrada)"
    fi
else
    DB_STATUS="No configurada (Archivo $ENV_PATH ausente)"
fi

# 4. Crear el archivo ZIP (Enfoque en Código, Activos y Configuración)
echo "📦 Comprimiendo código fuente, activos y estructura..."
zip -r "$DIRECTORIO_RESPALDO/$NOMBRE_ARCHIVO" . \
    -x "node_modules/*" \
    -x "frontend/node_modules/*" \
    -x "frontend/.next/*" \
    -x "**/__pycache__/*" \
    -x "Backup/*.zip" \
    -x "Backup/extracted_original/*" \
    -x "Backup/full_backup_extracted/*" \
    -x ".git/*" \
    -x "*.log" \
    -x "frontend/*.log" \
    -x "frontend/test_output.log" \
    -x "frontend/uat_debug.log" \
    -x ".DS_Store" \
    -x ".vscode/*" \
    -x ".idea/*" \
    -x "build/*" \
    -x "*.zip" > /dev/null

# 5. Activos Vitales para un Restore desde Cero
CRITICOS=""
[ -f ".env" ] && CRITICOS="$CRITICOS - .env (Var. Entorno Críticas)\n"
[ -f "frontend/drizzle.config.ts" ] && CRITICOS="$CRITICOS - Drizzle Config (Motor de DB)\n"
[ -f "frontend/lib/db/schema.ts" ] && CRITICOS="$CRITICOS - Esquema de Datos (Source of Truth)\n"
[ -d "frontend/drizzle" ] && CRITICOS="$CRITICOS - Migraciones (Historial de cambios)\n"
[ -f "$DB_DUMP_FILE" ] && CRITICOS="$CRITICOS - SQL Schema Dump (Esquema físico)\n"

TAMANO=$(du -h "$DIRECTORIO_RESPALDO/$NOMBRE_ARCHIVO" | cut -f1)

# 6. Actualizar Bitácora (Markdown)
echo "📝 Actualizando bitácora $ARCHIVO_LOG..."
TEMP_LOG="${ARCHIVO_LOG}.tmp"
{
    echo "## Backup Estructural: $FECHA_ID"
    echo "**Fecha:** $FECHA_HUMANA"
    echo "**Archivo:** $NOMBRE_ARCHIVO"
    echo "**Tamaño:** $TAMANO"
    echo "**Estrategia de Restore:** Código + Esquema SQL"
    echo ""
    echo "### Cambios realizados:"
    echo "$RESUMEN"
    echo ""
    if [ ! -z "$CRITICOS" ]; then
        echo "### Componentes de Reconstrucción (Restore Assets):"
        echo -e "$CRITICOS"
        echo ""
    fi
    echo "---"
    echo ""
    [ -f "$ARCHIVO_LOG" ] && cat "$ARCHIVO_LOG"
} > "$TEMP_LOG" && mv "$TEMP_LOG" "$ARCHIVO_LOG"

# 7. Copiar a Google Drive (Zip y Log)
echo "☁️ Sincronizando con Google Drive..."
cp "$DIRECTORIO_RESPALDO/$NOMBRE_ARCHIVO" "$DIRECTORIO_GOOGLE_DRIVE/"
# Intentamos borrar el log viejo en Drive para evitar errores de permisos al sobrescribir en macOS
rm -f "$DIRECTORIO_GOOGLE_DRIVE/$(basename "$ARCHIVO_LOG")" 2>/dev/null
cp "$ARCHIVO_LOG" "$DIRECTORIO_GOOGLE_DRIVE/"

# Limpieza opcional del dump temporal (descomenta si prefieres no dejar el .sql suelto)
# rm "$DB_DUMP_FILE"

echo "\n✅ Respaldo completado con éxito:"
echo "   - Archivo: $DIRECTORIO_RESPALDO/$NOMBRE_ARCHIVO ($TAMANO)"
echo "   - SQL Dump: $DB_STATUS"
echo "   - Bitácora actualizada: $ARCHIVO_LOG"
echo "   - Sincronizado en Google Drive."
echo "----------------------------------------------------"
