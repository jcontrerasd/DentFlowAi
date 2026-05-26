#!/bin/zsh
# Lanza el toolkit GUI de DentFlowAi cargando variables desde .env raíz

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
VENV_DIR="$SCRIPT_DIR/.venv"

# 1. Cargar todas las variables del .env raíz
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# 2. Crear/activar entorno virtual si no existe
if [ ! -f "$VENV_DIR/bin/activate" ]; then
  echo "📦 Creando entorno virtual..."
  python3 -m venv "$VENV_DIR"
  source "$VENV_DIR/bin/activate"
  pip install -q -r "$SCRIPT_DIR/requirements.txt"
else
  source "$VENV_DIR/bin/activate"
fi

# 3. Lanzar
cd "$SCRIPT_DIR"

if [ "$1" = "--purge-all-data" ]; then
  echo "⚠️  ADVERTENCIA CRÍTICA DE SEGURIDAD ⚠️"
  echo "Estás a punto de BORRAR COMPLETAMENTE la base de datos de DataConnect y TODOS los usuarios de Firebase Auth."
  echo "Esta acción es irreversible."
  echo ""
  echo -n "¿Estás absoluta y completamente SEGURO de querer continuar? (escribe 'SI-BORRAR' para confirmar): "
  read CONFIRM
  if [ "$CONFIRM" = "SI-BORRAR" ]; then
    echo "🚨 Procediendo a borrar los datos... No cierres la terminal."
    python toolkit.py --purge-all-data
  else
    echo "✅ Operación cancelada. Tus datos están a salvo."
  fi
  exit 0
fi

echo "🚀 Iniciando DentFlowAi Toolkit..."

if [ "$1" = "--cli" ]; then
  shift
  python toolkit.py "$@"
else
  streamlit run toolkit_gui.py
fi
