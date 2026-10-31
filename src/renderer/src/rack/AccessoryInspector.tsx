import { ACCESSORY_KEYS, ACCESSORY_KINDS, newId, type LogoAsset, type Rack, type RackAccessory } from '@core/index'
import { useStore } from '../store'
import { Field, Select, TextInput } from '../components/ui'

const MAX_LOGO_BYTES = 2_000_000
const NO_LOGOS: LogoAsset[] = []

/** Reads an image file as a data: URL, refusing very large files. */
export function pickImage(): Promise<{ name: string; dataUrl: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp'
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      if (f.size > MAX_LOGO_BYTES) { useStore.getState().notify('That image is over 2 MB – use a smaller PNG or SVG', { kind: 'warning' }); return resolve(null) }
      const r = new FileReader()
      r.onload = () => resolve({ name: f.name.replace(/\.[^.]+$/, ''), dataUrl: String(r.result) })
      r.onerror = () => resolve(null)
      r.readAsDataURL(f)
    }
    input.click()
  })
}

/** Adds an image to the project's logo library and returns its id. */
export async function uploadLogo(): Promise<string | null> {
  const img = await pickImage()
  if (!img) return null
  const asset: LogoAsset = { id: newId(), name: img.name, dataUrl: img.dataUrl }
  useStore.getState().apply('Add Logo', (d) => { d.logos = [...(d.logos ?? []), asset] })
  return asset.id
}

export function AccessoryInspector({ rack, acc }: { rack: Rack; acc: RackAccessory }) {
  const apply = useStore((s) => s.apply)
  // Select the stored array itself (a fresh [] every render would loop forever).
  const stored = useStore((s) => s.project.logos)
  const logos = stored ?? NO_LOGOS
  const meta = ACCESSORY_KINDS[acc.kind]
  const upd = (label: string, fn: (a: RackAccessory) => void) => apply(label, (d) => { const a = d.racks.find((r) => r.id === rack.id)?.accessories.find((x) => x.id === acc.id); if (a) fn(a) })
  const logo = logos.find((l) => l.id === acc.logoId)
  return (
    <div className="form">
      <h3>{meta.name}</h3>
      <p className="muted">{rack.name} · U{acc.startUnit}{acc.height > 1 ? `–U${acc.startUnit + acc.height - 1}` : ''} · {acc.face}</p>
      <Field label="Type"><Select value={acc.kind} onChange={(k) => upd('Panel Type', (a) => { a.kind = k; if (!ACCESSORY_KINDS[k].heights.includes(a.height)) a.height = ACCESSORY_KINDS[k].heights[0] })} options={ACCESSORY_KEYS.map((k) => ({ value: k, label: ACCESSORY_KINDS[k].name }))} /></Field>
      <Field label="Height"><Select value={acc.height} onChange={(h) => upd('Panel Height', (a) => { a.height = h })} options={meta.heights.map((h) => ({ value: h, label: `${h}U` }))} /></Field>
      <Field label="Label" hint="Text shown on printed elevations"><TextInput value={acc.label ?? ''} placeholder={meta.label || 'none'} onCommit={(v) => upd('Panel Label', (a) => { a.label = v.trim() || undefined })} /></Field>
      {acc.kind === 'logo' && (<>
        <h4>Logo</h4>
        {logo ? <div className={`logo-preview finish-${acc.finish ?? 'black'}`}><img src={logo.dataUrl} alt={logo.name} /></div> : <p className="muted small">No image yet.</p>}
        <Field label="Image">
          <Select value={acc.logoId ?? ''} onChange={(v) => upd('Panel Logo', (a) => { a.logoId = v || undefined })} options={[{ value: '', label: 'None' }, ...logos.map((l) => ({ value: l.id, label: l.name }))]} />
        </Field>
        <button onClick={async () => { const id = await uploadLogo(); if (id) upd('Panel Logo', (a) => { a.logoId = id }) }}>Upload Image…</button>
        <Field label="Panel finish"><Select value={acc.finish ?? 'black'} onChange={(v) => upd('Panel Finish', (a) => { a.finish = v })} options={[{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }, { value: 'silver', label: 'Silver' }]} /></Field>
        <p className="muted small">PNG with a transparent background or SVG works best. The logo is stored in the project file.</p>
      </>)}
      <button className="danger" onClick={() => { apply(`Remove ${meta.name}`, (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.accessories = r.accessories.filter((a) => a.id !== acc.id) }); useStore.getState().set({ selectedAccessory: null }) }}>Remove Panel</button>
    </div>
  )
}
