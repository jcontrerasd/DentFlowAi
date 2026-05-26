#!/usr/bin/env python3
import argparse
import sys
import os
import requests
import firebase_admin
from firebase_admin import credentials, auth
from datetime import datetime
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GoogleRequest

ADMIN_SECRET_ENV = "DENTFLOW_ADMIN_SECRET"
PROJECT_ID = "dentflowai-cbcf2"
LOCATION = "us-central1"
SERVICE_ID = "dentflowai-dataconnect"
CONNECTOR_ID = "default"

# Configuración de colores para la terminal
class bcolors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'


def ensure_admin_mode():
    """Exige activar modo admin explícito para operar el toolkit."""
    admin_secret = os.getenv(ADMIN_SECRET_ENV, "")
    if len(admin_secret.strip()) < 16:
        print(
            f"{bcolors.FAIL}❌ Modo admin no habilitado.{bcolors.ENDC}\n"
            f"Define {ADMIN_SECRET_ENV} con un valor robusto (>=16 chars) antes de ejecutar el toolkit."
        )
        sys.exit(1)


def get_credentials_path():
    key_path = os.getenv("FIREBASE_CREDENTIALS_PATH", "").strip()
    if not key_path:
        print(
            f"{bcolors.FAIL}❌ FIREBASE_CREDENTIALS_PATH no está definido.{bcolors.ENDC}\n"
            "Apunta esta variable a un JSON de service account fuera del workspace."
        )
        sys.exit(1)
    if not os.path.exists(key_path):
        print(f"{bcolors.FAIL}❌ No se encontró el archivo de credenciales en '{key_path}'.{bcolors.ENDC}")
        sys.exit(1)
    return key_path

def init_firebase():
    """Inicializa el SDK de Firebase Admin usando la llave service-account."""
    key_path = get_credentials_path()
    
    try:
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    except Exception as e:
        print(f"{bcolors.FAIL}❌ Error al inicializar Firebase: {e}{bcolors.ENDC}")
        sys.exit(1)


def get_google_auth_token():
    key_path = get_credentials_path()
    scopes = [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/firebase",
    ]
    cred = service_account.Credentials.from_service_account_file(key_path, scopes=scopes)
    auth_request = GoogleRequest()
    cred.refresh(auth_request)
    return cred.token


def query_dataconnect(operation_name, variables=None):
    token = get_google_auth_token()
    url = (
        f"https://firebasedataconnect.googleapis.com/v1beta/projects/{PROJECT_ID}/"
        f"locations/{LOCATION}/services/{SERVICE_ID}/connectors/{CONNECTOR_ID}:executeQuery"
    )
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"operationName": operation_name, "variables": variables or {}}
    response = requests.post(url, headers=headers, json=payload, timeout=20)
    if response.status_code != 200:
        raise RuntimeError(f"Data Connect error {response.status_code}: {response.text}")
    return response.json().get("data", {})


def execute_mutation_dataconnect(operation_name, variables=None):
    token = get_google_auth_token()
    url = (
        f"https://firebasedataconnect.googleapis.com/v1beta/projects/{PROJECT_ID}/"
        f"locations/{LOCATION}/services/{SERVICE_ID}/connectors/{CONNECTOR_ID}:executeMutation"
    )
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    payload = {"operationName": operation_name, "variables": variables or {}}
    response = requests.post(url, headers=headers, json=payload, timeout=20)
    if response.status_code != 200:
        raise RuntimeError(f"Data Connect error {response.status_code}: {response.text}")
    return response.json().get("data", {})


def get_profile(uid):
    data = query_dataconnect("GetUserProfile", {"userId": uid})
    return data.get("user")


def sync_claims_for_uid(uid):
    profile = get_profile(uid)
    if not profile:
        print(f"{bcolors.WARNING}⚠️ Sin perfil clínico para {uid}, no se actualizaron claims.{bcolors.ENDC}")
        return False

    role = profile.get("role")
    org = profile.get("organization") or {}
    org_id = org.get("id")
    claims = {
        "role": role,
        "organizationId": org_id,
        "admin": role == "admin",
    }
    auth.set_custom_user_claims(uid, claims)
    print(f"{bcolors.OKGREEN}✅ Claims actualizados para {uid}: role={role}, org={org_id}{bcolors.ENDC}")
    return True


def sync_claims_all():
    page = auth.list_users()
    updated = 0
    while page:
        for user in page.users:
            try:
                if sync_claims_for_uid(user.uid):
                    updated += 1
            except Exception as e:
                print(f"{bcolors.WARNING}⚠️ No se pudieron sincronizar claims para {user.uid}: {e}{bcolors.ENDC}")
        page = page.get_next_page()
    print(f"{bcolors.OKBLUE}ℹ️ Claims sincronizados en {updated} usuarios.{bcolors.ENDC}")

