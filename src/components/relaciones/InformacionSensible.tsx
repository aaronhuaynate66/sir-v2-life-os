'use client'
// SIR V2 — Información sensible / datos adicionales (colapsable, al fondo de la
// ficha). Documento (DNI), pasaporte y foto del documento de la persona, para
// tenerlos a mano. Colapsado por defecto y marcado como sensible.
//
// - Carga lazy (al abrir) via /api/person-sensitive (RLS). Tolerante: si la
//   tabla/bucket aún no existen, muestra el form vacío (no rompe la ficha).
// - La foto va a un bucket PRIVADO (person-documents), se ve via URL firmada.
// - Estos datos NO van a IA/embeddings/grafo/summaries (por diseño: nadie más
//   los lee).

import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { ShieldAlert, ChevronDown, Loader2, Upload, ImageIcon, Eye, ScanLine } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  getSensitiveData,
  saveSensitiveData,
  uploadDocumentPhoto,
  getDocumentPhotoUrl,
} from '@/lib/person-sensitive/client'
import { extractDocument } from '@/lib/capture/document/client'

export interface InformacionSensibleProps {
  personId: string
}

export function InformacionSensible({ personId }: InformacionSensibleProps) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [scanning, setScanning] = useState(false)

  const [documentoTipo, setDocumentoTipo] = useState('')
  const [documentoNumero, setDocumentoNumero] = useState('')
  const [pasaporteNumero, setPasaporteNumero] = useState('')
  const [pasaporteVencimiento, setPasaporteVencimiento] = useState('')
  const [fotoPath, setFotoPath] = useState<string | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await getSensitiveData(personId)
      setDocumentoTipo(d.documentoTipo ?? '')
      setDocumentoNumero(d.documentoNumero ?? '')
      setPasaporteNumero(d.pasaporteNumero ?? '')
      setPasaporteVencimiento(d.pasaporteVencimiento ?? '')
      setFotoPath(d.fotoDocumentoPath ?? null)
      setLoaded(true)
    } catch {
      // Tolerante: form vacío (tabla pendiente, etc.).
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [personId])

  const toggle = useCallback(() => {
    const next = !open
    setOpen(next)
    if (next && !loaded) void load()
  }, [open, loaded, load])

  const onPickPhoto = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const path = await uploadDocumentPhoto(personId, file)
        setFotoPath(path)
        setFotoUrl(null) // se regenera con "Ver"
        await saveSensitiveData(personId, { fotoDocumentoPath: path })
        toast.success('Foto del documento guardada')
      } catch (err) {
        toast.error('No se pudo subir la foto', {
          description: err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : undefined,
        })
      } finally {
        setUploading(false)
        if (e.target) e.target.value = ''
      }
    },
    [personId],
  )

  // Capturar documento: sube la foto al bucket privado + extrae los campos por
  // visión (extracción puntual permitida) + autocompleta + guarda. Si la
  // extracción falla, igual queda la foto guardada (no se pierde el upload).
  const onScanDocument = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (e.target) e.target.value = ''
      if (!file) return
      setScanning(true)
      try {
        // 1. Subir la foto original al bucket privado (queda en el documento).
        const path = await uploadDocumentPhoto(personId, file)
        setFotoPath(path)
        setFotoUrl(null)
        // 2. Extraer los campos por visión.
        const ex = await extractDocument(file)
        // 3. Autocompletar SOLO lo que el modelo leyó (no pisa lo ya cargado).
        const tipo = ex.documentoTipo ?? documentoTipo
        const dni = ex.documentoNumero ?? documentoNumero
        const pasNum = ex.pasaporteNumero ?? pasaporteNumero
        const pasVenc = ex.pasaporteVencimiento ?? pasaporteVencimiento
        setDocumentoTipo(tipo)
        setDocumentoNumero(dni)
        setPasaporteNumero(pasNum)
        setPasaporteVencimiento(pasVenc)
        // 4. Persistir (foto + campos leídos).
        await saveSensitiveData(personId, {
          documentoTipo: tipo.trim() || undefined,
          documentoNumero: dni.trim() || undefined,
          pasaporteNumero: pasNum.trim() || undefined,
          pasaporteVencimiento: pasVenc || undefined,
          fotoDocumentoPath: path,
        })
        toast.success('Documento leído y guardado', { description: 'Revisá los datos y corregí si hace falta.' })
      } catch (err) {
        toast.error('No se pudo leer el documento', {
          description: err instanceof Error ? err.message : 'La foto quedó guardada; podés cargar los datos a mano.',
        })
      } finally {
        setScanning(false)
      }
    },
    [personId, documentoTipo, documentoNumero, pasaporteNumero, pasaporteVencimiento],
  )

  const viewPhoto = useCallback(async () => {
    if (!fotoPath) return
    const url = await getDocumentPhotoUrl(fotoPath)
    if (url) {
      setFotoUrl(url)
      window.open(url, '_blank', 'noopener,noreferrer')
    } else {
      toast.error('No se pudo abrir la imagen')
    }
  }, [fotoPath])

  const save = useCallback(async () => {
    setSaving(true)
    try {
      await saveSensitiveData(personId, {
        documentoTipo: documentoTipo.trim() || undefined,
        documentoNumero: documentoNumero.trim() || undefined,
        pasaporteNumero: pasaporteNumero.trim() || undefined,
        pasaporteVencimiento: pasaporteVencimiento || undefined,
        fotoDocumentoPath: fotoPath,
      })
      toast.success('Datos guardados')
    } catch (err) {
      toast.error('No se pudo guardar', {
        description: err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : undefined,
      })
    } finally {
      setSaving(false)
    }
  }, [personId, documentoTipo, documentoNumero, pasaporteNumero, pasaporteVencimiento, fotoPath])

  return (
    <Card className="shadow-none mb-4 border-warn/20">
      <CardContent className="p-4 sm:p-6">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} strokeWidth={1.75} className="text-warn/80" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Información sensible · datos adicionales
            </div>
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn('text-muted-foreground/60 transition-transform group-hover:text-foreground', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="mt-4">
            <p className="text-[11px] text-warn/80 bg-warn-soft border border-warn/20 rounded-md p-2.5 mb-4 leading-relaxed">
              Datos privados (documento, pasaporte). Se guardan cifrados en reposo por Supabase, con
              acceso solo tuyo (RLS), y <span className="font-medium">no</span> se usan en IA, grafo ni resúmenes.
            </p>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 size={14} className="animate-spin" /> Cargando…
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="sd-doc-tipo" className="text-xs">Tipo de documento</Label>
                    <Input id="sd-doc-tipo" value={documentoTipo} onChange={(e) => setDocumentoTipo(e.target.value)}
                      placeholder="DNI / CE / …" disabled={saving} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="sd-doc-num" className="text-xs">N° de documento</Label>
                    <Input id="sd-doc-num" value={documentoNumero} onChange={(e) => setDocumentoNumero(e.target.value)}
                      placeholder="12345678" disabled={saving} className="mt-1 font-mono" />
                  </div>
                  <div>
                    <Label htmlFor="sd-pass-num" className="text-xs">N° de pasaporte</Label>
                    <Input id="sd-pass-num" value={pasaporteNumero} onChange={(e) => setPasaporteNumero(e.target.value)}
                      placeholder="P1234567" disabled={saving} className="mt-1 font-mono" />
                  </div>
                  <div>
                    <Label htmlFor="sd-pass-venc" className="text-xs">Vencimiento pasaporte</Label>
                    <Input id="sd-pass-venc" type="date" value={pasaporteVencimiento} onChange={(e) => setPasaporteVencimiento(e.target.value)}
                      disabled={saving} className="mt-1 font-mono" />
                  </div>
                </div>

                {/* Foto del documento (bucket privado) + lectura por IA. */}
                <div className="rounded-md border border-border/50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ImageIcon size={13} strokeWidth={1.75} aria-hidden="true" />
                    Foto del documento / pasaporte
                    {fotoPath && <span className="text-ok">· cargada</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
                    Subí una foto del DNI o pasaporte y la leo para autocompletar los campos de arriba
                    (extracción puntual; la imagen queda en tu almacenamiento privado).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Primario: leer documento (sube + extrae + autocompleta). */}
                    <label className={cn(
                      'inline-flex items-center gap-1.5 text-xs rounded-md border border-accent/40 bg-accent/10 text-foreground px-2.5 py-1.5 cursor-pointer hover:bg-accent/20',
                      (scanning || uploading) && 'opacity-50 pointer-events-none',
                    )}>
                      {scanning ? <Loader2 size={13} className="animate-spin" /> : <ScanLine size={13} strokeWidth={1.75} aria-hidden="true" />}
                      {scanning ? 'Leyendo…' : 'Leer documento (IA)'}
                      <input type="file" accept="image/*" onChange={onScanDocument} disabled={scanning || uploading} className="hidden" />
                    </label>
                    {/* Secundario: subir foto sin leer. */}
                    <label className={cn(
                      'inline-flex items-center gap-1.5 text-xs rounded-md border border-border px-2.5 py-1.5 cursor-pointer hover:bg-accent/5',
                      (uploading || scanning) && 'opacity-50 pointer-events-none',
                    )}>
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} strokeWidth={1.75} aria-hidden="true" />}
                      {fotoPath ? 'Reemplazar foto' : 'Subir sin leer'}
                      <input type="file" accept="image/*" onChange={onPickPhoto} disabled={uploading || scanning} className="hidden" />
                    </label>
                    {fotoPath && (
                      <Button type="button" size="sm" variant="ghost" onClick={viewPhoto}>
                        <Eye size={13} strokeWidth={1.75} className="mr-1" /> Ver
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button size="sm" onClick={save} disabled={saving}>
                    {saving ? <><Loader2 size={13} className="animate-spin mr-1.5" />Guardando…</> : 'Guardar datos'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
