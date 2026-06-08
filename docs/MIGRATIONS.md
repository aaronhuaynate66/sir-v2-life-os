# Migraciones — flujo con runner (Supabase CLI)

> **Antes:** pegar SQL a mano en el dashboard de Supabase → causó el drift 0012
> (migración nunca aplicada en prod, 500 en `/api/memories/derive`).
> **Ahora:** runner versionado. Cada `00NN_name.sql` que se mergea a `main` lo
> aplica automáticamente `supabase db push` desde CI. Cierra el riesgo #2 de la
> auditoría.

## Flujo nuevo (en una línea)

**Agregás `supabase/migrations/00NN_name.sql` → merge a `main` → el workflow `Migrate DB (Supabase)` corre después de los tests y aplica SOLO lo pendiente.**

- Numerá secuencial respecto del último (`0066_…`, `0067_…`). El CLI deriva la
  `version` de los dígitos iniciales del nombre (regex real del CLI:
  `^([0-9]+)_(.*).sql$` → `0066_foo.sql` ⇒ version `0066`, name `foo`).
- Hacé las migraciones **idempotentes y aditivas** (`create … if not exists`,
  `add column if not exists`). Para `DROP`/`DELETE` → confirmación previa (regla
  del proyecto).
- `supabase migration new <name>` genera nombres con timestamp de 14 dígitos
  (`20260601…_<name>.sql`). Eso también funciona: `'0023' < '2026…'`
  lexicográficamente, así que el orden se mantiene. Podés seguir con `00NN` o
  pasar a timestamps; no mezclar de forma que rompa el orden.

---

## ⚠️ ACCIÓN MANUAL DE AARON — activación (one-time)

> **✅ COMPLETADA — 2026-06-08.** El baseline fue ejecutado directamente en el
> SQL Editor de Supabase (prod) y la tabla `supabase_migrations.schema_migrations`
> refleja 47 versiones aplicadas (0001..0065 excepto 0063). El runner está activo.
> Pendiente: proveer los 2 secrets de GitHub Actions para habilitar el CI push.

### 1. Secrets en GitHub Actions

`Settings > Secrets and variables > Actions > New repository secret`:

| Secret | Qué es | Dónde sacarlo |
|--------|--------|---------------|
| `SUPABASE_ACCESS_TOKEN` | Token personal del CLI (auth a la API de Supabase). | <https://supabase.com/dashboard/account/tokens> → Generate new token. |
| `SUPABASE_DB_PASSWORD` | Password de la base (rol `postgres`) del proyecto. | Dashboard del proyecto → Settings > Database > Database password (o resetearlo ahí). |

El `project-ref` (`rzdtlkfeuswhdbmwivsy`) ya está hardcodeado (no es secreto).

### 2. BASELINE del historial (one-time) — YA EJECUTADO 2026-06-08

Las migraciones 0001..0065 ya se aplicaron a mano en prod y la tabla de tracking
del CLI fue poblada el 2026-06-08. La versión **0063** (`person_private_notes` —
`people.private_notes`) **no estaba aplicada** y se dejó para que `db push` la
aplique en el primer run (es idempotente: solo hace `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

**Baseline ejecutado (SQL Editor, prod, 2026-06-08):**

```sql
-- Baseline del historial de migraciones del CLI (one-time, ejecutado 2026-06-08).
-- 47 versiones insertadas. Versión 0063 omitida (no aplicada en prod).
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key
);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;

