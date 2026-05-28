# Roadmap Guide — Mantenimiento del MASTER_PLAN

Este documento describe cómo se construye `MASTER_PLAN.md` y cómo
mantenerlo coherente con la realidad operativa del proyecto. Es la
referencia obligatoria antes de tocar `scripts/generate_roadmap.py` o
manipular milestones/issues que afecten al roadmap.

> **Regla de oro:** `MASTER_PLAN.md` se regenera por completo en cada run
> del bot. **No lo edites a mano.** La fuente de verdad son tres lugares:
> 1. `PHASES_META` en `scripts/generate_roadmap.py` (estructura de fases).
> 2. Milestones de GitHub (estado y due dates).
> 3. Issues etiquetados + asignados a milestone (contenido por fase).

---

## 1. Modelo conceptual

Una **fase** del Life OS es:

- Una entrada en `PHASES_META` (con `key`, `title`, `milestone_title`,
  `wedge`, `gate`, `active`).
- Un **milestone** en GitHub con el mismo `title`.
- Un **label** con el mismo `key` (ej. `fase-3`, `fase-backend-sync`).
- Cero o más **issues** asignados al milestone y/o etiquetados con el label.

Sólo una fase puede estar `active=True` a la vez. El script asserta esto
al cargar; si se rompe, el módulo falla rápido con mensaje claro.

---

## 2. Ciclo de vida de una fase

### 2.1 Crear una fase nueva

1. **Crear el label en GitHub:**
   ```sh
   gh label create "fase-N" \
     --repo aaronhuaynate66/sir-v2-life-os \
     --description "Fase N - <Nombre>" \
     --color "<HEX>"
   ```

2. **Crear el milestone en GitHub:**
   ```sh
   gh api repos/aaronhuaynate66/sir-v2-life-os/milestones \
     -f title="Fase N - <Nombre>" \
     -f description="<Wedge resumido>" \
     -f state="open"
   ```

3. **Agregar entry a `PHASES_META`** en el orden histórico (no numérico)
   que tiene sentido para el Gantt:
   ```python
   {
       "key": "fase-N",
       "milestone_title": "Fase N - <Nombre>",
       "title": "Fase N - <Nombre>",
       "period": "<Una línea>",
       "wedge": "<Foco central>",
       "gate": "<Criterio de salida medible>",
       "active": False,
   }
   ```

4. **(Opcional) Agregar `CATEGORY_RULES`** para que los issues de esa
   fase aparezcan agrupados en la sección "Issues por categoría":
   ```python
   ("<Etiqueta humana>", {"fase-N"}, ["palabra1", "palabra2"]),
   ```

5. **Commit** los cambios al script en un PR humano.

### 2.2 Activar una fase

Para mover la fase activa de A → B:

1. En `PHASES_META`: `A["active"] = False`, `B["active"] = True`.
2. Commitear en un PR.
3. El `assert` del script confirma que exactamente una queda activa.

> **No es necesario** cerrar el milestone de A en este paso. Cerrarlo
> sólo cuando se cumple su gate (ver 2.3).

### 2.3 Cerrar una fase

Una fase se considera **terminada** cuando se cumple **uno** de:

- Su milestone está `closed` en GitHub, **o**
- Su milestone tiene `total > 0` issues y `open_issues == 0`
  (auto-detección por `_milestone_is_done`).

Para cerrarla limpiamente:

1. Cerrar todos los issues asignados al milestone.
2. Cerrar el milestone:
   ```sh
   gh api -X PATCH \
     repos/aaronhuaynate66/sir-v2-life-os/milestones/<NUM> \
     -f state="closed"
   ```
3. En `PHASES_META`: `active=False` para esta fase, `active=True` para
   la siguiente.
4. Commit + PR.

> **Si te olvidas del paso 2** pero todos los issues están cerrados, el
> script igualmente reporta "✅ Completado" gracias a la auto-detección.
> Aun así, cerrar el milestone es preferible: aclara intención y deja
> la API de GitHub en estado limpio.

### 2.4 Backfill retroactivo (caso histórico)

Si una fase quedó documentada como código pero sin issues, se pueden
crear issues retroactivos:

