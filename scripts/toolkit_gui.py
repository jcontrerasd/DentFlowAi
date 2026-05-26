import streamlit as st
import firebase_admin
from firebase_admin import credentials, auth
import pandas as pd
from datetime import datetime
import os
import requests
import json
from typing import Any
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleRequest
from google.cloud import storage as gcs_storage

# No se requiere import de lucide_react en Python (es para React)
# Usaremos emojis e iconos nativos de Streamlit para máxima compatibilidad

# --- CONFIGURACIÓN DE ESTÉTICA PREMIUM (DENTFLOWAI STYLE) ---
st.set_page_config(
    page_title="DentFlowAI | Admin Console",
    page_icon="🦷",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Paleta de colores oficial
PRIMARY_TEAL = "#2dd4bf"
SECONDARY_SLATE = "#0f172a"
ACCENT_BLUE = "#3b82f6"
GLASS_BG = "rgba(15, 23, 42, 0.85)"
BORDER_COLOR = "rgba(45, 212, 191, 0.1)"

# Inyección de CSS Profesional
st.markdown(f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
    
    html, body, [class*="css"] {{
        font-family: 'Inter', sans-serif;
        color: #f8fafc;
    }}
    
    .stApp {{
        background: radial-gradient(circle at top right, #134e4a 0%, #0f172a 40%);
    }}

    /* Estilo de Tarjetas Glassmorphism */
    .glass-card {{
        background: {GLASS_BG};
        backdrop-filter: blur(16px);
        border: 1px solid {BORDER_COLOR};
        border-radius: 24px;
        padding: 2rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 20px 50px -12px rgba(0,0,0,0.5);
    }}

    /* Métricas */
    [data-testid="stMetricValue"] {{
        font-size: 2.5rem !important;
        font-weight: 800 !important;
        color: {PRIMARY_TEAL} !important;
    }}
    
    [data-testid="stMetricLabel"] {{
        text-transform: uppercase;
        letter-spacing: 0.15em;
        font-weight: 700;
        color: #94a3b8;
    }}

    /* Sidebar */
    [data-testid="stSidebar"] {{
        background-color: #020617 !important;
        border-right: 1px solid {BORDER_COLOR};
    }}

    /* Botones de Acción */
    .stButton>button {{
        border-radius: 14px !important;
        background: linear-gradient(135deg, #0d9488 0%, #065f46 100%) !important;
        color: white !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
        border: none !important;
        padding: 0.8rem 2rem !important;
        transition: all 0.3s ease !important;
    }}
    
    .stButton>button:hover {{
        transform: translateY(-2px);
        box-shadow: 0 10px 20px -5px rgba(13, 148, 136, 0.5) !important;
    }}

    /* Input Search Styling */
    .stTextInput>div>div>input {{
        background-color: rgba(30, 41, 59, 0.5) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        border-radius: 12px !important;
        padding: 12px 20px !important;
    }}
</style>
""", unsafe_allow_html=True)

# --- LÓGICA DE BACKEND (Firebase Admin + Data Connect) ---
KEY_PATH = os.getenv("FIREBASE_CREDENTIALS_PATH", "").strip()
PROJECT_ID = "dentflowai-cbcf2"
LOCATION = "us-central1"
SERVICE_ID = "dentflowai-dataconnect"
CONNECTOR_ID = "default"
ADMIN_SECRET_ENV = "DENTFLOW_ADMIN_SECRET"
DESTRUCTIVE_ENV = "DENTFLOW_ALLOW_DESTRUCTIVE"


def is_admin_mode_enabled() -> bool:
    """Habilita el toolkit solo cuando existe una clave admin robusta en entorno."""
    admin_secret = os.getenv(ADMIN_SECRET_ENV, "")
    return len(admin_secret.strip()) >= 16


def ensure_admin_mode() -> bool:
    if is_admin_mode_enabled():
        return True

    st.error(
        f"❌ Modo admin no habilitado. Define {ADMIN_SECRET_ENV} con un valor robusto (>=16 chars) para operar este panel."
    )
    st.info("Ejemplo: export DENTFLOW_ADMIN_SECRET='tu_secreto_admin_largo'")
    return False


def is_destructive_enabled() -> bool:
    return os.getenv(DESTRUCTIVE_ENV, "").strip().lower() in {"1", "true", "yes", "on"}

def init_firebase():
    if not KEY_PATH:
        st.error("❌ FIREBASE_CREDENTIALS_PATH no está definido.")
        st.info("Usa una ruta externa al workspace para el JSON de service account.")
        st.stop()
    if not os.path.exists(KEY_PATH):
        st.error(f"❌ No se encontró el archivo de credenciales en '{KEY_PATH}'.")
        st.stop()
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)

def get_google_auth_token():
    scopes = ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"]
    cred = service_account.Credentials.from_service_account_file(KEY_PATH, scopes=scopes)
    auth_request = GoogleRequest()
    cred.refresh(auth_request)
    return cred.token

def query_dataconnect_as_admin_user(operation_name, variables=None):
    """Realiza una consulta a Data Connect suplantando a un admin real para sortear el @auth(level: USER)"""
    # 1. Obtener la Web API Key de .env.local
    api_key = None
    env_path = os.path.join(os.path.dirname(__file__), "..", "frontend", ".env.local")
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                if line.startswith("NEXT_PUBLIC_FIREBASE_API_KEY="):
                    api_key = line.strip().split("=")[1]
                    break
    
    if not api_key:
        return {"error": "NEXT_PUBLIC_FIREBASE_API_KEY no encontrada en frontend/.env.local"}

    # 2. Generar Custom Token usando Service Account (Admin SDK)
    try:
        custom_token = auth.create_custom_token("admin_toolkit_pipeline")
    except Exception as e:
        return {"error": f"Fallo al crear custom token: {e}"}

    # 3. Intercambiar por ID Token real usando Identity Toolkit
    try:
        res = requests.post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={api_key}", json={
            "token": custom_token.decode('utf-8'),
            "returnSecureToken": True
        })
        id_token = res.json().get("idToken")
        if not id_token:
            return {"error": f"Fallo intercambiando ID token: {res.text}"}
    except Exception as e:
        return {"error": f"Fallo Identity Toolkit: {e}"}

    # 4. Enviar Petición "como cliente autenticado" a Data Connect
    url = f"https://firebasedataconnect.googleapis.com/v1beta/projects/{PROJECT_ID}/locations/{LOCATION}/services/{SERVICE_ID}/connectors/{CONNECTOR_ID}:executeMutation"
    headers = {
        "X-Goog-Api-Key": api_key,
        "X-Firebase-Auth-Token": id_token,
        "Content-Type": "application/json"
    }
    payload = {"operationName": operation_name, "variables": variables or {}}
    
    try:
        response = requests.post(url, headers=headers, json=payload)
        return response.json().get("data", {}) if response.status_code == 200 else {"error": response.text, "status": response.status_code}
    except Exception as e: 
        return {"error": str(e)}

def query_dataconnect(operation_name, variables=None, is_mutation=False):
    token = get_google_auth_token()
    action = "executeMutation" if is_mutation else "executeQuery"
    url = f"https://firebasedataconnect.googleapis.com/v1beta/projects/{PROJECT_ID}/locations/{LOCATION}/services/{SERVICE_ID}/connectors/{CONNECTOR_ID}:{action}"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"operationName": operation_name, "variables": variables or {}}
    try:
        response = requests.post(url, headers=headers, json=payload)
        return response.json().get("data", {}) if response.status_code == 200 else {"error": response.text, "status": response.status_code}
    except Exception as e: return {"error": str(e)}

# --- ACCIONES ADMINISTRATIVAS ---

def purge_user_storage(uid, organization_id):
    """Elimina físicamente los archivos del usuario en el bucket de Firebase/GCP."""
    # 1. Obtener lista de rutas GCS desde Data Connect
    data = query_dataconnect("GetUserFilesForPurgeScoped", {"userId": uid, "organizationId": organization_id})
    files = data.get("files", [])
    
    if not files:
        return True, "No se encontraron archivos para borrar."

    try:
        # 2. Inicializar cliente de Storage
        client = gcs_storage.Client.from_service_account_json(KEY_PATH)
        # Nota: El nombre del bucket suele ser PROJECT_ID + ".firebasestorage.app" o ".appspot.com"
        # En la config actual de DentFlowAI es el default.
        bucket_name = f"{PROJECT_ID}.firebasestorage.app"
        bucket = client.bucket(bucket_name)
        
        deleted_count = 0
        for f in files:
            if not isinstance(f, dict):
                continue
            path = f.get("gcsPath")
            if path:
                # El path suele venir como gs://bucket/path/to/file o solo path/to/file
                blob_path = path.replace(f"gs://{bucket_name}/", "")
                blob = bucket.blob(blob_path)
                if blob.exists():
                    blob.delete()
                    deleted_count += 1
        
        return True, f"Se eliminaron {deleted_count} archivos del storage."
    except Exception as e:
        return False, f"Error en Storage: {str(e)}"

def delete_full_user(uid, email, organization_id, role):
    """Orquesta la purga total: Storage -> Registros DB -> Auth."""
    if not is_destructive_enabled():
        st.error(f"Acciones destructivas deshabilitadas. Define {DESTRUCTIVE_ENV}=true para continuar.")
        return False

    if str(role).lower() == "admin":
        st.error("No se permite eliminar usuarios con rol admin desde la consola.")
        return False

    progress = st.status("🚀 Iniciando purga total...", expanded=True)
    
    # 1. Purga de Archivos Físicos en GCS
    progress.write("📂 Limpiando archivos en Cloud Storage...")
    storage_ok, storage_msg = purge_user_storage(uid, organization_id)
    if not storage_ok:
        st.warning(storage_msg)
    else:
        progress.write(f"✅ {storage_msg}")

    # 2. Limpieza de registros vinculados (Bids, Files, Annotations)
    progress.write("🔗 Eliminando vínculos en la base de datos...")
    query_dataconnect("DeleteUserBidsScoped", {"userId": uid, "organizationId": organization_id}, is_mutation=True)
    query_dataconnect("DeleteUserFilesScoped", {"userId": uid, "organizationId": organization_id}, is_mutation=True)
    query_dataconnect("DeleteUserAnnotationsScoped", {"userId": uid, "organizationId": organization_id}, is_mutation=True)
    
    # 3. Borrar Perfil de Usuario en Data Connect
    progress.write("👤 Eliminando perfil clínico...")
    query_dataconnect("DeleteUserScoped", {"id": uid, "organizationId": organization_id}, is_mutation=True)

    # 4. Borrar cuenta en Firebase Auth
    progress.write("🔐 Eliminando identidad (Auth)...")
    try:
        auth.delete_user(uid)
        progress.update(label="✅ Purga completada con éxito", state="complete")
        return True
    except Exception as e:
        st.error(f"Error crítico en Auth: {e}")
        progress.update(label="❌ Fallo en el paso final", state="error")
        return False

def manual_verify_user(uid):
    try:
        auth.update_user(uid, email_verified=True)
        return True
    except Exception as e:
        st.error(f"Error al verificar: {e}")
        return False


def sync_user_claims(uid, role, organization_id):
    try:
        claims = {
            "role": str(role).lower(),
            "organizationId": organization_id,
            "admin": str(role).lower() == "admin",
        }
        auth.set_custom_user_claims(uid, claims)
        return True
    except Exception as e:
        st.error(f"Error sincronizando claims: {e}")
        return False

def send_password_reset(email):
    try:
        # Nota: El SDK de Admin genera el link. Enviar el mail lo hace Firebase.
        link = auth.generate_password_reset_link(email)
        return link
    except Exception as e:
        st.error(f"Error al generar link: {e}")
        return None

# --- CARGA DE DATOS UNIFICADA ---

@st.cache_data(ttl=30)
def get_auth_users():
    users = []
    try:
        page = auth.list_users()
        while page:
            for u in page.users:
                users.append({
                    "UID": u.uid,
                    "Email": u.email if u.email else "Sin Email",
                    "Verificado": u.email_verified,
                    "Metodo": u.provider_data[0].provider_id if u.provider_data else "Contraseña",
                    "Nombre": u.display_name or "Desconocido"
                })
            page = page.get_next_page()
    except: pass
    return pd.DataFrame(users)

@st.cache_data(ttl=30)
def get_unified_data():
    dc_data = query_dataconnect("ListAllUsers")
    auth_df = get_auth_users()
    
    trace_data = []
    clinical_ids = []

    users_data: list[Any] = []
    if isinstance(dc_data, dict):
        raw_users = dc_data.get("users", [])
        if isinstance(raw_users, list):
            users_data = raw_users

    for u in users_data:
        if not isinstance(u, dict):
            continue

        uid = str(u.get("id", ""))
        if not uid:
            continue

        clinical_ids.append(uid)
        auth_match = auth_df[auth_df["UID"] == uid]
        is_verified = auth_match["Verificado"].values[0] if not auth_match.empty else False
        method = auth_match["Metodo"].values[0] if not auth_match.empty else "N/A"
        org = u.get("organization") if isinstance(u.get("organization"), dict) else None
        org_name = org.get("name") if org else "—"
        onboarding_step = u.get("onboardingStep", 0)
        full_name = u.get("fullName") or "Sin nombre"
        email = u.get("email", "Sin Email")
        role = str(u.get("role", "Pendiente")).upper()

        trace_data.append({
            "Estado": "✅ Perfil Clínico",
            "Usuario": full_name,
            "Email": email,
            "Verificado": "SÍ" if is_verified else "NO",
            "Rol": role,
            "OrgID": org.get("id", "") if org else "",
            "Organización": org_name,
            "Progreso": f"{onboarding_step}%",
            "Acceso": "Google" if method == "google.com" else "Email/Contraseña",
            "UID": uid
        })

    for _, row in auth_df.iterrows():
        if row["UID"] not in clinical_ids:
            trace_data.append({
                "Estado": "⚠️ Solo Identidad",
                "Usuario": row["Nombre"],
                "Email": row["Email"],
                "Verificado": "SÍ" if row["Verificado"] else "NO",
                "Rol": "Pendiente",
                "OrgID": "",
                "Organización": "—",
                "Progreso": "0%",
                "Acceso": "Google" if row["Metodo"] == "google.com" else "Email/Contraseña",
                "UID": row["UID"]
            })
    
    return pd.DataFrame(trace_data)

# --- INTERFAZ DE USUARIO ---

def main():
    if not ensure_admin_mode():
        return

    init_firebase()
    
    # Navegación Sidebar
    with st.sidebar:
        st.markdown(f"<div style='text-align: center; margin-bottom: 2rem;'><h1 style='color: {PRIMARY_TEAL}; font-style: italic;'>DentFlowAI.</h1><p style='font-size: 0.8rem; font-weight: 800; color: #64748b;'>ADMIN CONSOLE v4.0</p></div>", unsafe_allow_html=True)
        menu = st.radio("Sección", ["📊 Panel de Inteligencia", "🛡️ Gestión de Usuarios", "🛑 Peligro: Purga de Datos"], label_visibility="collapsed")
        st.markdown("---")
        if st.button("🔄 Sincronizar Datos"):
            st.cache_data.clear()
            st.rerun()

    if menu == "📊 Panel de Inteligencia":
        st.markdown("<h1>Inteligencia de Plataforma.</h1>", unsafe_allow_html=True)
        st.markdown("<p style='color: #64748b;'>Resumen ejecutivo y salud de identidades.</p>", unsafe_allow_html=True)
        
        df = get_unified_data()
        
        # Grid de Métricas
        m1, m2, m3, m4 = st.columns(4)
        total = len(df)
        verified = len(df[df["Verificado"] == "SÍ"])
        clinical = len(df[df["Estado"] == "✅ Perfil Clínico"])
        pending = len(df[df["Estado"] == "⚠️ Solo Identidad"])
        
        m1.metric("Usuarios Totales", total)
        m2.metric("Verificados", f"{verified}/{total}")
        m3.metric("Activos (Clínico)", clinical)
        m4.metric("Abandonos (Solo Auth)", pending)

        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.subheader("📈 Distribución por Roles")
        if not df.empty:
            st.bar_chart(df["Rol"].value_counts())
        st.markdown("</div>", unsafe_allow_html=True)

    elif menu == "🛡️ Gestión de Usuarios":
        st.markdown("<h1>Consola de Gestión.</h1>", unsafe_allow_html=True)
        st.markdown("<p style='color: #64748b;'>Auditoría masiva y acciones administrativas de soporte.</p>", unsafe_allow_html=True)
        
        df = get_unified_data()
        
        # 1. GRID PRINCIPAL INTERACTIVA (SELECTOR)
        st.markdown("<div class='glass-card'>", unsafe_allow_html=True)
        st.subheader("🌐 Registro General")
        
        c_search, c_role = st.columns([3, 1])
        with c_search:
            filtro = st.text_input("🔍 Filtrar listado", placeholder="Nombre, Email o UID...")
        with c_role:
            rol_sel = st.selectbox("Filtrar por Rol", ["Todos", "DENTISTA", "TECNICO", "Pendiente"])
        
        # Preparar DF con checkbox
        filtered_df = df.copy()
        if rol_sel != "Todos":
            filtered_df = filtered_df[filtered_df["Rol"] == rol_sel]
        if filtro:
            filtered_df = filtered_df[filtered_df.apply(lambda r: filtro.lower() in str(r).lower(), axis=1)]
        
        # Insertar columna de selección al inicio
        filtered_df.insert(0, "Seleccionar", False)
        
        # Configuración de columnas para el editor
        edited_df = st.data_editor(
            filtered_df,
            hide_index=True,
            use_container_width=True,
            column_config={
                "Seleccionar": st.column_config.CheckboxColumn(
                    "Sel",
                    help="Marca para gestionar",
                    default=False,
                ),
            },
            disabled=[c for c in filtered_df.columns if c != "Seleccionar"]
        )
        
        # Detectar selección
        seleccionados = edited_df[edited_df["Seleccionar"] == True]
        
        c_btn, _ = st.columns([1, 3])
        with c_btn:
            if st.button("🛠️ GESTIONAR SELECCIONADO", disabled=len(seleccionados) == 0):
                show_management_dialog(seleccionados.iloc[0])
        
        st.markdown("</div>", unsafe_allow_html=True)

    elif menu == "🛑 Peligro: Purga de Datos":
        st.markdown("<h1 style='color: #ef4444;'>Purga de Datos.</h1>", unsafe_allow_html=True)
        st.markdown("<p style='color: #ef4444; font-weight: bold;'>⚠️ ZONA DE MÁXIMO RIESGO. Acciones irreversibles.</p>", unsafe_allow_html=True)
        
        st.warning("Esta acción invocará la mutación `DeleteAllData` en Firebase DataConnect, destruyendo todas las tablas del proyecto, e incluye purgación simultánea de los usuarios Auth.")
        
        if not is_destructive_enabled():
            st.error(f"⚠️ Acciones destructivas bloqueadas. Define la variable en .env: `{DESTRUCTIVE_ENV}=true`")
        else:
            st.markdown("Para confirmar el borrado total, escribe **`SI-BORRAR`**:")
            confirm = st.text_input("Confirmación de seguridad", placeholder="SI-BORRAR")
            
            if st.button("🔥 EJECUTAR PURGA TOTAL (DATA CONNECT + AUTH)", type="primary", disabled=(confirm != "SI-BORRAR")):
                with st.spinner("Eliminando datos, no cierres esta ventana..."):
                    error_msg = None
                    try:
                        dc_req = query_dataconnect_as_admin_user("DeleteAllData")
                        if "error" in dc_req:
                            error_msg = f"Data Connect Error: {dc_req['error']}"
                        
                        page = auth.list_users()
                        total_del = 0
                        while page:
                            batch = [u.uid for u in page.users]
                            if batch:
                                auth.delete_users(batch)
                                total_del += len(batch)
                            page = page.get_next_page()
                    except Exception as ex:
                        error_msg = f"Error eliminando datos: {ex}"
                    
                    if error_msg:
                        st.error(error_msg)
                    else:
                        st.success(f"✅ DataConnect purgado.")
                        st.success(f"✅ Auth purgado ({total_del} usuarios).")
                        st.cache_data.clear()

@st.dialog("🛠️ Panel de Control de Usuario")
def show_management_dialog(u_data):
    """Muestra la ficha de gestión en una pantalla flotante (Modal)."""
    
    st.markdown(f"**Nombre:** {u_data['Usuario']}")
    st.markdown(f"**Email:** `{u_data['Email']}`")
    st.markdown(f"**Estado:** {u_data['Estado']}")
    
    st.divider()
    
    # --- ACCIONES DE SOPORTE ---
    st.subheader("⚡ Acciones Rápidas")
    
    # Fila 1: Verificación y Password
    c1, c2 = st.columns(2)
    with c1:
        if u_data['Verificado'] == "NO":
            if st.button("✔️ Validar Identidad"):
                if manual_verify_user(u_data['UID']):
                    st.success("¡Usuario verificado!")
                    st.cache_data.clear()
                    st.rerun()
        else:
            st.success("✅ Cuenta Verificada")
    
    with c2:
        if st.button("🔑 Link de Password Reset"):
            reset_link = send_password_reset(u_data['Email'])
            if reset_link:
                st.code(reset_link, language="text")
                st.info("Copia este enlace para el usuario.")

    if st.button("🧩 Sincronizar Claims (role/org)"):
        if sync_user_claims(u_data['UID'], u_data['Rol'], u_data['OrgID']):
            st.success("Claims sincronizados correctamente")

    st.divider()
    
    # Fila 2: Peligro
    st.subheader("⚠️ Zona Peligrosa")
    with st.expander("Expandir para eliminar usuario"):
        st.error("Esta acción eliminará Auth y Data Connect permanentemente.")
        if not is_destructive_enabled():
            st.warning(f"Define {DESTRUCTIVE_ENV}=true para habilitar purgas.")
        confirm_kill = st.checkbox(f"Confirmar eliminación de {u_data['Email']}")
        if st.button("🔴 EJECUTAR PURGA DEFINITIVA", disabled=not confirm_kill or not is_destructive_enabled()):
            if delete_full_user(u_data['UID'], u_data['Email'], u_data['OrgID'], u_data['Rol']):
                st.success("Usuario eliminado.")
                st.cache_data.clear()
                st.rerun()

if __name__ == "__main__":
    main()
