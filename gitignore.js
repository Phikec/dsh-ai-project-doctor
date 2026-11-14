// Minimal .gitignore matcher (last matching rule wins, negation supported).
// Pure functions, no filesystem access.

function escapeRe(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\\/-]/g, '\\$&')
}

function globToRegex(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const atStart = i === 0 || glob[i - 1] === '/'
        const next = glob[i + 2]
        if (atStart && next === '/') { out += '(?:.*/)?'; i += 2 }
        else if (atStart && next === undefined) { out += '.*'; i += 1 }
        else { out += '[^/]*'; i += 1 }
      } else out += '[^/]*'
    } else if (c === '?') out += '[^/]'
    else if (c === '[') {
      const end = glob.indexOf(']', i + 2)
      if (end === -1) out += '\\['
      else {
        let cls = glob.slice(i + 1, end)
        if (cls[0] === '!') cls = '^' + cls.slice(1)
        out += `[${cls.replace(/\\/g, '\\\\')}]`
        i = end
      }
    } else if (c === '\\' && i + 1 < glob.length) out += escapeRe(glob[++i])
    else out += escapeRe(c)
  }
  return out
}

/** Parse .gitignore text into ordered rules. A leading BOM (common on Windows) is ignored. */
export function parseGitignore(text, base = '') {
  const rules = []
  for (const raw of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    let line = raw.replace(/\s+$/, '')
    if (!line || line.startsWith('#')) continue
    let negate = false
    if (line.startsWith('!')) { negate = true; line = line.slice(1) }
    else if (line.startsWith('\\#') || line.startsWith('\\!')) line = line.slice(1)
    let dirOnly = false
    if (line.endsWith('/')) { dirOnly = true; line = line.slice(0, -1) }
    if (!line) continue
    const anchored = line.includes('/')
    if (line.startsWith('/')) line = line.slice(1)
    let regex
    try { regex = new RegExp(anchored ? `^${globToRegex(line)}$` : `^(?:.*/)?${globToRegex(line)}$`) }
    catch { continue }
    rules.push({ base, regex, negate, dirOnly })
  }
  return rules
}

export function isIgnored(relPath, isDir, rules) {
  let ignored = false
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue
    let rel = relPath
    if (rule.base) {
      if (!relPath.startsWith(rule.base + '/')) continue
      rel = relPath.slice(rule.base.length + 1)
    }
    if (rule.regex.test(rel)) ignored = !rule.negate
  }
  return ignored
}
