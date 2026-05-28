#!/usr/bin/env python3
"""Genera /MASTER_PLAN.md desde el estado de issues, milestones, ADRs y commits del repo.

Diseno (espejo del sistema en aaronhuaynate66/sica-platform, adaptado a SIR V2):

- Deterministico: misma data -> mismo output. NO usa now().
- Timestamp del documento se deriva del updatedAt maximo entre issues.
- Sin dependencias externas: stdlib + gh CLI invocado via subprocess.
- Idempotente: si el output coincide con el archivo en disco, no se reescribe.
- 100% auto-generado: no hay secciones manuales. El archivo se reconstruye completo en cada run.

Uso:

    python scripts/generate_roadmap.py [--repo OWNER/REPO] [--output PATH]

Salida:
    Sobreescribe /MASTER_PLAN.md con el contenido regenerado. Log a stdout.
    Exit 0 si OK, 1 si error.

Requisitos:
    - Python 3.10+ (usa tipos PEP 604 y dataclasses con slots opcionales)
    - gh CLI autenticado en el entorno (en CI: GH_TOKEN=${{ github.token }}).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

DEFAULT_REPO = "aaronhuaynate66/sir-v2-life-os"
DEFAULT_OUTPUT = "MASTER_PLAN.md"
BOT_EMAIL = "sir-bot@users.noreply.github.com"
BOT_LOGIN = "sir-bot"
GITHUB_ACTIONS_LOGIN = "github-actions[bot]"

# Inicio de Fase 0 = primer commit del proyecto SIR V2.
# Como GitHub milestones no exponen start_date, este anclaje sirve para el Gantt.
PHASE0_START_DATE = "2026-05-20"

# Meses en espanol para la tabla de progreso visual (formato "MMM AAAA").
MONTH_ES = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr", 5: "May", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
}

# Tabla estatica de las fases del Life OS. El orden de esta lista refleja la
# secuencia historica real (no el numero), porque Backend & Sync y UI Produccion
# se ejecutaron antes de retomar Memory Longitudinal. El estado "active"
# determina en que fase esta el trabajo hoy. Una y solo una puede estar activa
# (chequeo via assert al final del modulo).
#
# Convenciones para agregar/cerrar fases: ver scripts/ROADMAP_GUIDE.md.
PHASES_META: list[dict[str, Any]] = [
    {
        "key": "fase-0",
        "milestone_title": "Fase 0 - Fundamentos",
        "title": "Fase 0 - Fundamentos",
        "period": "Setup",
        "wedge": "Setup repo, Zustand stores, tipos base",
        "gate": "Stack reproducible: Next.js + Zustand + Tailwind builds limpios",
        "active": False,
    },
    {
        "key": "fase-1",
        "milestone_title": "Fase 1 - Stores y dominio",
        "title": "Fase 1 - Stores y dominio",
        "period": "Dominio inicial",
        "wedge": "Self, Finance, Goals, Signals, Relationships, Memory",
        "gate": "Stores persistidos y rutas dedicadas operativas",
        "active": False,
    },
    {
        "key": "fase-2",
        "milestone_title": "Fase 2 - Context Engine",
        "title": "Fase 2 - Context Engine",
        "period": "Estado vivo",
        "wedge": "RichContextSnapshot, hook, panel, persistencia historica",
        "gate": "Snapshot agregado + history persistido + cero hydration warnings",
        "active": False,
    },
    {
        "key": "fase-backend-sync",
        "milestone_title": "Fase Backend & Sync",
        "title": "Fase Backend & Sync",
        "period": "Persistencia remota",
        "wedge": "Migracion a Supabase con auth y sync multi-device",
        "gate": "Schema + auth + sync engine + migracion localStorage + currency multi-moneda",
        "active": False,
    },
    {
        "key": "fase-4",
        "milestone_title": "Fase 4 - UI Produccion",
        "title": "Fase 4 - UI Produccion",
        "period": "UI usuario",
        "wedge": "Reemplazar debug panel con UI real para el usuario final",
        "gate": "Onboarding + uso diario sin necesidad de leer codigo",
        "active": False,
    },
    {
        "key": "fase-3",
        "milestone_title": "Fase 3 - Memory Longitudinal",
        "title": "Fase 3 - Memory Longitudinal",
        "period": "Historia profunda",
        "wedge": "Persistencia historica avanzada, busqueda semantica",
        "gate": "Recuperar contexto de N meses atras con queries semanticas",
        "active": True,
    },
    {
        "key": "fase-5",
        "milestone_title": "Fase 5 - IA Basica",
        "title": "Fase 5 - IA Basica",
        "period": "Capa cognitiva",
        "wedge": "Resumenes, sugerencias, briefings sobre el snapshot",
        "gate": "Briefings diarios utiles + ≥1 sugerencia accionable por dia",
        "active": False,
    },
]

# Invariante: exactamente una fase activa. Romper aqui temprano evita
# silencios raros como un header "Fase activa:" vacio o duplicado.
_ACTIVE_PHASES = [p for p in PHASES_META if p["active"]]
assert len(_ACTIVE_PHASES) == 1, (
    f"PHASES_META invariant: exactamente una fase debe tener active=True, hay {len(_ACTIVE_PHASES)}. "
    f"Ver scripts/ROADMAP_GUIDE.md para el flujo de transicion entre fases."
)

# Categorizacion de issues. Orden importa: primer match gana.
# Cada regla: (titulo_seccion, labels_match, title_keywords)
CATEGORY_RULES: list[tuple[str, set[str], list[str]]] = [
    ("Context Engine", {"fase-2"}, ["context", "snapshot", "hydration", "richcontext"]),
    ("Backend & Sync", {"fase-backend-sync"}, ["supabase", "auth", "oauth", "magic link", "sync engine", "migration"]),
    ("Memory Longitudinal", {"fase-3"}, ["memory", "semantic", "longitudinal"]),
    ("UI Producción", {"fase-4"}, ["ui", "dashboard", "panel", "shadcn", "responsive"]),
    ("IA & Cognición", {"fase-5"}, ["llm", "ai", "summarize", "briefing"]),
    ("Dominio (stores)", {"fase-1"}, ["store", "zustand", "finance", "goals", "signals", "relational", "self"]),
    ("Fundamentos & Infra", {"fase-0"}, ["setup", "next.js", "infra", "tooling", "lockfile"]),
    ("Deuda Técnica", {"deuda-tecnica"}, []),
]

# Tabla estatica de infraestructura. Cambios aqui requieren PR humano.
INFRASTRUCTURE: list[tuple[str, str, str]] = [
    ("GitHub repo publico", "✅ Activo", "https://github.com/aaronhuaynate66/sir-v2-life-os"),
    ("GitHub Actions CI", "✅ Activo", "validate.yml (type-check + lint + build)"),
    ("Living Roadmap System", "✅ Activo", "Auto-sync MASTER_PLAN.md en cada cambio de issue (sync-roadmap.yml)"),
    ("Milestones por fase", "✅ Activo", "Fase 0-5 como GitHub Milestones"),
    ("ADRs en docs/decisions/", "✅ Activo", "MADR template, indice en README"),
    ("Next.js 15 (App Router)", "✅ Activo", "Stack base"),
    ("Zustand + persist (localStorage)", "✅ Activo", "Stores por dominio, ver ADR 0001"),
    ("Tailwind CSS + Framer Motion", "✅ Activo", "Estilo + animaciones"),
    ("Deploy en Vercel", "⬜ Pendiente", "Sin conectar todavia"),
    ("Backend / Supabase", "⬜ Pendiente", "Fase 3+"),
]


@dataclass(frozen=True)
class Issue:
    number: int
    title: str
    labels: tuple[str, ...]
    state: str  # "OPEN" | "CLOSED"
    created_at: str
    updated_at: str
    closed_at: str | None
    url: str
    milestone_title: str | None

    @property
    def label_set(self) -> set[str]:
        return set(self.labels)

    def has_label(self, name: str) -> bool:
        return name in self.label_set


@dataclass(frozen=True)
class Milestone:
    title: str
    description: str
    due_on: str | None
    state: str
    open_issues: int
    closed_issues: int


@dataclass(frozen=True)
class Commit:
    sha_short: str
    author_login: str
    author_email: str
    message_subject: str
    date: str  # ISO


@dataclass(frozen=True)
class ADR:
    number: str  # "0001"
    title: str
    status: str
    date: str
    filename: str


def log(msg: str) -> None:
    print(f"[generate_roadmap] {msg}")


def run_gh(args: list[str]) -> str:
    """Ejecuta gh y devuelve stdout. Lanza RuntimeError si falla."""
    try:
        result = subprocess.run(
            ["gh", *args],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except FileNotFoundError as exc:
        raise RuntimeError("gh CLI no encontrado en PATH.") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"gh {' '.join(args)} fallo: {exc.stderr.strip()}") from exc
    return result.stdout


def fetch_issues(repo: str) -> list[Issue]:
    """Trae todos los issues (open + closed) del repo, ordenados por numero desc."""
    raw = run_gh(
        [
            "issue", "list",
            "--repo", repo,
            "--state", "all",
            "--limit", "500",
            "--json", "number,title,labels,state,createdAt,updatedAt,closedAt,url,milestone",
        ]
    )
    data: list[dict[str, Any]] = json.loads(raw)
    issues: list[Issue] = []
    for d in data:
        milestone = d.get("milestone") or {}
        issues.append(
            Issue(
                number=int(d["number"]),
                title=str(d["title"]),
                labels=tuple(sorted(lbl["name"] for lbl in d.get("labels") or [])),
                state=str(d["state"]).upper(),
                created_at=str(d["createdAt"]),
                updated_at=str(d["updatedAt"]),
                closed_at=d.get("closedAt") or None,
                url=str(d["url"]),
                milestone_title=(milestone.get("title") if milestone else None) or None,
            )
        )
    issues.sort(key=lambda i: i.number, reverse=True)
    return issues


def fetch_milestones(repo: str) -> list[Milestone]:
    """Trae todos los milestones del repo (open + closed)."""
    raw = run_gh([
        "api", f"repos/{repo}/milestones",
        "--paginate",
        "-X", "GET",
        "-F", "state=all",
        "-q", ".",
    ])
    text = raw.strip()
    if not text:
        return []
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = []
        decoder = json.JSONDecoder()
        idx = 0
        while idx < len(text):
            chunk, end = decoder.raw_decode(text, idx)
            if isinstance(chunk, list):
                data.extend(chunk)
            else:
                data.append(chunk)
            idx = end
            while idx < len(text) and text[idx].isspace():
                idx += 1
    milestones: list[Milestone] = []
    for d in data:
        milestones.append(
            Milestone(
                title=str(d["title"]),
                description=str(d.get("description") or ""),
                due_on=d.get("due_on") or None,
                state=str(d.get("state") or "open"),
                open_issues=int(d.get("open_issues") or 0),
                closed_issues=int(d.get("closed_issues") or 0),
            )
        )
    return milestones


def fetch_recent_commits(repo: str, limit: int = 30) -> list[Commit]:
    """Trae los ultimos N commits del repo. Filtrado por bot ocurre despues."""
    raw = run_gh(["api", f"repos/{repo}/commits", "-X", "GET", "-F", f"per_page={limit}"])
    data: list[dict[str, Any]] = json.loads(raw)
    commits: list[Commit] = []
    for d in data:
        commit = d.get("commit") or {}
        author_obj = d.get("author") or {}
        commit_author = commit.get("author") or {}
        author_login = (author_obj.get("login") if author_obj else None) or commit_author.get("name") or "unknown"
        author_email = commit_author.get("email") or ""
        subject = (commit.get("message") or "").splitlines()[0] if commit.get("message") else ""
        commits.append(
            Commit(
                sha_short=str(d["sha"])[:7],
                author_login=str(author_login),
                author_email=str(author_email),
                message_subject=subject,
                date=str(commit_author.get("date") or ""),
            )
        )
    return commits


def read_adrs(decisions_dir: Path) -> list[ADR]:
    """Lee todos los ADRs del directorio. Excluye README. Parsea Status y Date del header."""
    if not decisions_dir.exists():
        return []
    adrs: list[ADR] = []
    for path in sorted(decisions_dir.glob("*.md")):
        if path.name.lower() == "readme.md":
            continue
        text = path.read_text(encoding="utf-8")
        title_match = re.match(r"^#\s*(\d{4})\.\s+(.+?)$", text.splitlines()[0] if text.splitlines() else "")
        if not title_match:
            continue
        number = title_match.group(1)
        title = title_match.group(2).strip()
        status_match = re.search(r"\*\*Status:\*\*\s*([^\n]+)", text)
        date_match = re.search(r"\*\*Date:\*\*\s*([^\n]+)", text)
        adrs.append(
            ADR(
                number=number,
                title=title,
                status=(status_match.group(1).strip() if status_match else "Unknown"),
                date=(date_match.group(1).strip() if date_match else "—"),
                filename=path.name,
            )
        )
    return adrs


def is_bot_commit(c: Commit) -> bool:
    login = c.author_login.lower()
    email = c.author_email.lower()
    if BOT_LOGIN in login or BOT_EMAIL.lower() in email:
        return True
    if "github-actions" in login or "noreply@github.com" in email:
        return True
    return False


def latest_non_bot_commit_short(commits: list[Commit]) -> str:
    """Hash corto del ultimo commit humano (no-bot)."""
    for c in commits:
        if not is_bot_commit(c):
            return c.sha_short
    return "<sin commits humanos>"


def latest_update_iso(issues: list[Issue]) -> str:
    """Timestamp ISO del issue actualizado mas recientemente. Sentinel si no hay issues."""
    if not issues:
        return "<sin issues>"
    return max(i.updated_at for i in issues)


def progress_bar(closed: int, total: int, width: int = 40) -> str:
    """Barra ASCII de progreso."""
    if total <= 0:
        return "░" * width + " 0/0 (0%)"
    pct = closed / total
    filled = int(round(pct * width))
    filled = max(0, min(width, filled))
    bar = ("█" * filled) + ("░" * (width - filled))
    return f"{bar} {closed}/{total} issues cerrados ({round(pct * 100)}%)"


def category_for(issue: Issue) -> str | None:
    """Devuelve la categoria del issue.

    Dos pasadas: primero por labels (mas confiable), luego por keywords como fallback.
    Sin esto, "[R4] Memory System base" (label fase-1) caia en "Memory Longitudinal"
    por el keyword "memory" antes de llegar a "Dominio (stores)" por label.
    """
    title_lower = issue.title.lower()
    for section, labels, _ in CATEGORY_RULES:
        if labels and (labels & issue.label_set):
            return section
    for section, _, keywords in CATEGORY_RULES:
        if keywords and any(kw in title_lower for kw in keywords):
            return section
    return None


def issue_state_glyph(issue: Issue) -> str:
    if issue.state == "CLOSED":
        return "✅ Cerrado"
    return "⬜ Abierto"


def fmt_labels(labels: tuple[str, ...]) -> str:
    return ", ".join(labels) if labels else "—"


def fmt_closed_date(issue: Issue) -> str:
    if issue.state != "CLOSED" or not issue.closed_at:
        return "—"
    return issue.closed_at.split("T")[0]


def iso_date_only(iso_ts: str | None) -> str | None:
    if not iso_ts:
        return None
    return iso_ts.split("T")[0]


def fmt_period_es(start_ymd: str, end_ymd: str) -> str:
    sy, sm, _ = start_ymd.split("-")
    ey, em, _ = end_ymd.split("-")
    smonth = MONTH_ES[int(sm)]
    emonth = MONTH_ES[int(em)]
    if sy == ey:
        return f"{smonth}–{emonth} {ey}"
    return f"{smonth} {sy}–{emonth} {ey}"


def compute_phase_dates(milestones: list[Milestone]) -> dict[str, tuple[str, str]]:
    """Mapa milestone_title -> (start, end). Solo incluye fases con due_on definido.

    Si una fase no tiene due_on (caso comun para fases futuras), se omite del Gantt.
    """
    by_title = {m.title: m for m in milestones}
    dates: dict[str, tuple[str, str]] = {}
    prev_end: str | None = None
    for idx, meta in enumerate(PHASES_META):
        ms = by_title.get(meta["milestone_title"])
        end = iso_date_only(ms.due_on) if ms else None
        if not end:
            prev_end = None
            continue
        start = PHASE0_START_DATE if idx == 0 else prev_end
        if not start:
            prev_end = end
            continue
        dates[meta["milestone_title"]] = (start, end)
        prev_end = end
    return dates


def phase_has_open_blocker(phase_key: str, issues: list[Issue]) -> bool:
    """True si hay al menos un issue OPEN con label 'bloqueante' + label de la fase
    sin milestone asignado. Indica dependencia cross-fase sin resolver.
    """
    for issue in issues:
        if issue.state != "OPEN":
            continue
        if issue.milestone_title is not None:
            continue
        if "bloqueante" not in issue.label_set:
            continue
        if phase_key in issue.label_set:
            return True
    return False


def short_progress_bar(closed: int, total: int, width: int = 10) -> str:
    if total <= 0:
        return "░" * width
    pct = closed / total
    filled = int(round(pct * width))
    filled = max(0, min(width, filled))
    return ("█" * filled) + ("░" * (width - filled))


def gantt_task_id(phase_key: str) -> str:
    return phase_key.replace("-", "")


def _milestone_is_done(milestone: Milestone | None) -> bool:
    """Una fase se considera terminada si su milestone esta closed, o si tiene
    issues y todos estan cerrados. La segunda condicion auto-detecta el drift
    'milestone abierto pero 100% issues cerradas' que aparecio en Fase 2."""
    if milestone is None:
        return False
    if milestone.state.lower() == "closed":
        return True
    total = milestone.open_issues + milestone.closed_issues
    return total > 0 and milestone.open_issues == 0


def gantt_status_for(meta: dict[str, Any], milestone: Milestone | None, issues: list[Issue]) -> str:
    if _milestone_is_done(milestone):
        return "done"
    if meta["active"]:
        if phase_has_open_blocker(meta["key"], issues):
            return "crit, active"
        return "active"
    return ""


def visual_progress_state(meta: dict[str, Any], milestone: Milestone | None) -> str:
    if _milestone_is_done(milestone):
        return "✅ Completado"
    if meta["active"]:
        return "🔄 Activo"
    return "⬜ Pendiente"


def section_visual_timeline(milestones: list[Milestone], issues: list[Issue]) -> str:
    """Diagrama Mermaid Gantt. Si ninguna fase tiene due_on, se omite la seccion."""
    dates = compute_phase_dates(milestones)
    if not dates:
        return ""

    by_title = {m.title: m for m in milestones}
    lines = [
        "## Timeline visual",
        "",
        "```mermaid",
        "gantt",
        "    title SIR V2 Roadmap — Fases 0 a 5",
        "    dateFormat YYYY-MM-DD",
        "    axisFormat %b %Y",
        "",
    ]
    for meta in PHASES_META:
        if meta["milestone_title"] not in dates:
            continue
        start, end = dates[meta["milestone_title"]]
        ms = by_title.get(meta["milestone_title"])
        status = gantt_status_for(meta, ms, issues)
        task_id = gantt_task_id(meta["key"])
        lines.append(f"    section {meta['title']}")
        if status:
            lines.append(f"    {meta['title']}    :{status}, {task_id}, {start}, {end}")
        else:
            lines.append(f"    {meta['title']}    :{task_id}, {start}, {end}")
        lines.append("")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def section_visual_progress(milestones: list[Milestone]) -> str:
    """Tabla compacta de progreso por fase."""
    dates = compute_phase_dates(milestones)
    by_title = {m.title: m for m in milestones}

    lines = [
        "**Estado por fase:**",
        "",
        "| Fase | Período | Estado | Progreso |",
        "|------|---------|--------|----------|",
    ]
    any_row = False
    for meta in PHASES_META:
        ms = by_title.get(meta["milestone_title"])
        period = ""
        if meta["milestone_title"] in dates:
            start, end = dates[meta["milestone_title"]]
            period = fmt_period_es(start, end)
        else:
            period = meta["period"]
        state = visual_progress_state(meta, ms)
        if ms is not None:
            total = ms.open_issues + ms.closed_issues
            closed = ms.closed_issues
        else:
            total = 0
            closed = 0
        bar = short_progress_bar(closed, total)
        pct = round((closed / total) * 100) if total > 0 else 0
        lines.append(f"| {meta['title']} | {period} | {state} | {bar} {pct}% |")
        any_row = True

    if not any_row:
        return ""

    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_header(last_update_iso_value: str, head_short: str, active_phase: dict[str, Any]) -> str:
    lines = [
        "# SIR V2 — Master Plan (Life OS)",
        "",
        "## Estado general",
        "",
        f"Última actualización: `{last_update_iso_value}`  ",
        "Generado automáticamente por `.github/workflows/sync-roadmap.yml`",
        "",
        f"**Fase activa:** {active_phase['title']} — {active_phase['wedge']}  ",
        f"**Hash del último commit humano:** `{head_short}`",
        "",
        "> SIR V2 es un Life Operating System que evoluciona en capas progresivas.",
        "> Activo central: Human Contextual Memory Graph acumulado durante años.",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def section_overall_progress(issues: list[Issue]) -> str:
    total = len(issues)
    closed = sum(1 for i in issues if i.state == "CLOSED")
    open_count = total - closed
    blockers = sum(1 for i in issues if i.has_label("bloqueante") and i.state == "OPEN")
    in_progress = 0
    pending = open_count - in_progress

    lines = [
        "## Progreso general",
        "",
        "```",
        progress_bar(closed, total),
        "```",
        "",
        f"✅ Cerrados: {closed} | 🔄 En progreso: {in_progress} | "
        f"⬜ Pendientes: {pending} | 🚨 Bloqueantes: {blockers}",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def fmt_due_date(due_on: str | None) -> str:
    if not due_on:
        return "—"
    return due_on.split("T")[0]


def section_phase(
    meta: dict[str, Any],
    milestone: Milestone | None,
    phase_issues: list[Issue],
) -> str:
    """Una seccion por fase. Tabla de issues solo si hay alguno asignado."""
    closed = sum(1 for i in phase_issues if i.state == "CLOSED")
    total = len(phase_issues)

    suffix = " (activa)" if meta["active"] else ""
    lines = [
        f"### {meta['title']}{suffix}",
        "",
        f"**Período:** {meta['period']}  ",
        f"**Due date:** {fmt_due_date(milestone.due_on if milestone else None)}  ",
        f"**Wedge:** {meta['wedge']}  ",
        f"**Gate de salida:** {meta['gate']}",
        "",
    ]

    if total == 0:
        if _milestone_is_done(milestone):
            lines.append("_(Fase cerrada — sin issues registrados)_")
        elif meta["active"]:
            lines.append("_(Sin issues asignados aún. Arranca esta fase.)_")
        else:
            lines.append("_(Sin issues asignados. Arranca cuando la fase previa cierre gate.)_")
        lines.append("")
        return "\n".join(lines)

    lines.append("```")
    lines.append(progress_bar(closed, total))
    lines.append("```")
    lines.append("")
    lines.append("| # | Issue | Labels | Estado | Cerrado |")
    lines.append("|---|-------|--------|--------|---------|")
    for issue in sorted(phase_issues, key=lambda i: i.number):
        lines.append(
            f"| #{issue.number} "
            f"| [{issue.title}]({issue.url}) "
            f"| {fmt_labels(issue.labels)} "
            f"| {issue_state_glyph(issue)} "
            f"| {fmt_closed_date(issue)} |"
        )
    lines.append("")
    return "\n".join(lines)


def section_phases_block(issues: list[Issue], milestones: list[Milestone]) -> str:
    """Bloque con las 6 secciones de fase."""
    by_title = {m.title: m for m in milestones}
    lines = ["## Progreso por Fase", ""]
    for meta in PHASES_META:
        ms = by_title.get(meta["milestone_title"])
        phase_issues = [i for i in issues if i.milestone_title == meta["milestone_title"]]
        lines.append(section_phase(meta, ms, phase_issues))
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_blockers(issues: list[Issue]) -> str:
    """Issues sin milestone — bloqueantes cross-fase o deuda transversal."""
    external = [i for i in issues if i.milestone_title is None]
    lines = [
        "## Bloqueantes y deuda transversal (sin milestone)",
        "",
        "Estos issues no pertenecen a una fase especifica. Suelen ser deuda "
        "tecnica transversal o bloqueantes que cruzan fases.",
        "",
    ]
    if not external:
        lines.append("_(sin issues transversales)_")
        lines.append("")
        lines.append("---")
        lines.append("")
        return "\n".join(lines)

    lines.append("| # | Issue | Labels | Estado |")
    lines.append("|---|-------|--------|--------|")
    for issue in sorted(external, key=lambda i: i.number):
        lines.append(
            f"| #{issue.number} "
            f"| [{issue.title}]({issue.url}) "
            f"| {fmt_labels(issue.labels)} "
            f"| {issue_state_glyph(issue)} |"
        )
    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_categories(issues: list[Issue]) -> str:
    """Issues agrupados por categoria semantica. Cada issue aparece una sola vez."""
    buckets: dict[str, list[Issue]] = {section: [] for section, _, _ in CATEGORY_RULES}
    uncategorized: list[Issue] = []
    for issue in issues:
        cat = category_for(issue)
        if cat is None:
            uncategorized.append(issue)
        else:
            buckets[cat].append(issue)

    lines = ["## Issues por categoría", ""]
    for section, _, _ in CATEGORY_RULES:
        relevant = sorted(buckets[section], key=lambda i: i.number)
        lines.append(f"### {section}")
        lines.append("")
        if not relevant:
            lines.append("_(sin issues en esta categoría)_")
        else:
            for issue in relevant:
                glyph = "✅" if issue.state == "CLOSED" else "⬜"
                lines.append(f"- {glyph} [#{issue.number}]({issue.url}) {issue.title}")
        lines.append("")

    if uncategorized:
        lines.append("### Sin categorizar")
        lines.append("")
        for issue in sorted(uncategorized, key=lambda i: i.number):
            glyph = "✅" if issue.state == "CLOSED" else "⬜"
            lines.append(f"- {glyph} [#{issue.number}]({issue.url}) {issue.title}")
        lines.append("")

    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_adrs(adrs: list[ADR]) -> str:
    """Tabla de ADRs leidos desde docs/decisions/."""
    lines = [
        "## Decisiones arquitectónicas (ADRs)",
        "",
    ]
    if not adrs:
        lines.append("_(sin ADRs registrados)_")
        lines.append("")
        lines.append("---")
        lines.append("")
        return "\n".join(lines)

    lines.append("| # | Decisión | Estado | Fecha |")
    lines.append("|---|----------|--------|-------|")
    for adr in sorted(adrs, key=lambda a: a.number):
        link = f"docs/decisions/{adr.filename}"
        lines.append(f"| {adr.number} | [{adr.title}]({link}) | {adr.status} | {adr.date} |")
    lines.append("")
    lines.append("Auto-generado leyendo `docs/decisions/`.")
    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_commits(commits: list[Commit], limit: int = 10) -> str:
    """Ultimos N commits no-bot."""
    human = [c for c in commits if not is_bot_commit(c)][:limit]

    lines = [
        "## Commits recientes",
        "",
        f"Últimos {limit} commits del repo (excluyendo bot y GitHub Actions):",
        "",
    ]
    if not human:
        lines.append("_(sin commits humanos recientes)_")
        lines.append("")
        lines.append("---")
        lines.append("")
        return "\n".join(lines)

    lines.append("| Hash | Autor | Mensaje | Fecha |")
    lines.append("|------|-------|---------|-------|")
    for c in human:
        date = c.date.split("T")[0] if c.date else "—"
        msg = c.message_subject.replace("|", "\\|")
        lines.append(f"| `{c.sha_short}` | {c.author_login} | {msg} | {date} |")
    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_infrastructure() -> str:
    lines = [
        "## Infraestructura",
        "",
        "| Item | Estado | Notas |",
        "|------|--------|-------|",
    ]
    for item, status, notes in INFRASTRUCTURE:
        lines.append(f"| {item} | {status} | {notes} |")
    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_runtime_validation() -> str:
    """Bloque especifico SIR V2: tests runtime validados manualmente.

    Captura el estado de validacion R5.1E (tests 1-8 del Context Engine).
    Es estatico hoy; en una iteracion futura podria leerse desde un manifest.
    """
    lines = [
        "## Tests runtime validados",
        "",
        "Validación manual end-to-end del Context Engine (ver issue R5.1E):",
        "",
        "| Test | Foco | Estado |",
        "|------|------|--------|",
        "| 1 | RichContextSnapshot se construye sin errores en mount | ✅ |",
        "| 2 | useRichContext devuelve estructura completa y tipada | ✅ |",
        "| 3 | Mutación en useFinanceStore actualiza snapshot reactivamente | ✅ |",
        "| 4 | Locale en-US fija formato numérico (sin hydration mismatch) | ✅ |",
        "| 5 | Goals: completar/cancelar refleja en snapshot | ✅ |",
        "| 6 | Relationships: agregar persona refleja peopleCount | ✅ |",
        "| 7 | Memory: addMemory aumenta totalMemories | ✅ |",
        "| 8 | useSnapshotStore captura por eventos sin duplicados | ✅ |",
        "",
        "---",
        "",
    ]
    return "\n".join(lines)


def section_footer() -> str:
    return (
        "## Cómo se mantiene este documento\n"
        "\n"
        "Auto-generado por `scripts/generate_roadmap.py` ejecutado por "
        "`.github/workflows/sync-roadmap.yml`.\n"
        "\n"
        "**Triggers de regeneración:**\n"
        "\n"
        "- Apertura, cierre, edición de un issue\n"
        "- Cambio de labels o milestone en un issue\n"
        "- Merge de un PR a `main`\n"
        "- Cron diario a las 13:00 UTC (safety net)\n"
        "- Disparo manual (`workflow_dispatch`)\n"
        "\n"
        "**No editar manualmente este archivo.** Cualquier cambio será sobrescrito "
        "en la próxima ejecución del workflow. Para cambiar el contenido visible, "
        "actualiza los issues, milestones, ADRs o commits — la fuente de verdad son ellos.\n"
        "\n"
        "---\n"
        "\n"
        "_Generado por SIR V2 Living Roadmap System v0.1 (adaptado de sica-platform)_\n"
    )


def render(
    issues: list[Issue],
    milestones: list[Milestone],
    commits: list[Commit],
    adrs: list[ADR],
) -> str:
    last_update = latest_update_iso(issues)
    head_short = latest_non_bot_commit_short(commits)
    active = next(r for r in PHASES_META if r["active"])

    parts = [
        section_header(last_update, head_short, active),
        section_overall_progress(issues),
        section_visual_timeline(milestones, issues),
        section_visual_progress(milestones),
        section_phases_block(issues, milestones),
        section_blockers(issues),
        section_categories(issues),
        section_adrs(adrs),
        section_runtime_validation(),
        section_commits(commits),
        section_infrastructure(),
        section_footer(),
    ]
    body = "\n".join(parts)
    if not body.endswith("\n"):
        body += "\n"
    while "\n\n\n\n" in body:
        body = body.replace("\n\n\n\n", "\n\n\n")
    return body


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera MASTER_PLAN.md desde issues, milestones, commits y ADRs.")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="OWNER/REPO (default: %(default)s)")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Ruta de salida (default: %(default)s)")
    parser.add_argument(
        "--check",
        action="store_true",
        help="No escribe nada; exit 0 si coincide, 1 si difiere.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    out_path = (repo_root / args.output).resolve()
    decisions_dir = repo_root / "docs" / "decisions"

    log(f"repo:          {args.repo}")
    log(f"output:        {out_path}")
    log(f"decisions dir: {decisions_dir}")

    try:
        issues = fetch_issues(args.repo)
        milestones = fetch_milestones(args.repo)
        commits = fetch_recent_commits(args.repo)
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    adrs = read_adrs(decisions_dir)

    log(f"issues:     {len(issues)} ({sum(1 for i in issues if i.state == 'OPEN')} abiertos)")
    log(f"milestones: {len(milestones)}")
    log(f"commits:    {len(commits)} (raw)")
    log(f"adrs:       {len(adrs)}")

    new_content = render(issues, milestones, commits, adrs)
    log(f"output renderizado: {len(new_content)} chars, {new_content.count(chr(10))} lineas")

    if out_path.exists():
        old_content = out_path.read_text(encoding="utf-8")
        if old_content == new_content:
            log("sin cambios respecto al archivo en disco — no se escribe")
            return 0

    if args.check:
        log("--check: el archivo en disco difiere del output regenerado")
        return 1

    out_path.write_text(new_content, encoding="utf-8")
    log(f"escrito: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
