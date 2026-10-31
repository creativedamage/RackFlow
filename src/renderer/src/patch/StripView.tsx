import { cellSpanMM, channelCenterMM, fittedFontPt, PT_PER_MM, type LabelCell, type LabelStripGeometry, type LabelStyle, fmtLen, fmtLenPair } from '@core/index'
import { DEFAULT_STYLE } from '@core/patchbay/patchbay'

/**
 * One designation strip drawn to scale as SVG, using the exact geometry and
 * font-fit maths of the print layout – what you see is what prints.
 */
export function StripView({ g, cells, style = DEFAULT_STYLE, pxPerMM = 2.5, dimensions, onCell, active }: {
  g: LabelStripGeometry
  cells?: Map<number, LabelCell>
  style?: LabelStyle
  pxPerMM?: number
  dimensions?: boolean
  onCell?: (channel: number) => void
  active?: number | null
}) {
  const w = g.stripWidthMM, h = g.stripHeightMM
  const pad = dimensions ? 10 : 0
  return (
    <svg className="strip" width={w * pxPerMM} height={(h + pad) * pxPerMM} viewBox={`0 0 ${w} ${h + pad}`}>
      <rect x={0} y={0} width={w} height={h} fill="#fff" stroke="#000" strokeWidth={0.15} />
      {Array.from({ length: Math.max(g.channelCount, 0) }, (_, i) => {
        const span = cellSpanMM(g, i)
        const cell = cells?.get(i + 1)
        let lines = (cell?.text ?? '').split('\n')
        if (style.showChannelNumbers) lines = [String(i + 1), ...lines]
        lines = lines.slice(0, g.linesPerCell + (style.showChannelNumbers ? 1 : 0))
        const pt = g.padTopMM ?? 0, pb = g.padBottomMM ?? 0
        const r = { w: span.width - 0.8, h: h - 0.8 - pt - pb }
        const size = fittedFontPt(lines, r, style) / PT_PER_MM
        const lh = size * 1.15
        const top = 0.4 + pt + (r.h - lh * lines.length) / 2 + size * 0.85
        const cx = span.x + span.width / 2
        return (
          <g key={i} className={`strip-cell ${onCell ? 'editable' : ''} ${active === i + 1 ? 'active' : ''}`} onClick={() => onCell?.(i + 1)}>
            <rect x={span.x} y={0} width={span.width} height={h} fill={cell?.fill ? `${cell.fill}33` : 'transparent'} />
            {style.cellDividers && i > 0 && <line x1={span.x} y1={0} x2={span.x} y2={h} stroke="#000" strokeWidth={0.08} />}
            <text fontFamily={style.fontFamily} fontWeight="bold" fontSize={size} textAnchor="middle" fill="#000">
              {lines.map((l, n) => {
                const est = l.length * 0.62 * size
                return <tspan key={n} x={cx} y={top + n * lh} {...(est > r.w ? { textLength: r.w, lengthAdjust: 'spacingAndGlyphs' } : {})}>{l}</tspan>
              })}
            </text>
            {cell?.manual && <circle cx={span.x + span.width - 0.9} cy={0.9} r={0.5} fill="#f08c00" />}
            <title>{`Ch ${i + 1}${cell?.text ? `: ${cell.text.replace(/\n/g, ' / ')}` : ''}${cell?.manual ? ' (manual)' : ''}`}</title>
          </g>
        )
      })}
      {dimensions && (
        <g className="dims">
          {Array.from({ length: g.channelCount }, (_, i) => {
            const x = channelCenterMM(g, i)
            return <line key={i} x1={x} y1={h + 0.5} x2={x} y2={h + 2.5} stroke="#3b82f6" strokeWidth={0.12} />
          })}
          <text x={0} y={h + 7.5} fontSize={3.4} fill="#3b82f6" fontFamily="ui-monospace, Menlo, monospace">
            {g.cellWidthsMM ? `${g.channelCount} ch · ${fmtLenPair(w, h, 2)}` : `first centre ${fmtLen(g.firstChannelCenterMM, 3)} · pitch ${fmtLen(g.channelPitchMM, 4)} · ${g.channelCount} ch · ${fmtLenPair(w, h, 2)}`}
          </text>
        </g>
      )}
    </svg>
  )
}