def list_users():
    """Lista todos los usuarios de Firebase Authentication."""
    print(f"\n{bcolors.HEADER}{bcolors.BOLD}=== Listado de Usuarios (Firebase Auth) ==={bcolors.ENDC}\n")
    print(f"{'Email':<35} | {'UID':<30} | {'Creado el':<20}")
    print("-" * 90)
    
    try:
        page = auth.list_users()
        count = 0
        while page:
            for user in page.users:
                created_at = datetime.fromtimestamp(user.user_metadata.creation_timestamp / 1000).strftime('%Y-%m-%d %H:%M')
                print(f"{user.email or 'N/A':<35} | {user.uid:<30} | {created_at:<20}")
                count += 1
            page = page.get_next_page()
        
        print(f"\n{bcolors.OKGREEN}✅ Total: {count} usuarios encontrados.{bcolors.ENDC}\n")
    except Exception as e:
        print(f"{bcolors.FAIL}❌ Error al listar usuarios: {e}{bcolors.ENDC}")

def search_user(email):
    """Busca un usuario específico por email."""
    print(f"\n{bcolors.OKCYAN}🔍 Buscando usuario: {email}...{bcolors.ENDC}")
    try:
        user = auth.get_user_by_email(email)
        created_at = datetime.fromtimestamp(user.user_metadata.creation_timestamp / 1000).strftime('%Y-%m-%d %H:%M')
        last_login = datetime.fromtimestamp(user.user_metadata.last_sign_in_timestamp / 1000).strftime('%Y-%m-%d %H:%M') if user.user_metadata.last_sign_in_timestamp else "Nunca"
        
        print(f"\n{bcolors.BOLD}Resultado:{bcolors.ENDC}")
        print(f" - UID: {user.uid}")
        print(f" - Email: {user.email}")
        print(f" - Verificado: {'SÍ' if user.email_verified else 'NO'}")
        print(f" - Creado: {created_at}")
        print(f" - Último login: {last_login}")
        print(f" - Proveedor: {user.provider_data[0].provider_id if user.provider_data else 'Desconocido'}")
        print("")
    except auth.UserNotFoundError:
        print(f"{bcolors.WARNING}⚠️ Usuario no encontrado.{bcolors.ENDC}")
    except Exception as e:
        print(f"{bcolors.FAIL}❌ Error: {e}{bcolors.ENDC}")

def purge_all_data():
    """Elimina todos los datos de DataConnect y Usuarios de Firebase Auth."""
    print(f"\n{bcolors.FAIL}{bcolors.BOLD}🔥 INICIANDO PURGA TOTAL DE DATOS 🔥{bcolors.ENDC}")
    
    print(f"\n{bcolors.WARNING}1. Borrando registros en DataConnect...{bcolors.ENDC}")
    try:
        res = execute_mutation_dataconnect("DeleteAllData")
        print(f"{bcolors.OKGREEN}✅ DataConnect borrado: {res}{bcolors.ENDC}")
    except Exception as e:
        print(f"{bcolors.FAIL}❌ Error borrando DataConnect: {e}{bcolors.ENDC}")

    print(f"\n{bcolors.WARNING}2. Borrando usuarios de Firebase Authentication...{bcolors.ENDC}")
    deleted = 0
    try:
        page = auth.list_users()
        while page:
            uids = [user.uid for user in page.users]
            if uids:
                auth.delete_users(uids)
                deleted += len(uids)
            page = page.get_next_page()
        print(f"{bcolors.OKGREEN}✅ {deleted} usuarios eliminados de Firebase Auth.{bcolors.ENDC}")
    except Exception as e:
        print(f"{bcolors.FAIL}❌ Error borrando Auth: {e}{bcolors.ENDC}")
    
    print(f"\n{bcolors.BOLD}✅ PURGA FINALIZADA.{bcolors.ENDC}\n")

def main():
    parser = argparse.ArgumentParser(description="DentFlowAI Toolkit - Gestión de Usuarios")
    parser.add_argument("--list", action="store_true", help="Listar todos los usuarios")
    parser.add_argument("--search", type=str, help="Buscar usuario por email")
    parser.add_argument("--sync-claims", action="store_true", help="Sincronizar custom claims para todos los usuarios")
    parser.add_argument("--sync-claims-uid", type=str, help="Sincronizar custom claims para un UID específico")
    parser.add_argument("--purge-all-data", action="store_true", help="Elimina TODOS los datos de DataConnect y Usuarios (Uso administrativo)")
    
    if len(sys.argv) == 1:
        parser.print_help(sys.stderr)
        sys.exit(1)
        
    args = parser.parse_args()

    ensure_admin_mode()
    
    init_firebase()
    
    if args.list:
        list_users()
    elif args.search:
        search_user(args.search)
    elif args.sync_claims_uid:
        sync_claims_for_uid(args.sync_claims_uid)
    elif args.sync_claims:
        sync_claims_all()
    elif args.purge_all_data:
        purge_all_data()

if __name__ == "__main__":
    main()
