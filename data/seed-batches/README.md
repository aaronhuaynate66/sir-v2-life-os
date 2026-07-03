# Seed batches

Batches JSON para cargar personas + observaciones + orgs + person_links a
Supabase de una vez. El script `scripts/seed-people.mjs` los consume.

## Uso

```bash
# 1) Poné el JSON acá (ver formato abajo)
data/seed-batches/2026-07-01-linkedin-hng.json

# 2) Exportá las envs (una vez por shell)
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="sbp_..."
export SEED_USER_ID="uuid-del-user-aaron"

# 3) Dry-run primero
node scripts/seed-people.mjs data/seed-batches/2026-07-01-linkedin-hng.json

# 4) Si el plan se ve bien, corré con --commit
node scripts/seed-people.mjs data/seed-batches/2026-07-01-linkedin-hng.json --commit
```

## Formato esperado del JSON

```json
{
  "_meta": { "batch": "linkedin-2026-07-01", "source": "…" },
  "people": [
    {
      "person": {
        "name": "…", "alias": "…",
        "relationship": "professional",
        "category": "network",
        "importance_score": 6, "trust_level": 5,
        "energy_impact": "neutral",
        "title": "…", "organization": "…",
        "linkedin_url": "…", "location": "…",
        "notes": "…"
      },
      "tags": ["…"],
      "org_link": { "name": "GRUPO HNG", "role": "…", "area": "TAC", "warning": "Empresa del usuario — no duplicar." },
      "observations": [
        { "capture_type": "linkedin", "confidence": "high",
          "observed_at": "2026-07-01", "data": { "…": "…" } }
      ]
    }
  ]
}
```

## Enums válidos (los CHECK del schema)

Si un valor cae fuera de estos sets, **el planner lo coerciona** al más cercano
(ES→EN, variantes comunes) y lo avisa en los warnings del dry-run — el apply ya
no revienta con un CHECK violation. Aun así, mandalos correctos de entrada:

| Campo | Valores válidos |
|---|---|
| `person.relationship` | `family` · `friend` · `romantic` · `professional` · `mentor` · `mentee` · `acquaintance` |
| `person.category` | `inner_circle` · `close` · `network` · `peripheral` *(⚠ `acquaintance` NO va acá — es `relationship`; se mapea a `peripheral`)* |
| `person.energy_impact` | `energizing` · `draining` · `neutral` |
| `person.importance_score`, `trust_level` | entero `1`–`10` |
| `person.gender` | `female` · `male` · `other` (acepta ES: `femenino`/`masculino`) |
| `observations[].capture_type` | `whatsapp_chat` · `whatsapp_web` · `whatsapp_info` · `instagram` · `dm_conversation` · `linkedin` · `manual_note` · `voice_note` · `unknown` |
| `observations[].confidence` | `high` · `medium` · `low` |

> `person_links[].kind` es texto libre (sin CHECK): cualquier string vale.

## Notas

- **person_links entre el batch**: si 2 personas comparten `org_link.name`,
  se linkean como `kind='colega'`. Si además comparten `org_link.area`, kind
  pasa a `colega_area` y weight sube a 7.
- **Metadata declarativa** (`weight`, `context`, `source`, `confidence`)
  requiere la migración **0107**. Sin ella, el script hace fallback: linkea
  sin metadata + avisa en consola.
- **GRUPO HNG (o cualquier org existente)**: si `org_profiles` ya tiene el
  slug, se REUSA — nunca se sobreescribe.
- **Idempotencia**: reprocesar el mismo batch NO duplica (slug único por
  persona; org por slug). Si querés forzar recarga, borrá manualmente en la
  DB antes de re-correr.

## Privacidad

Los JSON en `data/seed-batches/` NO se commitean (ver .gitignore) — traen
data personal de terceros. Guardalos ahí solo mientras los procesás; movelos
después o borrálos.
