#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DentFlowAi · GUI de Deploy (Tkinter)
====================================

Versión gráfica de `deploy.sh` / `deploy-wizard.sh`. Ordena y documenta el ciclo
de despliegue **local → dev → prod** de forma independiente, y permite ajustar las
variables de entorno por deploy (p. ej. el flag de correo `NOTIFICATIONS_LIVE`).

Uso:
    cd frontend && python3 deploy_gui.py

Sin dependencias externas: usa solo la librería estándar de Python (tkinter).

Equivalencias con los scripts existentes (la GUI **reimplementa** los comandos,
como el wizard; no invoca deploy.sh):
  - Lectura de .env.local con scoping _DEV/_PROD  ↔  read_env / read_env_scoped (deploy.sh)
  - Build:   gcloud builds submit . --config=cloudbuild.yaml --substitutions=_TAG=<tag>
  - Deploy:  gcloud run deploy <service> --image gcr.io/<proj>/frontend:<tag> ...
  - Local:   docker compose up/down · npm run dev · npx tsx scripts/seed-uat.ts

GOTCHA importante (ver memoria del proyecto): `read_env` de deploy.sh NO recorta
comentarios inline. Esta GUI sí los recorta al LEER, y al GUARDAR en .env.local
escribe las claves _DEV/_PROD SIN comentario inline para no romper comparaciones
como `process.env.NOTIFICATIONS_LIVE === 'true'`.
"""

from __future__ import annotations

import os
import re
import queue
import shutil
import signal
import secrets
import subprocess
import tempfile
import threading
from datetime import datetime
from pathlib import Path

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

# ──────────────────────────────────────────────────────────────────────────────
# Constantes (espejo de deploy.sh / deploy-wizard.sh)
# ──────────────────────────────────────────────────────────────────────────────
PROJECT_ID = "dentflowai-cbcf2"
REGION = "southamerica-west1"
ENV_FILENAME = ".env.local"

# frontend/ es el cwd esperado; la raíz del repo (docker-compose.yml) está un nivel arriba.
FRONTEND_DIR = Path(__file__).resolve().parent
REPO_ROOT = FRONTEND_DIR.parent
ENV_PATH = FRONTEND_DIR / ENV_FILENAME

ENVIRONMENTS = {
    "develop": {
        "suffix": "DEV",
        "service": "dentflowai-frontend-dev",
        "tag": "develop",
        "label": "STAGING (dev)",
        "accent": "#1f9d55",   # verde
    },
    "production": {
        "suffix": "PROD",
        "service": "dentflowai-frontend",
        "tag": "latest",
        "label": "PRODUCCIÓN (prod)",
        "accent": "#c0392b",   # rojo
    },
}

# Flags de comportamiento (clave -> (label, descripción)). Textos tomados del wizard.
BEHAVIOR_FLAGS = [
    ("NOTIFICATIONS_LIVE",
     "Emails reales",
     "Interruptor maestro de correos. ON = se envían de verdad. OFF = se SIMULAN "
     "(se escriben al log, no salen) aunque haya credenciales EmailJS. En staging, "
     "ON con datos clonados de prod implica correos a usuarios reales."),
    ("AVAILABILITY_MODEL_ENABLED",
     "Modelo disponibilidad",
     "Switch maestro v5.0. ON = Fauchard usa disponibilidad declarada (AND triple) + "
     "score con sanción rolling + cola + countdown de revisión. OFF = comportamiento "
     "anterior (exclusión binaria a 3 no-respuestas). Si está OFF, los demás flags v5.0 "
     "quedan inertes."),
    ("AVAILABILITY_UI_TECNICO_ENABLED",
     "UI técnico (badge+panel)",
     "Muestra al técnico el badge de disponibilidad en el header y el panel "
     "/dashboard/profile/availability para prender/apagar su disponibilidad por categoría."),
    ("AVAILABILITY_ADMIN_PANEL_ENABLED",
     "Panel admin Fauchard",
     "Habilita en el admin de Fauchard la pestaña 'Plazos y Sanciones' (umbrales, pesos, "
     "ventanas) y el dashboard de Observabilidad (métricas con gráficos)."),
    ("REJECTION_INDIVIDUAL_ENABLED",
     "Rechazo individual UCH",
     "Muestra el botón 'Rechazar invitación' en el hilo del caso (UCH) del técnico. "
     "Al rechazar, Fauchard invita automáticamente al siguiente del pool. No cuenta como "
     "no-respuesta (no penaliza)."),
    ("POOL_PENDIENTE_ENABLED",
     "Cola pendiente_pool",
     "Cuando Fauchard no encuentra técnicos elegibles, el caso entra a una cola de espera "
     "(TTL + check-in al dentista) en vez de fallar de inmediato. Requiere AVAILABILITY_MODEL_ENABLED."),
    ("LEAGUE_ENGINE_ENABLED",
     "Motor de ligas (Fase 2)",
     "Movimiento automático entre ligas (ascenso/transición/descenso) + cron diario. "
     "Gating de selección por liga. Idempotente e inerte con el flag off."),
]

# Secretos / URLs editables por deploy.
SECRET_FIELDS = [
    ("CRON_SECRET", "CRON_SECRET", True,
     "Protege los endpoints /api/cron/*. Cloud Scheduler lo manda en Authorization: Bearer. "
     "Si no coincide con el del scheduler, la llamada se rechaza (401). Recomendado distinto por ambiente."),
    ("AUTH_URL", "AUTH_URL", False,
     "URL pública que NextAuth usa para callbacks de login. Debe coincidir con la URL real "
     "del servicio Cloud Run. En el primer deploy puede ir vacía (bootstrap)."),
    ("NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_URL", False,
     "URL base incrustada en el bundle del cliente y en los links de los correos. Debe apuntar "
     "al dominio de ESTE ambiente."),
]

# Recursos Cloud Run opcionales (clave gcloud, label, placeholder/ejemplo).
CLOUD_RUN_RESOURCES = [
    ("--memory", "Memoria", "ej. 1Gi"),
    ("--cpu", "CPU (vCPU)", "ej. 1"),
    ("--min-instances", "Min instancias", "ej. 0"),
    ("--max-instances", "Max instancias", "ej. 4"),
    ("--concurrency", "Concurrencia", "ej. 80"),
    ("--timeout", "Timeout (s)", "ej. 300"),
]

# Variables de recursos del ambiente (solo lectura en la GUI; se editan en .env.local).
RESOURCE_KEYS = ["DATABASE_URL", "GCP_BUCKET_NAME", "AUTH_SECRET", "GCP_PROJECT_ID",
                 "EMAILJS_SERVICE_ID", "EMAILJS_TEMPLATE_ID", "EMAILJS_PUBLIC_KEY",
                 "EMAILJS_PRIVATE_KEY"]

CICLO_DOC = REPO_ROOT / "Doc" / "Ciclo_Desarrollo.md"


# ──────────────────────────────────────────────────────────────────────────────
# Capa de entorno: lectura/escritura de .env.local (espejo de deploy.sh)
# ──────────────────────────────────────────────────────────────────────────────
class EnvFile:
    """Lee/escribe .env.local respetando el scoping _DEV/_PROD de deploy.sh."""

    def __init__(self, path: Path):
        self.path = path

    # -- lectura -------------------------------------------------------------
    def _raw_line(self, key: str) -> str | None:
        if not self.path.exists():
            return None
        pat = re.compile(rf"^{re.escape(key)}=(.*)$")
        for line in self.path.read_text(encoding="utf-8").splitlines():
            m = pat.match(line)
            if m:
                return m.group(1)
        return None

    @staticmethod
    def _clean_value(raw: str) -> str:
        """Quita comillas envolventes y recorta comentario inline + espacios.

        Más robusto que read_env de bash (que NO recorta comentarios)."""
        v = raw.strip()
        # comentario inline: ' #...' (espacio + almohadilla). No partir un '#' pegado a un valor.
        v = re.split(r"\s+#", v, maxsplit=1)[0].strip()
        # comillas envolventes
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        return v

    def read(self, key: str) -> str:
        raw = self._raw_line(key)
        return self._clean_value(raw) if raw is not None else ""

    def exists_key(self, key: str) -> bool:
        return self._raw_line(key) is not None

    def resolve(self, base: str, suffix: str) -> str:
        """Prefiere base_SUFFIX, cae a base plano, luego ''."""
        scoped = f"{base}_{suffix}"
        if self.exists_key(scoped):
            return self.read(scoped)
        if self.exists_key(base):
            return self.read(base)
        return ""

    def source_of(self, base: str, suffix: str) -> str:
        if self.exists_key(f"{base}_{suffix}"):
            return f"_{suffix}"
        if self.exists_key(base):
            return "plano"
        return "default"

    # -- escritura -----------------------------------------------------------
    def backup(self) -> Path:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = self.path.with_name(self.path.name + f".bak-{stamp}")
        shutil.copy2(self.path, dest)
        return dest

    def write(self, key: str, value: str) -> None:
        """Reemplaza la línea KEY=... o la inserta al final. SIN comentario inline."""
        lines = self.path.read_text(encoding="utf-8").splitlines()
        pat = re.compile(rf"^{re.escape(key)}=")
        new_line = f"{key}={value}"
        replaced = False
        for i, line in enumerate(lines):
            if pat.match(line):
                lines[i] = new_line
                replaced = True
                break
        if not replaced:
            lines.append(new_line)
        self.path.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────────────
# Capa de ejecución: subprocess con streaming a la consola Tk
# ──────────────────────────────────────────────────────────────────────────────
class Runner:
    """Ejecuta comandos en un hilo y encola la salida para la UI (Tk-safe)."""

    def __init__(self, log_queue: queue.Queue):
        self.q = log_queue
        self.proc: subprocess.Popen | None = None
        self.long_proc: subprocess.Popen | None = None  # npm run dev, etc.
        self._lock = threading.Lock()
        self._active = False  # ocupado con un comando/tarea de un disparo

    @property
    def busy(self) -> bool:
        return self._active

    def log(self, text: str) -> None:
        self.q.put(text)

    def run(self, args: list[str], cwd: Path, on_done=None, label: str | None = None) -> None:
        """Lanza un comando de un solo disparo en un hilo de trabajo."""
        if self._active:
            self.log("⚠ Ya hay un comando en ejecución; espera a que termine.\n")
            return
        self._active = True  # se marca en el hilo de UI (sin carrera con el guard)

        def worker():
            shown = label or " ".join(args)
            self.log(f"\n$ {shown}\n")
            rc = 1
            proc = None
            try:
                proc = subprocess.Popen(
                    args, cwd=str(cwd),
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1,
                )
                with self._lock:
                    self.proc = proc
                assert proc.stdout is not None
                for line in proc.stdout:
                    self.log(line)
                proc.wait()
                rc = proc.returncode
                self.log(f"\n[exit {rc}]\n")
            except FileNotFoundError:
                rc = 127
                self.log(f"✗ No se encontró el ejecutable: {args[0]}\n")
            except Exception as exc:  # noqa: BLE001
                rc = 1
                self.log(f"✗ Error: {exc}\n")
            finally:
                with self._lock:
                    self.proc = None
                self._active = False
                if on_done is not None:
                    self.q.put(("__done__", on_done, rc))

        threading.Thread(target=worker, daemon=True).start()

    def run_func(self, fn, on_done=None) -> None:
        """Ejecuta una función (que recibe `log`) en un hilo, guardada por `busy`.

        Útil para tareas que combinan varios comandos con captura de salida
        (p. ej. la verificación: URL + env vars + smoke test) sin compartir
        `self.proc` entre disparos concurrentes."""
        if self._active:
            self.log("⚠ Ya hay un comando en ejecución; espera a que termine.\n")
            return
        self._active = True

        def worker():
            rc = 0
            try:
                fn(self.log)
            except Exception as exc:  # noqa: BLE001
                rc = 1
                self.log(f"✗ Error: {exc}\n")
            finally:
                self._active = False
                if on_done is not None:
                    self.q.put(("__done__", on_done, rc))

        threading.Thread(target=worker, daemon=True).start()

    def start_long(self, args: list[str], cwd: Path, label: str) -> None:
        """Proceso de larga duración (npm run dev) con stop manual."""
        if self.long_proc is not None and self.long_proc.poll() is None:
            self.log("⚠ Ya hay un proceso de larga duración activo (deténlo primero).\n")
            return

        def worker():
            self.log(f"\n$ {label}\n")
            try:
                self.long_proc = subprocess.Popen(
                    args, cwd=str(cwd),
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, bufsize=1, start_new_session=True,
                )
                assert self.long_proc.stdout is not None
                for line in self.long_proc.stdout:
                    self.log(line)
                self.long_proc.wait()
                self.log(f"\n[{label} terminó: exit {self.long_proc.returncode}]\n")
            except Exception as exc:  # noqa: BLE001
                self.log(f"✗ Error: {exc}\n")

        threading.Thread(target=worker, daemon=True).start()

    def stop_long(self) -> None:
        if self.long_proc is None or self.long_proc.poll() is not None:
            self.log("No hay proceso de larga duración activo.\n")
            return
        try:
            os.killpg(os.getpgid(self.long_proc.pid), signal.SIGTERM)
            self.log("→ Señal de detención enviada (SIGTERM).\n")
        except Exception as exc:  # noqa: BLE001
            self.log(f"✗ No se pudo detener: {exc}\n")


def which(binary: str) -> bool:
    return shutil.which(binary) is not None


def mask(value: str) -> str:
    if not value:
        return "(vacío)"
    if len(value) <= 8:
        return "••••"
    return value[:4] + "…••••"


# ──────────────────────────────────────────────────────────────────────────────
# UI principal
# ──────────────────────────────────────────────────────────────────────────────
class DeployGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.env = EnvFile(ENV_PATH)
        self.log_queue: queue.Queue = queue.Queue()
        self.runner = Runner(self.log_queue)

        root.title("DentFlowAi · Deploy GUI")
        root.geometry("1040x760")
        root.minsize(900, 640)

        self._build_header()
        self._build_notebook()
        self._build_console()
        self._build_statusbar()

        self.root.after(80, self._drain_log)
        self._preflight()

    # -- layout --------------------------------------------------------------
    def _build_header(self):
        bar = ttk.Frame(self.root, padding=(12, 8))
        bar.pack(fill="x")
        ttk.Label(bar, text="DentFlowAi · Deploy",
                  font=("TkDefaultFont", 14, "bold")).pack(side="left")
        ttk.Label(bar, text="  local → dev → prod   (cada ambiente es independiente)",
                  foreground="#666").pack(side="left")
        ttk.Button(bar, text="Ayuda / Doc", command=self._open_doc).pack(side="right")

    def _build_notebook(self):
        self.nb = ttk.Notebook(self.root)
        self.nb.pack(fill="both", expand=True, padx=12, pady=(0, 6))
        self._build_local_tab()
        self.env_tabs = {}
        for env_key in ("develop", "production"):
            self.env_tabs[env_key] = EnvTab(self.nb, self, env_key)

    def _build_console(self):
        frame = ttk.LabelFrame(self.root, text="Consola", padding=6)
        frame.pack(fill="both", expand=True, padx=12, pady=(0, 6))
        self.console = scrolledtext.ScrolledText(
            frame, height=12, wrap="word", state="disabled",
            font=("Menlo", 11), background="#11141a", foreground="#d6dae0",
        )
        self.console.pack(fill="both", expand=True)
        btns = ttk.Frame(frame)
        btns.pack(fill="x", pady=(4, 0))
        ttk.Button(btns, text="Limpiar consola", command=self._clear_console).pack(side="right")

    def _build_statusbar(self):
        self.status = tk.StringVar(value="Listo.")
        bar = ttk.Frame(self.root, padding=(12, 4))
        bar.pack(fill="x")
        ttk.Label(bar, textvariable=self.status, foreground="#444").pack(side="left")

    # -- pestaña local -------------------------------------------------------
    def _build_local_tab(self):
        tab = ttk.Frame(self.nb, padding=12)
        self.nb.add(tab, text="Local")

        intro = ("Entorno local: Docker (Postgres + fake-gcs) + Next.js dev server. "
                 "No se 'despliega' a Cloud Run; son acciones en tu máquina.")
        ttk.Label(tab, text=intro, wraplength=900, foreground="#555").pack(anchor="w", pady=(0, 10))

        grp = ttk.LabelFrame(tab, text="Docker (raíz del repo)", padding=10)
        grp.pack(fill="x", pady=4)
        ttk.Button(grp, text="Levantar (up -d)",
                   command=lambda: self._run(["docker", "compose", "up", "-d"], REPO_ROOT)).pack(side="left", padx=4)
        ttk.Button(grp, text="Detener (down)",
                   command=lambda: self._run(["docker", "compose", "down"], REPO_ROOT)).pack(side="left", padx=4)
        ttk.Button(grp, text="Estado (ps)",
                   command=lambda: self._run(["docker", "compose", "ps"], REPO_ROOT)).pack(side="left", padx=4)

        grp2 = ttk.LabelFrame(tab, text="App de desarrollo (frontend/)", padding=10)
        grp2.pack(fill="x", pady=4)
        ttk.Button(grp2, text="Iniciar npm run dev",
                   command=lambda: self.runner.start_long(["npm", "run", "dev"], FRONTEND_DIR, "npm run dev")
                   ).pack(side="left", padx=4)
        ttk.Button(grp2, text="Detener npm run dev",
                   command=self.runner.stop_long).pack(side="left", padx=4)
        ttk.Button(grp2, text="Seed UAT",
                   command=lambda: self._run(["npx", "tsx", "scripts/seed-uat.ts"], FRONTEND_DIR)).pack(side="left", padx=4)
        ttk.Button(grp2, text="Health-check :3000",
                   command=self._health_local).pack(side="left", padx=4)

        grp3 = ttk.LabelFrame(tab, text="Config local (solo lectura · claves planas de .env.local)", padding=10)
        grp3.pack(fill="x", pady=8)
        for key in ("DATABASE_URL", "GCS_API_ENDPOINT", "GCP_BUCKET_NAME"):
            val = self.env.read(key)
            if key == "DATABASE_URL":
                val = re.sub(r"//([^:]+):[^@]+@", r"//\1:••••@", val)
            row = ttk.Frame(grp3)
            row.pack(fill="x", pady=1)
            ttk.Label(row, text=key, width=22, foreground="#555").pack(side="left")
            ttk.Label(row, text=val or "(vacío)").pack(side="left")

    def _health_local(self):
        self._run(["curl", "-sS", "-o", "/dev/null", "-w", "HTTP %{http_code}\\n",
                   "--max-time", "5", "http://localhost:3000/"], FRONTEND_DIR,
                  label="health-check http://localhost:3000")

    # -- ejecución / consola -------------------------------------------------
    def _run(self, args, cwd, on_done=None, label=None):
        self.runner.run(args, cwd, on_done=on_done, label=label)

    def _drain_log(self):
        try:
            while True:
                item = self.log_queue.get_nowait()
                if isinstance(item, tuple) and item and item[0] == "__done__":
                    _, cb, rc = item
                    try:
                        cb(rc)
                    except Exception:  # noqa: BLE001
                        pass
                    continue
                self._append(item)
        except queue.Empty:
            pass
        self.root.after(80, self._drain_log)

    def _append(self, text: str):
        self.console.configure(state="normal")
        self.console.insert("end", text)
        self.console.see("end")
        self.console.configure(state="disabled")

    def _clear_console(self):
        self.console.configure(state="normal")
        self.console.delete("1.0", "end")
        self.console.configure(state="disabled")

    def set_status(self, text: str):
        self.status.set(text)

    # -- misc ----------------------------------------------------------------
    def _open_doc(self):
        if CICLO_DOC.exists():
            try:
                subprocess.Popen(["open", str(CICLO_DOC)])
                return
            except Exception:  # noqa: BLE001
                pass
        messagebox.showinfo("Documentación",
                            f"Flujo completo en:\n{CICLO_DOC}\n\nlocal → dev → prod. "
                            "Cada ambiente es independiente (servicio + BD + bucket propios).")

    def _preflight(self):
        # Parte rápida (no bloquea): binarios + presencia de .env.local.
        bins = {b: which(b) for b in ("gcloud", "docker", "npm", "npx", "curl")}
        missing = [b for b, ok in bins.items() if not ok]
        env_ok = ENV_PATH.exists()
        base = (".env.local ✓" if env_ok else ".env.local ✗ FALTA")
        if missing:
            base += " · faltan binarios: " + ", ".join(missing)
        self._append(
            "Preflight\n"
            f"  .env.local : {'OK' if env_ok else 'NO ENCONTRADO en ' + str(ENV_PATH)}\n"
            f"  binarios   : " + ", ".join(f"{b}{'✓' if ok else '✗'}" for b, ok in bins.items()) + "\n"
        )
        self.set_status("Comprobando cuenta gcloud…   |   " + base)

        if not bins["gcloud"]:
            self.set_status("gcloud no instalado   |   " + base)
            return

        # Parte lenta (gcloud arranca lento): en un hilo, para no congelar la UI.
        def lookup():
            try:
                account = subprocess.run(
                    ["gcloud", "config", "get-value", "account"],
                    capture_output=True, text=True, timeout=15).stdout.strip() or "(sin cuenta)"
                project = subprocess.run(
                    ["gcloud", "config", "get-value", "project"],
                    capture_output=True, text=True, timeout=15).stdout.strip() or "(sin proyecto)"
            except Exception:  # noqa: BLE001
                account = project = "(no disponible)"

            def update(_rc):  # corre en el hilo de UI vía la cola
                self._append(f"  cuenta gcloud : {account}\n  proyecto      : {project}\n")
                self.set_status(f"gcloud: {account} · proyecto {project}   |   {base}")

            self.log_queue.put(("__done__", update, 0))

        threading.Thread(target=lookup, daemon=True).start()


# ──────────────────────────────────────────────────────────────────────────────
# Pestaña de ambiente cloud (dev / prod) — componente reutilizable
# ──────────────────────────────────────────────────────────────────────────────
class EnvTab:
    def __init__(self, notebook: ttk.Notebook, app: DeployGUI, env_key: str):
        self.app = app
        self.env = app.env
        self.env_key = env_key
        meta = ENVIRONMENTS[env_key]
        self.suffix = meta["suffix"]
        self.service = meta["service"]
        self.tag = meta["tag"]
        self.accent = meta["accent"]

        outer = ttk.Frame(notebook, padding=4)
        notebook.add(outer, text=meta["label"])

        # Scroll (los formularios son largos).
        canvas = tk.Canvas(outer, highlightthickness=0)
        scroll = ttk.Scrollbar(outer, orient="vertical", command=canvas.yview)
        self.body = ttk.Frame(canvas, padding=10)
        self.body.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=self.body, anchor="nw")
        canvas.configure(yscrollcommand=scroll.set)
        canvas.pack(side="left", fill="both", expand=True)
        scroll.pack(side="right", fill="y")

        self.flag_vars: dict[str, tk.BooleanVar] = {}
        self.flag_src: dict[str, ttk.Label] = {}
        self.secret_vars: dict[str, tk.StringVar] = {}
        self.cr_vars: dict[str, tk.StringVar] = {}
        self.warn_var = tk.StringVar(value="")

        self._build()

    # -- construcción --------------------------------------------------------
    def _build(self):
        meta = ENVIRONMENTS[self.env_key]
        banner = tk.Label(self.body, text=f"  ▸  {meta['label']}   ·   servicio: {self.service}",
                          bg=self.accent, fg="white", anchor="w",
                          font=("TkDefaultFont", 12, "bold"), padx=10, pady=6)
        banner.pack(fill="x", pady=(0, 10))

        self._section_resources()
        self._section_flags()
        self._section_secrets()
        self._section_cloudrun()
        self._section_actions()

    def _section_resources(self):
        grp = ttk.LabelFrame(self.body, text="Recursos del ambiente (solo lectura · se editan en .env.local)", padding=10)
        grp.pack(fill="x", pady=4)
        db = self.env.resolve("DATABASE_URL", self.suffix)
        host = re.sub(r".*@([^:/]+).*", r"\1", db) if db else "(vacío)"
        rows = [
            ("Base de datos (host)", host),
            ("Bucket GCS", self.env.resolve("GCP_BUCKET_NAME", self.suffix) or "(vacío)"),
            ("AUTH_URL (.env)", self.env.resolve("AUTH_URL", self.suffix) or "(bootstrap)"),
            ("AUTH_SECRET", "✓ definido" if self.env.read("AUTH_SECRET") else "✗ vacío"),
            ("GCP_PROJECT_ID", self.env.read("GCP_PROJECT_ID") or "(vacío)"),
            ("EmailJS creds", "✓ definidas" if self.env.read("EMAILJS_PRIVATE_KEY") else "✗ faltan"),
        ]
        for label, val in rows:
            row = ttk.Frame(grp)
            row.pack(fill="x", pady=1)
            ttk.Label(row, text=label, width=24, foreground="#555").pack(side="left")
            ttk.Label(row, text=val).pack(side="left")

    def _section_flags(self):
        grp = ttk.LabelFrame(self.body, text="Comportamiento · flags v5.0 (ajuste para ESTE deploy)", padding=10)
        grp.pack(fill="x", pady=4)
        for key, label, desc in BEHAVIOR_FLAGS:
            cur = self.env.resolve(key, self.suffix).lower() == "true"
            var = tk.BooleanVar(value=cur)
            self.flag_vars[key] = var
            row = ttk.Frame(grp)
            row.pack(fill="x", pady=1)
            cb = ttk.Checkbutton(row, text=label, variable=var,
                                 command=self._update_warning)
            cb.pack(side="left")
            src = ttk.Label(row, text=f"origen: {self.env.source_of(key, self.suffix)}",
                            foreground="#999")
            src.pack(side="left", padx=8)
            self.flag_src[key] = src
            ttk.Button(row, text="?", width=2,
                       command=lambda l=label, d=desc: self._info(l, d)).pack(side="right")

        warn = ttk.Label(grp, textvariable=self.warn_var, foreground="#b9770e",
                         wraplength=860, font=("TkDefaultFont", 11, "bold"))
        warn.pack(fill="x", pady=(8, 0))
        self._update_warning()

    def _section_secrets(self):
        grp = ttk.LabelFrame(self.body, text="Seguridad · secretos / URLs (ajuste para ESTE deploy)", padding=10)
        grp.pack(fill="x", pady=4)
        for key, label, is_secret, desc in SECRET_FIELDS:
            var = tk.StringVar(value=self.env.resolve(key, self.suffix))
            self.secret_vars[key] = var
            row = ttk.Frame(grp)
            row.pack(fill="x", pady=2)
            ttk.Label(row, text=label, width=20).pack(side="left")
            entry = ttk.Entry(row, textvariable=var, width=52,
                              show="•" if is_secret else "")
            entry.pack(side="left", padx=4)
            if key == "CRON_SECRET":
                ttk.Button(row, text="Generar",
                           command=lambda v=var: v.set(secrets.token_hex(32))).pack(side="left", padx=2)
            ttk.Button(row, text="?", width=2,
                       command=lambda l=label, d=desc: self._info(l, d)).pack(side="right")

    def _section_cloudrun(self):
        grp = ttk.LabelFrame(self.body, text="Cloud Run · recursos (opcional · vacío = sin cambio)", padding=10)
        grp.pack(fill="x", pady=4)
        for flag, label, ph in CLOUD_RUN_RESOURCES:
            var = tk.StringVar(value="")
            self.cr_vars[flag] = var
            row = ttk.Frame(grp)
            row.pack(fill="x", pady=1)
            ttk.Label(row, text=label, width=20).pack(side="left")
            e = ttk.Entry(row, textvariable=var, width=16)
            e.pack(side="left", padx=4)
            ttk.Label(row, text=ph, foreground="#999").pack(side="left")

    def _section_actions(self):
        grp = ttk.Frame(self.body, padding=(0, 10))
        grp.pack(fill="x", pady=8)
        ttk.Button(grp, text="💾 Guardar en .env.local", command=self._save_env).pack(side="left", padx=4)
        ttk.Button(grp, text="👁 Dry-run (ver plan)", command=self._dry_run).pack(side="left", padx=4)
        ttk.Button(grp, text="🔍 Verificar", command=self._verify).pack(side="left", padx=4)
        deploy_btn = tk.Button(grp, text="🚀 Desplegar", command=self._deploy,
                               bg=self.accent, fg="white", font=("TkDefaultFont", 12, "bold"),
                               padx=14, pady=4, activebackground=self.accent)
        deploy_btn.pack(side="right", padx=4)

    # -- helpers de estado ---------------------------------------------------
    def _info(self, label, desc):
        messagebox.showinfo(label, desc)

    def _update_warning(self):
        if self.env_key == "develop" and self.flag_vars["NOTIFICATIONS_LIVE"].get():
            self.warn_var.set("⚠ NOTIFICATIONS_LIVE=ON en STAGING: con datos clonados de prod se "
                              "enviarán correos REALES a usuarios reales.")
        else:
            self.warn_var.set("")

    def _collect_env_vars(self) -> dict[str, str]:
        """Arma el set completo de env vars a inyectar (espejo de deploy.sh)."""
        e = self.env
        ev = {
            "DATABASE_URL": e.resolve("DATABASE_URL", self.suffix),
            "AUTH_SECRET": e.read("AUTH_SECRET"),
            "AUTH_TRUST_HOST": "true",
            "GCP_PROJECT_ID": e.read("GCP_PROJECT_ID"),
            "GCP_BUCKET_NAME": e.resolve("GCP_BUCKET_NAME", self.suffix),
            "EMAILJS_SERVICE_ID": e.read("EMAILJS_SERVICE_ID"),
            "EMAILJS_TEMPLATE_ID": e.read("EMAILJS_TEMPLATE_ID"),
            "EMAILJS_PUBLIC_KEY": e.read("EMAILJS_PUBLIC_KEY"),
            "EMAILJS_PRIVATE_KEY": e.read("EMAILJS_PRIVATE_KEY"),
            "NEXT_TELEMETRY_DISABLED": "1",
            "NODE_ENV": "production",
        }
        # secretos / URLs (solo si tienen valor, como deploy.sh)
        for key, _, _, _ in SECRET_FIELDS:
            val = self.secret_vars[key].get().strip()
            if val:
                ev[key] = val
        # flags (siempre presentes)
        for key, _, _ in BEHAVIOR_FLAGS:
            ev[key] = "true" if self.flag_vars[key].get() else "false"
        return ev

    def _missing_required(self) -> list[str]:
        e = self.env
        req = {
            f"DATABASE_URL_{self.suffix}": e.resolve("DATABASE_URL", self.suffix),
            "AUTH_SECRET": e.read("AUTH_SECRET"),
            "GCP_PROJECT_ID": e.read("GCP_PROJECT_ID"),
            f"GCP_BUCKET_NAME_{self.suffix}": e.resolve("GCP_BUCKET_NAME", self.suffix),
            "EMAILJS_SERVICE_ID": e.read("EMAILJS_SERVICE_ID"),
            "EMAILJS_TEMPLATE_ID": e.read("EMAILJS_TEMPLATE_ID"),
            "EMAILJS_PUBLIC_KEY": e.read("EMAILJS_PUBLIC_KEY"),
            "EMAILJS_PRIVATE_KEY": e.read("EMAILJS_PRIVATE_KEY"),
        }
        missing = [k for k, v in req.items() if not v]
        if self.env_key == "production":
            for key in ("AUTH_URL", "NEXT_PUBLIC_APP_URL"):
                if not self.secret_vars[key].get().strip():
                    missing.append(key)
        return missing

    def _cr_flags(self) -> list[str]:
        flags = []
        for flag, _, _ in CLOUD_RUN_RESOURCES:
            val = self.cr_vars[flag].get().strip()
            if val:
                flags += [flag, val]
        return flags

    # -- acciones ------------------------------------------------------------
    def _save_env(self):
        suffix = self.suffix
        changes: list[tuple[str, str]] = []
        for key, _, _ in BEHAVIOR_FLAGS:
            changes.append((f"{key}_{suffix}", "true" if self.flag_vars[key].get() else "false"))
        for key, _, _, _ in SECRET_FIELDS:
            val = self.secret_vars[key].get().strip()
            if val:
                changes.append((f"{key}_{suffix}", val))
        preview = "\n".join(f"  {k} = {mask(v) if 'SECRET' in k else v}" for k, v in changes)
        if not messagebox.askyesno(
                "Guardar en .env.local",
                f"Se escribirán estas claves (con backup previo):\n\n{preview}\n\n"
                "Las claves se guardan SIN comentario inline. ¿Continuar?"):
            return
        try:
            bak = self.env.backup()
            for k, v in changes:
                self.env.write(k, v)
            self.app._append(f"✓ Guardado en .env.local ({len(changes)} claves). Backup: {bak.name}\n")
            for key in self.flag_src:
                self.flag_src[key].configure(text=f"origen: _{suffix}")
            self.app.set_status(f"Guardado en .env.local · backup {bak.name}")
        except Exception as exc:  # noqa: BLE001
            messagebox.showerror("Error al guardar", str(exc))

    def _build_commands(self) -> tuple[list[str], list[str], dict[str, str]]:
        build_cmd = ["gcloud", "builds", "submit", ".",
                     "--config=cloudbuild.yaml",
                     f"--substitutions=_TAG={self.tag}",
                     f"--project={PROJECT_ID}"]
        deploy_cmd = ["gcloud", "run", "deploy", self.service,
                      "--image", f"gcr.io/{PROJECT_ID}/frontend:{self.tag}",
                      "--region", REGION, "--platform", "managed",
                      "--allow-unauthenticated", f"--project={PROJECT_ID}"]
        deploy_cmd += self._cr_flags()
        return build_cmd, deploy_cmd, self._collect_env_vars()

    def _dry_run(self):
        missing = self._missing_required()
        build_cmd, deploy_cmd, ev = self._build_commands()
        self.app._append("\n" + "═" * 70 + "\n")
        self.app._append(f"DRY-RUN · {ENVIRONMENTS[self.env_key]['label']}  (NO se despliega)\n")
        self.app._append("═" * 70 + "\n")
        if missing:
            self.app._append("✗ Faltan valores obligatorios: " + ", ".join(missing) + "\n")
        self.app._append("\n[1/3] BUILD:\n  " + " ".join(build_cmd) + "\n")
        self.app._append("\n[2/3] DEPLOY:\n  " + " ".join(deploy_cmd)
                         + " --env-vars-file <temp.yaml>\n")
        self.app._append("\nENV VARS (--env-vars-file):\n")
        for k, v in ev.items():
            shown = mask(v) if ("SECRET" in k or "PRIVATE" in k or "DATABASE_URL" in k) else v
            self.app._append(f"  {k}: {shown}\n")
        self.app._append("\n[3/3] Smoke test del landing tras el deploy.\n")
        if self.env_key == "develop" and ev.get("NOTIFICATIONS_LIVE") == "true":
            self.app._append("⚠ NOTIFICATIONS_LIVE=true en staging → correos reales.\n")
        self.app.set_status("Dry-run mostrado (no se desplegó).")

    def _write_env_yaml(self, ev: dict[str, str]) -> str:
        fd, path = tempfile.mkstemp(prefix="dfa-env-", suffix=".yaml")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            for k, v in ev.items():
                # YAML escapado simple: todo como string entre comillas dobles.
                esc = v.replace("\\", "\\\\").replace('"', '\\"')
                f.write(f'{k}: "{esc}"\n')
        return path

    def _deploy(self):
        if self.app.runner.busy:
            messagebox.showwarning("Ocupado", "Ya hay un comando en ejecución.")
            return
        missing = self._missing_required()
        if missing:
            messagebox.showerror("Faltan valores",
                                 "Completa en .env.local (o en el formulario):\n- " + "\n- ".join(missing))
            return
        # Confirmación según ambiente.
        if self.env_key == "production":
            ans = _ask_typed(self.app.root, "Desplegar a PRODUCCIÓN",
                             "Vas a desplegar a PRODUCCIÓN (usuarios reales).\n"
                             "Escribe SI (mayúsculas) para continuar:")
            if ans != "SI":
                self.app._append("Deploy a producción cancelado.\n")
                return
        else:
            warn = ""
            if self.flag_vars["NOTIFICATIONS_LIVE"].get():
                warn = "\n\n⚠ NOTIFICATIONS_LIVE=ON → correos REALES en staging."
            if not messagebox.askyesno("Desplegar a staging",
                                       f"¿Desplegar a {self.service}?{warn}"):
                return

        build_cmd, deploy_cmd, ev = self._build_commands()
        yaml_path = self._write_env_yaml(ev)
        deploy_cmd += ["--env-vars-file", yaml_path]

        self.app.set_status(f"Desplegando a {self.service}…")
        self.app._append("\n" + "═" * 70 + f"\nDEPLOY · {self.service}\n" + "═" * 70 + "\n")

        def after_deploy(rc):
            try:
                os.unlink(yaml_path)
            except OSError:
                pass
            if rc == 0:
                self.app.set_status(f"Deploy a {self.service} OK. Verifica con 🔍.")
                self.app._append("\n✓ Deploy terminado. Pulsa 'Verificar' para smoke test + URL.\n")
            else:
                self.app.set_status(f"Deploy a {self.service} falló (exit {rc}).")

        def after_build(rc):
            if rc != 0:
                try:
                    os.unlink(yaml_path)
                except OSError:
                    pass
                self.app.set_status(f"Build falló (exit {rc}). No se desplegó.")
                self.app._append(f"\n✗ Build falló (exit {rc}). Se aborta el deploy.\n")
                return
            self.app._append("\n>> [2/3] Deploy a Cloud Run…\n")
            self.app.runner.run(deploy_cmd, FRONTEND_DIR, on_done=after_deploy)

        self.app._append("\n>> [1/3] Cloud Build…\n")
        self.app.runner.run(build_cmd, FRONTEND_DIR, on_done=after_build)

    @staticmethod
    def _mask_env_yaml(text: str) -> str:
        """Enmascara los `value:` de claves sensibles en el YAML de env vars."""
        sensitive = ("SECRET", "PRIVATE", "PASSWORD", "DATABASE_URL")
        out, last = [], ""
        for line in text.splitlines():
            mn = re.match(r"\s*-?\s*name:\s*(.+)", line)
            if mn:
                last = mn.group(1).strip()
            mv = re.match(r"(\s*value:\s*).*", line)
            if mv and any(t in last for t in sensitive):
                line = mv.group(1) + "'••••(oculto)'"
            out.append(line)
        return "\n".join(out) + "\n"

    def _verify(self):
        if self.app.runner.busy:
            messagebox.showwarning("Ocupado", "Ya hay un comando en ejecución.")
            return
        service, region, project = self.service, REGION, PROJECT_ID

        def task(log):
            log(f"\n>> Verificación · {service}\n")
            # 1) URL del servicio
            url = subprocess.run(
                ["gcloud", "run", "services", "describe", service,
                 "--region", region, "--project", project,
                 "--format=value(status.url)"],
                capture_output=True, text=True, timeout=60).stdout.strip()
            log(f"URL: {url or '(no encontrada)'}\n")
            # 2) Env vars (enmascaradas)
            env_yaml = subprocess.run(
                ["gcloud", "run", "services", "describe", service,
                 "--region", region, "--project", project,
                 "--format=yaml(spec.template.spec.containers[0].env)"],
                capture_output=True, text=True, timeout=60).stdout
            log("\nEnv vars del servicio:\n" + self._mask_env_yaml(env_yaml))
            # 3) Smoke test del landing
            if url:
                r = subprocess.run(
                    ["curl", "-sS", "-o", "/dev/null", "-w", "Landing: HTTP %{http_code}\n",
                     "--max-time", "30", url + "/"],
                    capture_output=True, text=True, timeout=40)
                log(r.stdout or r.stderr or "(sin respuesta del smoke test)\n")

        self.app.runner.run_func(task)


# ──────────────────────────────────────────────────────────────────────────────
# Diálogo de confirmación con texto tecleado (para producción)
# ──────────────────────────────────────────────────────────────────────────────
def _ask_typed(parent, title, prompt) -> str:
    dlg = tk.Toplevel(parent)
    dlg.title(title)
    dlg.transient(parent)
    dlg.grab_set()
    dlg.geometry("460x180")
    ttk.Label(dlg, text=prompt, wraplength=420, padding=12).pack()
    var = tk.StringVar()
    entry = ttk.Entry(dlg, textvariable=var, width=20)
    entry.pack(pady=6)
    entry.focus_set()
    result = {"value": ""}

    def ok():
        result["value"] = var.get().strip()
        dlg.destroy()

    def cancel():
        result["value"] = ""
        dlg.destroy()

    btns = ttk.Frame(dlg)
    btns.pack(pady=10)
    ttk.Button(btns, text="Confirmar", command=ok).pack(side="left", padx=6)
    ttk.Button(btns, text="Cancelar", command=cancel).pack(side="left", padx=6)
    dlg.bind("<Return>", lambda e: ok())
    dlg.bind("<Escape>", lambda e: cancel())
    parent.wait_window(dlg)
    return result["value"]


def main():
    if not ENV_PATH.exists():
        # Permitimos abrir igual, pero avisamos.
        print(f"AVISO: no se encontró {ENV_PATH}. Ejecuta desde frontend/.")
    root = tk.Tk()
    try:
        ttk.Style().theme_use("clam")
    except tk.TclError:
        pass
    DeployGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
