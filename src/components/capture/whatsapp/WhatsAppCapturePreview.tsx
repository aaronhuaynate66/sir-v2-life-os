'use client'
// SIR V2 — Step 3: preview editable de la captura WhatsApp.
//
// Secciones:
//   1. Contacto (dropdown + crear nuevo inline)
//   2. Fecha conversacion (con warning amber si Vision no detecto)
//   3. Resumen (textarea)
//   4. Temas (chips editables)
//   5. Estados emocionales (2 inputs)
//   6. Mensajes (colapsable)
//   7. Preguntas reflexivas (condicional, editables)
//   8. Acciones (cancelar + guardar) con validacion inline.

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  Plus, X as XIcon, MessageSquare, Sticker, Smile, UserPlus,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { findPersonByName } from '@/lib/capture/whatsapp/client'
import { generateSlug, ensureUniqueSlug } from '@/lib/people/slug'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Person } from '@/types'
import type {
  WhatsAppCaptureExtracted, PersonMatch,
} from '@/lib/capture/whatsapp/types'

interface WhatsAppCapturePreviewProps {
  previewUrl: string
  extracted: WhatsAppCaptureExtracted
  saving: boolean
  onCancel: () => void
  onConfirm: (args: {
    personId: string
    conversationDate: string
    finalExtracted: WhatsAppCaptureExtracted
  }) => void
}

const CONFIDENCE_VISUAL: Record<
  WhatsAppCaptureExtracted['confidence'],
  { Icon: typeof CheckCircle2; class: string; label: string }
