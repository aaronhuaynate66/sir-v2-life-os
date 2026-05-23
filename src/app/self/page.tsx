Actúa como Staff Engineer cuidadoso. Claude Chrome se cortó mientras ejecutabas Fase 3 de SIR V2.

Proyecto:
aaronhuaynate66/sir-v2-life-os

Objetivo:
Continuar desde donde se quedó SIN rehacer ni malograr lo avanzado.

REGLAS CRÍTICAS:
- NO rehagas desde cero.
- NO borres archivos existentes.
- NO rediseñes las páginas ya creadas.
- NO cambies la arquitectura.
- NO agregues backend.
- NO agregues Supabase.
- NO agregues IA real.
- NO cambies stores existentes salvo que sea necesario para corregir imports/tipos.
- Haz una recuperación quirúrgica.

==================================================
ESTADO YA VERIFICADO
==================================================

Ya existen y deben conservarse:

src/components/layout/AppShell.tsx
src/components/layout/Nav.tsx

Ya existen y deben conservarse:

src/app/self/page.tsx
src/app/relationships/page.tsx
src/app/goals/page.tsx
src/app/finance/page.tsx
src/app/signals/page.tsx

Estas páginas ya usan stores y engines.

Problema probable:
Las páginas importan:

import { Card, Badge, Button, Input, Select, SectionHeader, EmptyState } from '@/components/ui'

Pero parece faltar:

src/components/ui/index.ts
src/components/ui/Card.tsx
src/components/ui/Badge.tsx
src/components/ui/Button.tsx
src/components/ui/Input.tsx
src/components/ui/Select.tsx
src/components/ui/Textarea.tsx
src/components/ui/SectionHeader.tsx
src/components/ui/EmptyState.tsx

==================================================
PASO 1 — DIAGNÓSTICO
==================================================

Antes de modificar:

1. Ejecuta:
   git status

2. Lista:
   src/components/
   src/components/ui/
   src/components/layout/
   src/app/
   src/app/self/
   src/app/relationships/
   src/app/goals/
   src/app/finance/
   src/app/signals/

3. Ejecuta:
   npm run type-check

4. Si falla por imports de '@/components/ui', confirma exactamente qué componentes faltan.

==================================================
PASO 2 — CORREGIR SOLO LO FALTANTE
==================================================

Si faltan componentes UI, crea SOLO estos archivos:

src/components/ui/Card.tsx
src/components/ui/Badge.tsx
src/components/ui/Button.tsx
src/components/ui/Input.tsx
src/components/ui/Select.tsx
src/components/ui/Textarea.tsx
src/components/ui/SectionHeader.tsx
src/components/ui/EmptyState.tsx
src/components/ui/index.ts

Requisitos:
- TypeScript estricto.
- Sin any.
- Componentes simples.
- Estilo dark, premium, sobrio.
- Compatibles con className.
- Compatibles con props HTML estándar.
- No instalar librerías externas.

Definiciones mínimas:

Card:
- wrapper div con border, bg oscuro, rounded, padding.
- props: children, className.

Badge:
- props: label, variant.
- variants: default, muted, ok, warn, bad, info.

Button:
- button estándar.
- props HTML de button.
- variants: default, ghost, ok, warn, bad.
- soportar className.

Input:
- input estándar.
- props HTML de input.
- soportar className.

Select:
- select estándar.
- props HTML de select.
- soportar className.

Textarea:
- textarea estándar.
- props HTML de textarea.
- soportar className.

SectionHeader:
- props: title, subtitle?, action?
- layout simple.

EmptyState:
- props: message, action?
- estado vacío sobrio.

index.ts:
- exportar todos los componentes.

==================================================
PASO 3 — VALIDAR PÁGINAS EXISTENTES
==================================================

Después de crear los componentes:

1. No rediseñes las páginas.
2. Corrige solo errores TypeScript mínimos si aparecen.
3. Verifica que estas rutas compilen:
   - /dashboard
   - /self
   - /relationships
   - /goals
   - /finance
   - /signals

==================================================
PASO 4 — OPCIONAL SOLO SI FALTA
==================================================

Si /dashboard todavía no usa AppShell, NO lo reescribas completo.
Solo déjalo para una fase posterior, salvo que sea necesario para build.

==================================================
PASO 5 — VALIDACIÓN FINAL
==================================================

Ejecuta:

npm run type-check
npm run lint
npm run build

Si falla:
- corrige el error mínimo necesario;
- no uses any;
- no desactives TypeScript;
- no borres funcionalidad;
- no cambies la visión.

==================================================
ENTREGA FINAL
==================================================

Responde con:

1. Estado inicial encontrado
2. Componentes UI faltantes encontrados
3. Archivos creados
4. Archivos modificados
5. Errores corregidos
6. Resultado de type-check
7. Resultado de lint
8. Resultado de build
9. Qué queda pendiente de Fase 3

IMPORTANTE:
Esta es una recuperación quirúrgica. No repitas la Fase 3 desde cero.
