# DRY-RUN de dos deudas — reporte para aprobar

> **Nada de esto se aplicó.** Es un reporte de "qué CAMBIARÍA" para que decidas.
> Tooling: [`scripts/deuda-dry-run.mjs`](../scripts/deuda-dry-run.mjs) — SOLO LECTURA
> (PostgREST + Storage API con el service-role del `.env.local`, mismo patrón que
> `scripts/audit-prod-schema.mjs`).
>
> Correr:
> ```bash
> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/deuda-dry-run.mjs        # legible
> node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/deuda-dry-run.mjs --json  # JSON
> ```
> El script importa el reconcile REAL (`src/lib/facts/reconcile.ts`) directo — no
> reimplementa la lógica, así que el dry-run refleja exactamente lo que haría un
> apply. Corre desde el worktree o desde el repo principal (cae al `.env.local`
> del repo canónico si el worktree no lo tiene).

Última corrida: **2026-07-10** (datos en vivo).

---

## Deuda 1 — Consistencia temporal de hechos (backfill relocation-only)

Regla (conservadora, de `reconcile.ts`): un hecho SOLO queda obsoleto si hay una
**MUDANZA explícita posterior** (`se mudó`, `se instaló`, `se fue a vivir`, o
`llegó/regresó/volvió a <NombrePropio>`). Un simple "vive con X / vive en Y" NO
supersede a otro hecho de vivienda — suelen ser complementarios. Esta es la
lección cara de la v1: era demasiado agresiva y dropeaba facts válidos.

### Resultado del dry-run

| Métrica | Valor |
|---|---|
| Personas con facts escaneadas | **31** |
| Observations vivas con facts | 33 |
| Facts de residencia detectados (red-wide) | 26 |
| Facts de MUDANZA explícita detectados | **1** |
| Personas afectadas | **0** |
| **Facts que se obsoletarían** | **0** |

### Qué se obsoletaría

**Nada.** El backfill no dropearía ningún fact.

Por qué es un cero **correcto** (no un bug): en toda la red hay exactamente una
mudanza explícita — *"se mudó a inicios de noviembre de 2024"*, en la ficha de
**Nicolle Huaynate Espinoza** (el caso original que motivó `reconcile.ts`). El
reconcile obsoleta los facts de vivienda **anteriores** a esa mudanza. Pero en
la secuencia cronológica de Nicolle:

- La mudanza está en la posición 21 de sus facts.
- **No hay ningún fact de residencia antes** de ella.
- El viejo "vive con Aaron" ya fue reescrito en el sustrato como
  *"compartía departamento con Aaron antes de mudarse"* (pasado, y ubicado
  **después** de la mudanza). Además usa "compartía", no un verbo de residencia,
  así que ni siquiera cuenta como `residence` — no es candidato a obsoletarse.

O sea: el caso Nicolle ya está resuelto en la data actual, y el reconcile
conservador confirma que **no queda nada por dropear**. Si en el futuro cargás
capturas con residencias viejas + una mudanza nueva, el mismo script las va a
listar acá antes de cualquier apply.

> Verificación manual del único candidato (Nicolle): 28 facts vivos, mudanza en
> índice 21, cero facts de residencia previos → `superseded: 0`. ✔

---

## Deuda 2 — Huérfanos de Storage

Un objeto es **huérfano** si ningún row VIVO lo referencia. Referencias por bucket:

- `linkedin-captures` / `instagram-captures` / `whatsapp-captures`
  → `observations.source_image_path` (con `storage_bucket` matching, `is_obsolete = false`)
- `person-avatars` → `person_avatars.storage_path`
- `scale-captures` → `health_metrics.source_image_path`

Se distinguen dos categorías (conservador de cara a un borrado futuro):

- **Huérfano**: sin NINGUNA referencia (ni viva ni obsoleta). Candidato más claro a limpiar.
- **Solo-obsoleto**: referenciado únicamente por una observation ya marcada
  `is_obsolete = true`. Técnicamente sigue linkeado a un row; borrarlo es una
  decisión aparte (¿purgar también la observation obsoleta?).

### Resultado del dry-run

| Bucket | Objetos | Refs vivas | **Huérfanos** | Solo-obsoleto |
|---|---:|---:|---:|---:|
| `linkedin-captures` | 5 | 3 | **0** | 2 |
| `instagram-captures` | 10 | 9 | **0** | 1 |
| `whatsapp-captures` | 4 | 1 | **2** | 1 |
| `person-avatars` | 3 | 1 | **2** | 0 |
| `scale-captures` | 33 | 30 | **3** | 0 |
| **TOTAL** | 55 | — | **7** | 4 |

### Paths exactos

**Huérfanos (7)** — sin referencia alguna:

```
whatsapp-captures/  5c23c82c-…/whatsapp-chat/1781474026437-x79wdvjj.webp
whatsapp-captures/  5c23c82c-…/whatsapp-chat/1781474043661-8oqvm852.webp
person-avatars/     5c23c82c-…/per_1782430958032_cgyv82.jpg
person-avatars/     5c23c82c-…/per_1782937643405_ehyszn.jpg
scale-captures/     5c23c82c-…/cap_1781118542801.webp
scale-captures/     5c23c82c-…/cap_1782051879262.webp
scale-captures/     5c23c82c-…/cap_1782680816849.webp
```

**Solo-obsoleto (4)** — linkeados a una observation obsoleta, decisión aparte:

```
linkedin-captures/   5c23c82c-…/linkedin/1780340929056-3596onlz.webp
linkedin-captures/   5c23c82c-…/linkedin/1780368744667-9jhxo993.webp
instagram-captures/  5c23c82c-…/instagram/1783370742891-cobavzlx.webp
whatsapp-captures/   5c23c82c-…/dm_conversation/1781491517034-1j8k35qd.webp
```

### Caveats antes de un apply

1. **Captura multi-imagen**: cada observation persiste UN `source_image_path`. Si
   una captura subió varias imágenes del mismo perfil, las imágenes "extra"
   podrían aparecer como huérfanas aunque hayan alimentado una observation viva.
   Revisar los `whatsapp-chat/*` huérfanos con eso en mente.
2. Los `person-avatars` huérfanos usan el patrón `{userId}/{personId}.{ext}`:
   suelen ser avatares reemplazados (otra extensión) o de personas borradas.
   El `DELETE /api/avatars` ya borra el archivo, así que estos son restos de
   fallos silenciosos o de cambios de extensión.
3. Los `scale-captures` huérfanos (`cap_*.webp`) son screenshots cuyas métricas
   en `health_metrics` fueron borradas después. La imagen no aporta a ningún
   motor sin su row.

---

## Estado

- [x] Tooling read-only construido y corrido.
- [x] Reporte generado con números reales.
- [x] **Deuda 1 (facts):** 0 para obsoletar → nada que aplicar. Cerrada.
- [x] **Deuda 2 (storage) — APLICADO PARCIAL (10-jul, con OK de Aaron):** borradas las
      **5 huérfanas seguras** (3 `scale-captures/cap_*` + 2 `person-avatars/*`),
      verificado (esos buckets → 0 huérfanos). **RETENIDAS a propósito:** las 2
      `whatsapp-captures/whatsapp-chat/*` (caveat #1: posible extra de captura
      multi-imagen viva) + las 4 solo-obsoletas. Si querés purgar también esas,
      decidí antes si borrás la observation obsoleta que las referencia.