> = {
  high:   { Icon: CheckCircle2,  class: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10', label: 'alta' },
  medium: { Icon: AlertCircle,   class: 'text-amber-400 border-amber-500/30 bg-amber-500/10',       label: 'media' },
  low:    { Icon: AlertTriangle, class: 'text-red-400 border-red-500/30 bg-red-500/10',             label: 'baja' },
}

const MATCH_VISUAL: Record<PersonMatch['confidence'], { emoji: string; label: string; class: string }> = {
  high:   { emoji: '🟢', label: 'auto', class: 'text-emerald-400' },
  medium: { emoji: '🟡', label: 'ambiguo', class: 'text-amber-400' },
  low:    { emoji: '🔴', label: 'manual', class: 'text-red-400' },
}

function defaultDateTimeLocal(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const valid = !isNaN(d.getTime()) ? d : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${valid.getFullYear()}-${pad(valid.getMonth() + 1)}-${pad(valid.getDate())}T${pad(valid.getHours())}:${pad(valid.getMinutes())}`
}

function localToIso(local: string): string {
  const d = new Date(local)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export function WhatsAppCapturePreview({
  previewUrl,
  extracted,
  saving,
  onCancel,
  onConfirm,
}: WhatsAppCapturePreviewProps) {
  const { people, addPerson } = useRelationshipStore()

  // Estados controlados (editables)
  const [personId, setPersonId] = useState<string>('')
  const [personMatch, setPersonMatch] = useState<PersonMatch | null>(null)
  const [conversationDateLocal, setConversationDateLocal] = useState<string>(
    defaultDateTimeLocal(extracted.conversationDate),
  )
  const [summary, setSummary] = useState<string>(extracted.summary)
  const [topics, setTopics] = useState<string[]>(extracted.topics)
  const [newTopic, setNewTopic] = useState<string>('')
  const [otherPersonState, setOtherPersonState] = useState<string>(
    extracted.emotionalStates.otherPerson ?? '',
  )
  const [userState, setUserState] = useState<string>(extracted.emotionalStates.user ?? '')
  const [showMessages, setShowMessages] = useState<boolean>(false)
  const [reflectionQs, setReflectionQs] = useState<string[]>(
    extracted.reflectionQuestions ?? [],
  )

  // Crear persona inline
  const [creatingNew, setCreatingNew] = useState<boolean>(false)
  const [newName, setNewName] = useState<string>(extracted.personName.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim())
  const [newSlug, setNewSlug] = useState<string>(generateSlug(newName))
  const [newPersonSaving, setNewPersonSaving] = useState<boolean>(false)

  // Validaciones
  const [submitError, setSubmitError] = useState<string | null>(null)

  const visionDetectedDate = extracted.conversationDate !== null
  const confidence = CONFIDENCE_VISUAL[extracted.confidence]
  const ConfIcon = confidence.Icon

  // ─── Auto-match al montar ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function autoMatch() {
      try {
        const supabase = createClient()
        const { data: authData } = await supabase.auth.getUser()
        const userId = authData?.user?.id
        if (!userId || !extracted.personName) return
        const match = await findPersonByName(extracted.personName, userId)
        if (cancelled) return
        setPersonMatch(match)
        if (match.personId) {
          setPersonId(match.personId)
        }
      } catch {
        // ignore — el usuario puede seleccionar manual
      }
    }
    void autoMatch()
    return () => {
      cancelled = true
    }
  }, [extracted.personName])

  // Regenerar slug cuando cambia newName
  useEffect(() => {
    setNewSlug(generateSlug(newName))
  }, [newName])

  // ─── handlers ────────────────────────────────────────────────────
  function addTopic() {
    const t = newTopic.trim().toLowerCase()
    if (!t) return
    if (topics.includes(t)) {
      setNewTopic('')
      return
    }
    setTopics((prev) => [...prev, t])
    setNewTopic('')
  }

  function removeTopic(t: string) {
    setTopics((prev) => prev.filter((x) => x !== t))
  }

  function addReflectionQuestion() {
    if (reflectionQs.length >= 3) return
    setReflectionQs((prev) => [...prev, ''])
  }

  function updateReflectionQuestion(i: number, value: string) {
    setReflectionQs((prev) => prev.map((q, idx) => (idx === i ? value : q)))
  }

  function removeReflectionQuestion(i: number) {
    setReflectionQs((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleCreatePerson(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmedName = newName.trim()
    if (!trimmedName) {
      toast.error('Nombre vacío', { description: 'Ingresá al menos un nombre.' })
      return
    }
    setNewPersonSaving(true)
    try {
      const supabase = createClient()
      const { data: authData, error: authError } = await supabase.auth.getUser()
      if (authError || !authData?.user?.id) {
        throw new Error('Sesión expirada.')
      }
      const userId = authData.user.id
      const finalSlug = await ensureUniqueSlug(newSlug.trim() || generateSlug(trimmedName), userId, {
        client: supabase,
      })
      const now = new Date().toISOString()
      const newPerson: Person = {
        id: crypto.randomUUID(),
        slug: finalSlug,
        name: trimmedName,
        relationship: 'friend',
        category: 'close',
        importanceScore: 5,
        energyImpact: 'neutral',
        trustLevel: 5,
        contactFrequency: '',
        tags: [],
        notes: '',
        createdAt: now,
        updatedAt: now,
      }
      addPerson(newPerson)
      // Selecciona la nueva persona en el dropdown.
      setPersonId(newPerson.id)
      setPersonMatch({ personId: newPerson.id, confidence: 'high' })
      setCreatingNew(false)
      toast.success('Persona creada', { description: trimmedName })
    } catch (err) {
      toast.error('No se pudo crear', {
        description: err instanceof Error ? err.message : 'Error inesperado.',
      })
    } finally {
      setNewPersonSaving(false)
    }
  }

  function handleSubmit() {
    setSubmitError(null)
    if (!personId) {
      setSubmitError('Asociá la captura a una persona o creá una nueva.')
      return
    }
    if (!summary.trim()) {
      setSubmitError('El resumen no puede estar vacío.')
      return
    }
    const finalExtracted: WhatsAppCaptureExtracted = {
      ...extracted,
      summary: summary.trim(),
      topics,
      emotionalStates: {
        otherPerson: otherPersonState.trim() || undefined,
        user: userState.trim() || undefined,
      },
      reflectionQuestions:
        reflectionQs.length > 0 ? reflectionQs.map((q) => q.trim()).filter(Boolean) : undefined,
    }
    onConfirm({
      personId,
      conversationDate: localToIso(conversationDateLocal),
      finalExtracted,
    })
  }

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === personId),
    [people, personId],
  )

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 space-y-5">
        {/* ─── Header: thumbnail + confidence + observations ───────── */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL no es optimizable por next/image */}
          <img
            src={previewUrl}
            alt="Captura WhatsApp"
            className="w-full sm:w-48 max-w-[200px] h-auto object-contain rounded-md border border-border bg-muted/30 mx-auto sm:mx-0"
          />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <Badge
                variant="outline"
                className={cn('text-[10px] font-mono uppercase tracking-wider', confidence.class)}
              >
                <ConfIcon size={11} strokeWidth={2} className="mr-1" />
                Confianza {confidence.label}
              </Badge>
              {extracted.personName && (
                <span className="text-xs text-muted-foreground font-mono">
                  Header: <span className="text-foreground">{extracted.personName}</span>
                </span>
              )}
            </div>
            {extracted.rawObservations && (
              <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 border border-border rounded-md px-3 py-2">
                <span className="font-mono uppercase tracking-wider text-muted-foreground/70 mr-1">
                  Nota:
                </span>
                {extracted.rawObservations}
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* ─── 1. Contacto ────────────────────────────────────────── */}
        <div>
          <Label className="text-xs flex items-center gap-2 mb-2">
            Contacto
            {personMatch && (
              <span className={cn('text-[10px] font-mono', MATCH_VISUAL[personMatch.confidence].class)}>
                {MATCH_VISUAL[personMatch.confidence].emoji} {MATCH_VISUAL[personMatch.confidence].label}
              </span>
            )}
          </Label>
          {!creatingNew ? (
            <div className="space-y-2">
              <Select value={personId} onValueChange={setPersonId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccioná una persona…" />
                </SelectTrigger>
                <SelectContent>
                  {people.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No hay personas todavía.
                    </div>
                  ) : (
                    people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        {p.alias && p.alias !== p.name ? ` (${p.alias})` : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreatingNew(true)}
                disabled={saving}
                className="text-xs"
              >
                <UserPlus size={13} strokeWidth={1.75} className="mr-1.5" aria-hidden="true" />
                Crear nueva persona
              </Button>
            </div>
          ) : (
            <form
              onSubmit={handleCreatePerson}
              className="border border-border rounded-md p-3 space-y-2 bg-muted/20"
            >
              <div>
                <Label htmlFor="new-person-name" className="text-xs">
                  Nombre
                </Label>
                <Input
                  id="new-person-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={newPersonSaving}
                  autoFocus
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="new-person-slug" className="text-xs">
                  Slug
                </Label>
                <Input
                  id="new-person-slug"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  disabled={newPersonSaving}
                  className="mt-1 font-mono"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  URL: <span className="font-mono text-foreground/70">/relaciones/{newSlug || '<slug>'}</span>
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCreatingNew(false)}
                  disabled={newPersonSaving}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={newPersonSaving || !newName.trim()}>
                  {newPersonSaving ? 'Creando…' : 'Crear persona'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* ─── 2. Fecha conversación ──────────────────────────────── */}
        <div>
          <Label htmlFor="convo-date" className="text-xs">
            Fecha conversación
          </Label>
          <Input
            id="convo-date"
            type="datetime-local"
            value={conversationDateLocal}
            onChange={(e) => setConversationDateLocal(e.target.value)}
            disabled={saving}
            className={cn(
              'mt-1 font-mono tabular-nums',
              !visionDetectedDate && 'border-amber-500/40 focus-visible:ring-amber-500/40',
            )}
            aria-describedby={visionDetectedDate ? undefined : 'convo-date-warning'}
          />
          {!visionDetectedDate && (
            <p
              id="convo-date-warning"
              className="text-[11px] text-amber-400 mt-1 flex items-start gap-1 leading-snug"
              role="status"
            >
              <AlertTriangle
                size={12}
                strokeWidth={2}
                className="flex-shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <span>
                No pude leer la fecha de la imagen. Si esta captura no es de hoy,
                cambiala antes de guardar.
              </span>
            </p>
          )}
        </div>

        {/* ─── 3. Resumen ─────────────────────────────────────────── */}
        <div>
          <Label htmlFor="summary" className="text-xs">
            Resumen
          </Label>
          <textarea
            id="summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            disabled={saving}
            rows={3}
            className="mt-1 w-full text-sm border border-border rounded-md px-3 py-2 bg-background resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Editá si querés precisar algo.
          </p>
        </div>

        {/* ─── 4. Temas ───────────────────────────────────────────── */}
        <div>
          <Label className="text-xs">Temas</Label>
          <div className="flex flex-wrap gap-1.5 mt-1 mb-2">
            {topics.length === 0 && (
              <span className="text-[11px] text-muted-foreground">Sin temas todavía.</span>
            )}
            {topics.map((t) => (
              <Badge
                key={t}
                variant="outline"
                className="text-[10px] font-mono gap-1 pr-1"
              >
                {t}
                <button
                  type="button"
                  onClick={() => removeTopic(t)}
                  disabled={saving}
                  aria-label={`Quitar ${t}`}
                  className="hover:text-red-400 rounded"
                >
                  <XIcon size={10} strokeWidth={2} />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTopic()
                }
              }}
              placeholder="agregar tema (ej. health, work_context)"
              aria-label="Agregar tema"
              disabled={saving}
              className="text-sm"
            />
            <Button type="button" size="sm" variant="outline" onClick={addTopic} disabled={saving || !newTopic.trim()} aria-label="Agregar tema">
              <Plus size={13} strokeWidth={1.75} aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* ─── 5. Estados emocionales ─────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label htmlFor="other-state" className="text-xs">
              Estado emocional · otra persona
            </Label>
            <Input
              id="other-state"
              value={otherPersonState}
              onChange={(e) => setOtherPersonState(e.target.value)}
              disabled={saving}
              placeholder="ej. physical_pain"
              className="mt-1 font-mono text-xs"
            />
          </div>
          <div>
            <Label htmlFor="user-state" className="text-xs">
              Estado emocional · vos
            </Label>
            <Input
              id="user-state"
              value={userState}
              onChange={(e) => setUserState(e.target.value)}
              disabled={saving}
              placeholder="ej. humorous_distant"
              className="mt-1 font-mono text-xs"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground -mt-3">
          Formato snake_case. Combinable con &lsquo;+&rsquo;.
        </p>

        {/* ─── 6. Mensajes (colapsable) ───────────────────────────── */}
        <div>
          <button
            type="button"
            onClick={() => setShowMessages((v) => !v)}
            className="text-xs font-medium text-foreground flex items-center gap-1.5 hover:text-primary transition-colors"
          >
            {showMessages ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            <MessageSquare size={13} strokeWidth={1.75} />
            {showMessages ? 'Ocultar mensajes' : `Mostrar mensajes (${extracted.rawMessages.length})`}
          </button>
          {showMessages && (
            <ul className="mt-2 space-y-1 max-h-64 overflow-y-auto pr-1">
              {extracted.rawMessages.map((m, i) => (
                <li
                  key={`${m.timestamp}-${i}`}
                  className="flex gap-2 items-start text-xs px-2 py-1 border-b border-border/30 last:border-0"
                >
                  <span className="font-mono text-muted-foreground/70 w-12 flex-shrink-0">
                    {m.timestamp}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[9px] font-mono uppercase tracking-wider flex-shrink-0',
                      m.author === 'user'
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-blue-500/30 bg-blue-500/10 text-blue-300',
                    )}
                  >
                    {m.author === 'user' ? 'yo' : 'otra'}
                  </Badge>
                  <span className="flex-1 leading-snug">{m.content}</span>
                  {m.hasSticker && (
                    <Sticker size={11} strokeWidth={1.75} className="text-muted-foreground/70 flex-shrink-0" aria-label="sticker" />
                  )}
                  {m.hasEmoji && (
                    <Smile size={11} strokeWidth={1.75} className="text-muted-foreground/70 flex-shrink-0" aria-label="emoji" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ─── 7. Preguntas reflexivas (condicional) ──────────────── */}
        {(reflectionQs.length > 0 || extracted.reflectionQuestions) && (
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              Preguntas reflexivas
              <span className="text-[10px] font-mono text-muted-foreground/70">
                (Nivel C)
              </span>
            </Label>
            <ul className="mt-2 space-y-2">
              {reflectionQs.map((q, i) => (
                <li key={i} className="flex gap-2 items-start">
                  <Input
                    value={q}
                    onChange={(e) => updateReflectionQuestion(i, e.target.value)}
                    aria-label={`Pregunta reflexiva ${i + 1}`}
                    disabled={saving}
                    className="text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeReflectionQuestion(i)}
                    disabled={saving}
                    aria-label="Quitar pregunta"
                    className="flex-shrink-0"
                  >
                    <XIcon size={13} strokeWidth={1.75} />
                  </Button>
                </li>
              ))}
            </ul>
            {reflectionQs.length < 3 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addReflectionQuestion}
                disabled={saving}
                className="mt-2 text-xs"
              >
                <Plus size={13} strokeWidth={1.75} className="mr-1.5" />
                Agregar pregunta
              </Button>
            )}
          </div>
        )}

        <Separator />

        {/* ─── 8. Acciones ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {selectedPerson ? (
              <>Guardar en historial de <span className="text-foreground">{selectedPerson.name}</span></>
            ) : (
              <>Sin persona asociada todavía</>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleSubmit} disabled={saving || !personId}>
              {saving ? 'Guardando…' : 'Guardar captura'}
            </Button>
          </div>
        </div>

        {submitError && (
          <div className="text-xs text-red-400 text-right" role="alert">
            {submitError}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
