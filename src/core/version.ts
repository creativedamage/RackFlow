/** Compares dotted versions: 1.10.0 > 1.9.3, v-prefix allowed, pre-release suffixes ignored. */
export function isNewerVersion(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0)
  return false
}
