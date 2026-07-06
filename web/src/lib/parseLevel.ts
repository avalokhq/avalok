const ERROR_RE = /\bERROR\b|\bERR\b|\bCRITICAL\b|\bCRIT\b|\bFATAL\b|\bEMERG(?:ENCY)?\b|\bALERT\b|\bSEVERE\b|\bPANIC\b/i
const WARN_RE = /\bWARN(?:ING)?\b|\bWRN\b|\bNOTICE\b|\bCAUTION\b/i
const DEBUG_RE = /\bDEBUG\b|\bDBG\b|\bTRACE\b|\bFINE(?:R|ST)?\b/i
const INFO_RE = /\bINFO\b|\bINF\b/i

const JSON_LEVEL_RE = /"(?:level|severity|log_level|loglevel|lvl)":\s*"([^"]+)"/i

export function parseLevel(line: string | undefined): string {
  if (!line) return 'info'

  const jsonMatch = line.match(JSON_LEVEL_RE)
  if (jsonMatch) {
    const lvl = jsonMatch[1].toLowerCase()
    if (/^(?:err(?:or)?|crit(?:ical)?|fatal|emerg(?:ency)?|alert|severe|panic)$/.test(lvl)) return 'error'
    if (/^(?:warn(?:ing)?|wrn|notice|caution)$/.test(lvl)) return 'warn'
    if (/^(?:debug|dbg|trace|fine[r]?|finest)$/.test(lvl)) return 'debug'
    return 'info'
  }

  if (ERROR_RE.test(line)) return 'error'
  if (WARN_RE.test(line)) return 'warn'
  if (DEBUG_RE.test(line)) return 'debug'
  if (INFO_RE.test(line)) return 'info'

  return 'info'
}
