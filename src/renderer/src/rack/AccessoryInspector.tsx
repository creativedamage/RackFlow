import { ACCESSORY_KEYS, ACCESSORY_KINDS, canHaveLogo, newId, type LogoAsset, type Rack, type RackAccessory } from '@core/index'
import { useStore } from '../store'
import { Field, Select, TextInput } from '../components/ui'

const MAX_LOGO_BYTES = 2_000_000
const NO_LOGOS: LogoAsset[] = []

/** Reads an image file as a data: URL, refusing very large files. */
/**
 * Is this light / white artwork on a transparent background? (Such logos are
 * printed black on drawings so they don't vanish on white paper.)
 */
export function isLightLogo(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 64; c.height = 64
        const g = c.getContext('2d', { willReadFrequently: true })
        if (!g) return resolve(false)
        const k = Math.min(64 / (img.width || 64), 64 / (img.height || 64))
        g.drawImage(img, 0, 0, (img.width || 64) * k, (img.height || 64) * k)
        const d = g.getImageData(0, 0, 64, 64).data
        let ink = 0, lum = 0, clear = 0
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 40) { clear++; continue }
          ink++; lum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
        }
        resolve(ink > 0 && clear / (d.length / 4) > 0.08 && lum / ink > 0.78)
      } catch { resolve(false) }
    }
    img.onerror = () => resolve(false)
    img.src = dataUrl
  })
}

export function pickImage(): Promise<{ name: string; dataUrl: string; light?: boolean } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp'
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      if (f.size > MAX_LOGO_BYTES) { useStore.getState().notify('That image is over 2 MB – use a smaller PNG or SVG', { kind: 'warning' }); return resolve(null) }
      const r = new FileReader()
      r.onload = () => { const dataUrl = String(r.result); void isLightLogo(dataUrl).then((light) => resolve({ name: f.name.replace(/\.[^.]+$/, ''), dataUrl, light: light || undefined })) }
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
  const asset: LogoAsset = { id: newId(), name: img.name, dataUrl: img.dataUrl, light: img.light }
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
      {canHaveLogo(acc.kind) && (<>
        <h4>Logo</h4>
        {logo ? <div className={`logo-preview finish-${acc.finish ?? 'black'}`}><img src={logo.dataUrl} alt={logo.name} /></div> : <p className="muted small">No logo on this panel. Upload one, or pick one you've already added.</p>}
        <Field label="Image">
          <Select value={acc.logoId ?? ''} onChange={(v) => upd('Panel Logo', (a) => { a.logoId = v || undefined })} options={[{ value: '', label: 'None' }, ...logos.map((l) => ({ value: l.id, label: l.name }))]} />
        </Field>
        <div className="row" style={{ display: 'flex', gap: 6 }}>
          <button className="primary" onClick={async () => { const id = await uploadLogo(); if (id) upd('Panel Logo', (a) => { a.logoId = id }) }}>Upload Logo…</button>
          {logo && <button onClick={() => upd('Remove Logo', (a) => { delete a.logoId })}>Remove</button>}
        </div>
        <Field label="Panel finish"><Select value={acc.finish ?? 'black'} onChange={(v) => upd('Panel Finish', (a) => { a.finish = v })} options={[{ value: 'black', label: 'Black' }, { value: 'white', label: 'White' }, { value: 'silver', label: 'Silver' }]} /></Field>
        <p className="muted small">PNG with a transparent background or SVG works best. The logo is stored in the project file.</p>
      </>)}
      <button className="danger" onClick={() => { apply(`Remove ${meta.name}`, (d) => { const r = d.racks.find((x) => x.id === rack.id); if (r) r.accessories = r.accessories.filter((a) => a.id !== acc.id) }); useStore.getState().set({ selectedAccessory: null }) }}>Remove Panel</button>
    </div>
  )
}