insert into supabase_migrations.schema_migrations (version, name) values
  ('0001','initial_schema'),
  ('0002','text_ids'),
  ('0003','currency_support'),
  ('0004','timeline_indexes'),
  ('0005','scale_captures'),
  ('0006','fix_id_types'),
  ('0007','add_capture_type'),
  ('0008','people_slug'),
  ('0009','whatsapp_captures'),
  ('0010','observations_and_person_canonical'),
  ('0011','capture_storage_buckets'),
  ('0012','memories_source_event_dedupe'),
  ('0013','person_logs'),
  ('0014','voice_notes_bucket'),
  ('0015','memories_embeddings'),
  ('0016','longitudinal_summaries'),
  ('0017','enable_realtime_camino_a'),
  ('0018','replica_identity_full_camino_a'),
  ('0019','realtime_publish_delete'),
  ('0020','observations_whatsapp_web'),
  ('0021','relationship_events'),
  ('0022','memories_columns_safety'),
  ('0023','rate_limits'),
  ('0024','person_relationship_fields'),
  ('0025','person_sensitive_data'),
  ('0030','self_diagnosis'),
  ('0031','finance_intent'),
  ('0035','person_links'),
  ('0040','objective_steps'),
  ('0041','objective_steps_okr'),
  ('0042','goals_smart'),
  ('0045','memories_is_obsolete'),
  ('0046','calendar_connections'),
  ('0047','person_profile_axes'),
  ('0048','action_suggestions'),
  ('0049','health_ingest_source'),
  ('0050','objective_steps_jira'),
  ('0051','trackers'),
  ('0052','person_links_realtime'),
  ('0055','identity_profile'),
  ('0058','person_links_self_sentinel'),
  ('0059','identity_profile_enrichment'),
  ('0060','goals_anchor'),
  ('0061','objective_steps_due_time'),
  ('0062','daily_briefs'),
  -- 0063 omitido: people.private_notes no existe en prod → se aplica en el primer db push
  ('0064','memories_is_private'),
  ('0065','daily_briefs_scope')
on conflict (version) do nothing;

-- Verificación: deben listarse 47 filas.
select count(*) from supabase_migrations.schema_migrations;
select version, name from supabase_migrations.schema_migrations order by version;
```

> **Alternativa CLI (desde tu máquina):**
> `supabase link --project-ref rzdtlkfeuswhdbmwivsy` y luego:
> `supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 0019 0020 0021 0022 0023 0024 0025 0030 0031 0035 0040 0041 0042 0045 0046 0047 0048 0049 0050 0051 0052 0055 0058 0059 0060 0061 0062 0064 0065`
> Hace exactamente lo mismo (marca esas versiones como aplicadas).

### 3. Verificar que el primer push es NO-OP
Con secrets + baseline listos, corré el workflow a mano
(`Actions > Migrate DB (Supabase) > Run workflow`) o pusheá cualquier cosa a
`main`. El log de `supabase db push` debe decir **"Remote database is up to
date"** (nada pendiente, excepto 0063 que es idempotente). A partir de ahí, cada
`00NN` nuevo se aplica solo.

---

## Clasificación de migraciones (nota de mantenimiento)

Las migraciones se clasifican en dos categorías según su idempotencia:

### NO idempotentes — crean tabla + policies (no se pueden re-aplicar)

Estas migraciones crean tablas con RLS policies. Si se re-aplican sobre una BD
que ya las tiene, **falla** con "policy already exists". Por eso se baselinearon
explícitamente.

| Versión | Tabla(s) creadas |
|---------|-----------------|
| 0025 | person_sensitive_data |
| 0030 | self_diagnosis |
| 0035 | person_links |
| 0040 | objective_steps |
| 0046 | calendar_connections |
| 0047 | person_profile_axes |
| 0048 | action_suggestions |
| 0051 | trackers, tracker_points |
| 0055 | identity_profile |
| 0062 | daily_briefs |

### Idempotentes / seguras de re-correr

Solo hacen `ADD COLUMN IF NOT EXISTS` o bloques guardados con `IF NOT EXISTS`.

| Versiones |
|-----------|
| 0024, 0031, 0041, 0042, 0045, 0049, 0050, 0052, 0058, 0059, 0060, 0061, 0063, 0064, 0065 |

---

## Estado

- ✅ Verificado: `config.toml`, `migrate.yml` (skip elegante por secrets), formato
  de `version` del baseline (contra el fuente real del CLI: regex
  `^([0-9]+)_(.*).sql$`), tsc/lint/build/tests verdes.
- ✅ Baseline ejecutado 2026-06-08: 47 versiones en `supabase_migrations.schema_migrations`.
  Versión 0063 omitida (pendiente — se aplicará en primer db push, es idempotente).
- ⏳ Pendiente de Aaron: agregar los 2 secrets de GitHub Actions
  (`SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`), disparar el workflow y
  confirmar primer db push NO-OP (o que solo aplique 0063).
