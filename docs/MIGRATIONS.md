# Migraciones — flujo con runner (Supabase CLI)

> **Antes:** pegar SQL a mano en el dashboard de Supabase → causó el drift 0012
> (migración nunca aplicada en prod, 500 en `/api/memories/derive`).
> **Ahora:** runner versionado. Cada `00NN_name.sql` que se mergea a `main` lo
> aplica automáticamente `supabase db push` desde CI. Cierra el riesgo #2 de la
> auditoría.

## Flujo nuevo (en una línea)

**Agregás `supabase/migrations/00NN_name.sql` → merge a `main` → el workflow `Migrate DB (Supabase)` corre después de los tests y aplica SOLO lo pendiente.**

- Numerá secuencial respecto del último (`0024_…`, `0025_…`). El CLI deriva la
  `version` de los dígitos iniciales del nombre (regex real del CLI:
  `^([0-9]+)_(.*)\.sql$` → `0024_foo.sql` ⇒ version `0024`, name `foo`).
- Hacé las migraciones **idempotentes y aditivas** (`create … if not exists`,
  `add column if not exists`). Para `DROP`/`DELETE` → confirmación previa (regla
  del proyecto).
- `supabase migration new <name>` genera nombres con timestamp de 14 dígitos
  (`20260601…_<name>.sql`). Eso también funciona: `'0023' < '2026…'`
  lexicográficamente, así que el orden se mantiene. Podés seguir con `00NN` o
  pasar a timestamps; no mezclar de forma que rompa el orden.

## Cómo funciona el runner

`.github/workflows/migrate.yml`:
- Se dispara con `workflow_run` **después** de `Validate SIR V2` (type-check +
  lint + test + build) en `main`, sólo si esa validación pasó. (No corre en
  paralelo a tests que podrían fallar.) También se puede correr a mano con
  `workflow_dispatch`.
- Hace `supabase link --project-ref rzdtlkfeuswhdbmwivsy` + `supabase db push`.
- **Skip elegante** si faltan los secrets: no rompe el pipeline (solo un
  `notice`). El runner queda inerte hasta que se provean.

`supabase/config.toml` fija `project_id` (no es secreto; está en la URL pública).

---

## ⚠️ ACCIÓN MANUAL DE AARON — activación (one-time)

### 1. Secrets en GitHub Actions
`Settings > Secrets and variables > Actions > New repository secret`:

| Secret | Qué es | Dónde sacarlo |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token personal del CLI (auth a la API de Supabase). | https://supabase.com/dashboard/account/tokens → *Generate new token*. |
| `SUPABASE_DB_PASSWORD` | Password de la base (rol `postgres`) del proyecto. | Dashboard del proyecto → *Settings > Database > Database password* (o resetearla ahí). |

El `project-ref` (`rzdtlkfeuswhdbmwivsy`) ya está hardcodeado (no es secreto).

### 2. BASELINE del historial (crítico, one-time, por SQL Editor)

Las migraciones `0001..0023` **ya se aplicaron a mano** en prod, pero la tabla
de tracking del CLI (`supabase_migrations.schema_migrations`) NO las conoce. Sin
baseline, el primer `db push` intentaría **re-aplicarlas todas**. Este script
las marca como aplicadas (con el formato de `version` exacto que el CLI deriva
de los nombres de archivo, verificado contra el código fuente del CLI).

**Prerrequisito:** que `0023_rate_limits.sql` esté aplicado en prod (lo tenés del
trabajo de rate limiting; es idempotente — si dudás, re-corrélo). Así, tras el
baseline, el **primer `db push` es NO-OP** (nada pendiente) y es seguro.

Pegá esto en el **SQL Editor** de Supabase (prod) y ejecutá:

```sql
-- Baseline del historial de migraciones del CLI (one-time).
-- Idempotente: crea el schema/tabla/columnas si faltan e inserta las versiones
-- ya aplicadas con ON CONFLICT DO NOTHING. No toca ningún dato de la app.
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key
);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name       text;

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
  ('0023','rate_limits')
on conflict (version) do nothing;

-- Verificación: deberían listarse 23 filas, 0001..0023.
select version, name from supabase_migrations.schema_migrations order by version;
```

> **Alternativa oficial al SQL manual** (si preferís el CLI desde tu máquina):
> `supabase link --project-ref rzdtlkfeuswhdbmwivsy` y luego
> `supabase migration repair --status applied 0001 0002 0003 0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014 0015 0016 0017 0018 0019 0020 0021 0022 0023`.
> Hace exactamente lo mismo (marca esas versiones como aplicadas).

### 3. Verificar que el primer push es NO-OP
Con secrets + baseline listos, corré el workflow a mano
(`Actions > Migrate DB (Supabase) > Run workflow`) o pusheá cualquier cosa a
`main`. El log de `supabase db push` debe decir **"Remote database is up to
date"** (nada pendiente). A partir de ahí, cada `00NN` nuevo se aplica solo.

---

## Estado (honesto)

- ✅ Verificado en la sesión: `config.toml`, `migrate.yml` (skip elegante por
  secrets), formato de `version` del baseline (contra el fuente real del CLI:
  regex `^([0-9]+)_(.*)\.sql$`), tsc/lint/build/tests verdes.
- ⏳ Depende de Aaron (no testeable desde la sesión — sin creds de prod):
  agregar los 2 secrets, correr el baseline SQL, y confirmar el primer push
  NO-OP. Hasta entonces el runner hace skip y no aplica nada.