```sh
gh issue create \
  --repo aaronhuaynate66/sir-v2-life-os \
  --title "Session N: <descripcion>" \
  --milestone "<Milestone title>" \
  --label "<fase-key>,retroactive" \
  --body "Issue retroactivo. PR: #X. Commit: <sha>."

gh issue close <num> --comment "Cerrado retroactivamente: linkea PR #X."
```

El label `retroactive` distingue estos del trabajo planificado prospectivamente.

---

## 3. Convenciones de naming

| Concepto | Formato | Ejemplo |
|----------|---------|---------|
| `key` en PHASES_META | `fase-N` minúsculas con guión | `fase-3`, `fase-backend-sync` |
| `milestone_title` | "Fase N - Nombre" | `Fase 3 - Memory Longitudinal` |
| Label de fase | Igual al `key` | `fase-3` |
| Título de issue retroactivo | `Session N: <desc>` | `Session 20a: Supabase setup` |
| Label adicional para backfill | `retroactive` | — |
| Label de bloqueante cross-fase | `bloqueante` | — |
| Label de deuda técnica | `deuda-tecnica` | — |

> Los acentos en `milestone_title` son opcionales pero deben coincidir
> exactamente entre el milestone en GitHub y la entrada en `PHASES_META`
> (es una comparación literal por string).

---

## 4. Regenerar MASTER_PLAN.md

### Manual (local)

```sh
python scripts/generate_roadmap.py --repo aaronhuaynate66/sir-v2-life-os
```

Requisitos:
- Python 3.10+.
- `gh` CLI autenticado (`gh auth status`).

Opciones:
- `--repo OWNER/REPO` — override del repo (default: `aaronhuaynate66/sir-v2-life-os`).
- `--output PATH` — override del archivo de salida (default: `MASTER_PLAN.md`).
- `--check` — no escribe, exit 1 si el output difiere del disco. Útil en CI.

El script es **determinístico**: misma data → mismo output. No usa
`now()`; el timestamp del documento se deriva del `updatedAt` máximo
entre issues.

### Automática (CI)

El workflow `.github/workflows/sync-roadmap.yml` ejecuta el script y
commitea como `sir-bot` cuando:

- Se abre/cierra/edita un issue.
- Se cambia el label o milestone de un issue.
- Se mergea un PR a `main`.
- Cron diario 13:00 UTC (safety net).
- `workflow_dispatch` (disparo manual).

Los commits del bot llevan `[skip ci]` para no triggear más builds.

---

## 5. Anti-patrones (qué NO hacer)

- ❌ Editar `MASTER_PLAN.md` a mano. Se sobreescribe.
- ❌ Tener dos fases con `active=True`. El `assert` bloquea.
- ❌ Cambiar el `milestone_title` en `PHASES_META` sin renombrar el
  milestone en GitHub. Quedan desincronizados (script muestra como vacío).
- ❌ Crear issues con el label de una fase pero sin asignar el milestone.
  Aparecen en "Bloqueantes y deuda transversal" en vez de en su fase.
- ❌ Cerrar un milestone que aún tiene issues abiertos. La
  auto-detección no lo marcará como done; quedará confuso.

---

## 6. Troubleshooting

| Síntoma | Causa probable | Fix |
|---------|----------------|-----|
| Fase muestra "🔄 Activo" con 100% cerrado | `active=True` en script + milestone open en GH | Cambiar a `active=False` (la auto-detección hace el resto) |
| `AssertionError: PHASES_META invariant` | Cero o múltiples `active=True` | Editar PHASES_META hasta dejar exactamente una |
| Sección de fase vacía cuando debería tener issues | Issues con label correcto pero sin milestone | Asignar el milestone al issue |
| Issues aparecen duplicados | No deberían — el filtro por milestone es exclusivo | Verificar que el issue tiene milestone único |
| `gh CLI no encontrado` | `gh` no instalado o no en PATH | `gh auth status` y reinstalar si falta |

---

_Mantenido junto a `scripts/generate_roadmap.py`. Si cambia el comportamiento del script, actualizá este doc en el mismo PR._
