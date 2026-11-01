import {
  defaultLedPrint, defaultPrintOptions, defaultRackPrint, defaultSchematic, groupsOf, layoutLabels, ledSheets, pagesToPrintHTML, rackElevationSheets,
  schematicSheets, sheetSize, sheetsToHTML, viewsOf,
} from '@core/index'
import { api } from './platform'
import { useStore } from './store'
import { lastSchematicOptions } from './print/SchematicPrint'
import { lastRackOptions } from './rack/RackPrint'
import { lastLedOptions } from './led/LedView'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** What Quick Print would print right now (shown on the button's tooltip). */
export function quickPrintTarget(): string {
  const s = useStore.getState(), p = s.project
  switch (s.mode) {
    case 'diagram': {
      if (s.diagramView) return `the “${viewsOf(p).find((v) => v.id === s.diagramView)?.name ?? 'view'}” view`
      if (s.diagramPage) return `the “${groupsOf(p).find((g) => g.id === s.diagramPage)?.name ?? 'page'}” page`
      return 'the wiring diagram'
    }
    case 'rack': return s.selectedRack ? `rack ${p.racks.find((r) => r.id === s.selectedRack)?.name ?? ''}` : 'the rack elevations'
    case 'patch': return s.selectedBay ? `patch bay ${p.patchBays.find((b) => b.id === s.selectedBay)?.name ?? ''} labels` : 'the patch bay labels'
    case 'led': return s.selectedLedWall ? `LED wall ${p.ledWalls?.find((w) => w.id === s.selectedLedWall)?.name ?? ''}` : 'the LED wall maps'
    case 'sheet': return `the ${document.querySelector('.schedule-tabs button.on')?.textContent?.trim() ?? 'schedule'} table`
    default: return 'this view'
  }
}

/** The on-screen schedule table (whatever tab, filter and sort is showing) as a printable page. */
function scheduleHTML(title: string): string | null {
  const grid = document.querySelector('.xsheet')
  if (!grid) return null
  const head = [...grid.querySelectorAll('.xsheet-head .xsheet-th')].map((x) => (x.textContent ?? '').replace(/[✎▴▾]/g, '').trim())
  const rows = [...grid.querySelectorAll('.xsheet-row:not(.xsheet-head)')].map((r) => [...r.querySelectorAll('.xsheet-td')].map((c) => (c.textContent ?? '').trim()))
  if (!rows.length) return null
  const p = useStore.getState().project
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page { size: 17in 11in; margin: 0.4in; }
    body { font: 9px -apple-system, Helvetica, Arial, sans-serif; color: #000; margin: 0; }
    h1 { font-size: 15px; margin: 0 0 2px; } .sub { color: #555; margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; } th, td { border: 0.6px solid #888; padding: 2px 4px; text-align: left; vertical-align: top; }
    th { background: #eee; font-size: 8px; text-transform: uppercase; } tr { break-inside: avoid; }
  </style></head><body><h1>${esc(p.info.name || 'Project')} – ${esc(title)}</h1>
    <div class="sub">${rows.length} rows · printed ${new Date().toLocaleDateString()}</div>
    <table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></body></html>`
}

/**
 * Quick Print (⌘P): straight to the print dialog with just what you're looking
 * at – the open diagram page or view, the selected rack, the selected patch
 * bay's labels, the selected LED wall, or the schedule table as shown – using
 * the settings last used in the full print dialog.
 */
export async function quickPrint() {
  const s = useStore.getState(), p = s.project
  const say = (msg: string) => s.notify(msg, { kind: 'info' })
  switch (s.mode) {
    case 'diagram': {
      if (!p.equipment.length) return say('Nothing to print yet')
      const base = lastSchematicOptions() ?? defaultSchematic(p)
      const o = s.diagramView ? { ...base, onlyView: s.diagramView }
        : s.diagramPage ? { ...base, split: 'group' as const, onlyPage: s.diagramPage }
        : { ...base, views: [] }
      const pages = schematicSheets(p, o)
      if (!pages.length) return say('This page has nothing on it to print')
      return api.print(sheetsToHTML(pages, sheetSize(o)))
    }
    case 'rack': {
      if (!p.racks.length) return say('No racks to print')
      const o = { ...(lastRackOptions() ?? defaultRackPrint()), ...(s.selectedRack ? { racks: [s.selectedRack] } : {}) }
      return api.print(sheetsToHTML(rackElevationSheets(p, o), sheetSize(o)))
    }
    case 'patch': {
      const bays = s.selectedBay ? p.patchBays.filter((b) => b.id === s.selectedBay) : p.patchBays
      if (!bays.length) return say('No patch bays to print')
      return api.print(pagesToPrintHTML(layoutLabels(bays, defaultPrintOptions())))
    }
    case 'led': {
      if (!p.ledWalls?.length) return say('No LED walls to print')
      const o = { ...(lastLedOptions() ?? defaultLedPrint()), walls: s.selectedLedWall ? [s.selectedLedWall] : undefined }
      return api.print(sheetsToHTML(ledSheets(p, o), sheetSize(o)))
    }
    case 'sheet': {
      const tab = document.querySelector('.schedule-tabs button.on')?.textContent?.trim() ?? 'Schedule'
      const html = scheduleHTML(tab)
      if (!html) return say('Nothing in this table to print')
      return api.print(html)
    }
  }
}
