// Built-in manufacturer catalog: real models with I/O from published ranges.
// Every entry is flagged verified:false with a dataNote (approximate weight/power).
import type { ProductDefinition } from '../model'
import { AUDIO_CONSOLES } from './audio-consoles'
import { AUDIO_INSTALL } from './audio-install'
import { DISPLAYS_CONTROL } from './displays-control'
import { EXTRAS } from './extras'
import { LIGHTING } from './lighting'
import { MICS_COMMS } from './mics-comms'
import { NETWORK_POWER } from './network-power'
import { VIDEO } from './video'

export { CATALOG_NOTE } from './dsl'

/** All catalog products, de-duplicated by key (first definition wins). */
export const CATALOG_PRODUCTS: ProductDefinition[] = (() => {
  const seen = new Set<string>()
  const out: ProductDefinition[] = []
  for (const p of [...VIDEO, ...AUDIO_CONSOLES, ...AUDIO_INSTALL, ...MICS_COMMS, ...DISPLAYS_CONTROL, ...LIGHTING, ...NETWORK_POWER, ...EXTRAS]) {
    if (seen.has(p.key)) continue
    seen.add(p.key)
    out.push(p)
  }
  return out
})()
