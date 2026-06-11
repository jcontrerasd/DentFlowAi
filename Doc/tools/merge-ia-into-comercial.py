#!/usr/bin/env python3
"""
Inserta las 4 láminas de Fauchard_Evolucion_IA.html al final de
Fauchard_Presentacion_Comercial.html, aislando su CSS bajo `.ia-deck` para no
chocar con los estilos de la presentación comercial. Las láminas (fijas
1680×1040) se escalan al ancho de la página con container queries.

Idempotente: si ya existe el anexo, lo reemplaza.
"""
import re
from pathlib import Path
from bs4 import BeautifulSoup

DOC = Path(__file__).resolve().parent.parent
EVO = DOC / "Fauchard_Evolucion_IA.html"
COM = DOC / "Fauchard_Presentacion_Comercial.html"

MARK_CSS_A = "/* === IA-DECK START === */"
MARK_CSS_B = "/* === IA-DECK END === */"
MARK_HTML_A = "<!-- IA-DECK START -->"
MARK_HTML_B = "<!-- IA-DECK END -->"


def port_css(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)      # quita comentarios
    css = re.sub(r"@import[^;]*;", "", css)               # quita @import (fuentes ya están)
    out = []
    for chunk in css.split("}"):
        chunk = chunk.strip()
        if not chunk or "{" not in chunk:
            continue
        sel, body = chunk.split("{", 1)
        sels = [s.strip() for s in sel.split(",") if s.strip()]
        new = []
        for s in sels:
            if s in (":root", "*", "body", "html"):
                continue  # los globales no se portan
            new.append(".ia-deck " + s)
        if new:
            out.append(", ".join(new) + "{" + body.strip() + "}")
    return "\n".join(out)


evo = BeautifulSoup(EVO.read_text(encoding="utf-8"), "html.parser")
ported = port_css(evo.find("style").string)
slides = evo.body.find_all("div", class_="slide", recursive=False)
fits = "\n".join(
    f'<div class="fit" style="aspect-ratio:1680 / {sl.get("data-h", "1040")}">\n{sl}\n</div>'
    for sl in slides
)

css_block = f"""{MARK_CSS_A}
:root{{--violet:#c4b5fd; --violetsoft:rgba(167,139,250,.14); --ambersoft:rgba(251,191,36,.10)}}
.ia-deck{{max-width:1180px; margin:0 auto}}
.ia-deck *{{box-sizing:border-box}}
.ia-deck .ia-lead{{margin-bottom:26px}}
.ia-deck .fit{{container-type:inline-size; width:100%; overflow:hidden; border:1px solid var(--line2); border-radius:16px; box-shadow:0 22px 60px rgba(0,0,0,.45); margin-bottom:28px}}
.ia-deck .fit > .slide{{transform:scale(calc(100cqw / 1680px)); transform-origin:top left}}
{ported}
{MARK_CSS_B}"""

html_block = f"""{MARK_HTML_A}
  <section id="vision-ia" class="ia-deck">
    <div class="eyebrow"><span class="chip">FAUCHARD</span> Anexo · Visión de IA</div>
    <h2 class="section-title">Hacia dónde evoluciona FAUCHARD</h2>
    <p class="lead ia-lead">Del motor de reglas configurables a un modelo que aprende del histórico: estrategia y táctica, qué modelos aplican, el roadmap de implementación y los resguardos.</p>
{fits}
  </section>
  {MARK_HTML_B}"""

com = COM.read_text(encoding="utf-8")

# Limpia inserciones previas (idempotencia)
com = re.sub(re.escape(MARK_CSS_A) + r".*?" + re.escape(MARK_CSS_B), "", com, flags=re.S).strip("\n")
com = re.sub(re.escape(MARK_HTML_A) + r".*?" + re.escape(MARK_HTML_B), "", com, flags=re.S)

# Inserta el CSS antes de cerrar el primer <style>
com = com.replace("</style>", "\n" + css_block + "\n</style>", 1)

# Inserta la sección después de </main>
com = com.replace("</main>", html_block + "\n</main>", 1)

# Agrega link de navegación (si no existe)
if 'href="#vision-ia"' not in com:
    com = com.replace(
        '<a href="#parametros">Parámetros</a>',
        '<a href="#parametros">Parámetros</a>\n      <a href="#vision-ia">Visión de IA</a>',
        1,
    )

COM.write_text(com, encoding="utf-8")
print(f"OK · {len(slides)} láminas IA insertadas en {COM.name}")
