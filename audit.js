import { readdir, readFile, stat, realpath } from 'node:fs/promises'
import path from 'node:path'
import { parseGitignore, isIgnored } from './gitignore.js'
import { MESSAGES, pickLanguage } from './messages.js'

export const DOCTOR_DIR = '.dsh-doctor'

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', 'target', DOCTOR_DIR])
const BUILD_DIRS = ['dist', 'build', 'out', '.next', '.nuxt']
const MAX_FILES_HARD_LIMIT = 5000
const DEFAULT_MAX_FILES = 1500
const MAX_CONFIG_BYTES = 1024 * 1024
const LARGE_FILE_BYTES = 25 * 1024 * 1024
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock']
const PY_MANIFESTS = ['requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'environment.yml']

// binary name -> npm package that provides it
const KNOWN_BINS = {
  vite: 'vite', webpack: 'webpack', tsc: 'typescript', eslint: 'eslint', jest: 'jest', vitest: 'vitest',
  electron: 'electron', 'electron-builder': 'electron-builder', next: 'next', nuxt: 'nuxt', nuxi: 'nuxt',
  rollup: 'rollup', esbuild: 'esbuild', prettier: 'prettier', mocha: 'mocha', playwright: '@playwright/test',
  tsx: 'tsx', 'ts-node': 'ts-node', nodemon: 'nodemon', tailwindcss: 'tailwindcss', astro: 'astro',
  'svelte-kit': '@sveltejs/kit', turbo: 'turbo', tsup: 'tsup', cypress: 'cypress', concurrently: 'concurrently',
  rimraf: 'rimraf', 'cross-env': 'cross-env', 'vue-tsc': 'vue-tsc', ng: '@angular/cli', parcel: 'parcel',
  stylelint: 'stylelint', biome: '@biomejs/biome', babel: '@babel/cli',
}
const RUNNERS_WITH_FILE = new Set(['node', 'tsx', 'ts-node', 'nodemon', 'electron', 'bun'])
const LANG_BY_EXT = {
  js: ['.js', '.jsx', '.mjs', '.cjs'], ts: ['.ts', '.tsx', '.mts', '.cts'], py: ['.py'], json: ['.json'],
  docs: ['.md', '.mdx', '.rst'], go: ['.go'], rs: ['.rs'], java: ['.java', '.kt'], cs: ['.cs'], cpp: ['.c', '.cc', '.cpp', '.h', '.hpp'],
}

const ENV_EXAMPLE = /\.(example|sample|template|dist|defaults?)$/i
export const isEnvFile = (name) => /^\.env(\..+)?$/i.test(name) && !ENV_EXAMPLE.test(name)
export const isSensitiveName = (name) =>
  !/\.(pub|example|sample)$/i.test(name) &&
  (/\.(pem|key|p12|pfx|keystore|jks)$/i.test(name) || /^id_(rsa|dsa|ecdsa|ed25519)$/i.test(name) ||
    /^(credentials|secrets?)\.(json|ya?ml)$/i.test(name) || /^service-?account.*\.json$/i.test(name))

function issue(severity, code, params = {}, file = '') {
  return { severity, code, params, file }
}

async function readTextIfSmall(filePath) {
  try {
    const info = await stat(filePath)
    if (!info.isFile() || info.size > MAX_CONFIG_BYTES) return null
    return await readFile(filePath, 'utf8')
  } catch { return null }
}

async function exists(filePath) {
  try { await stat(filePath); return true } catch { return false }
}

// Breadth-first walk: root files are always seen first. .gitignore files are honoured
// (ignored directories are pruned). Ignored env/key files are still reported, flagged as ignored.
async function collect(root, maxFiles, signal) {
  const files = []
  let counted = 0
  let truncated = false
  let rootRules = []
  const baseRules = []
  const exclude = await readTextIfSmall(path.join(root, '.git', 'info', 'exclude'))
  if (exclude) baseRules.push(...parseGitignore(exclude, ''))
  const queue = [{ rel: '', abs: root, rules: baseRules }]
  outer: for (let qi = 0; qi < queue.length; qi++) {
    signal?.throwIfAborted()
    const { rel, abs, rules: inherited } = queue[qi]
    let entries
    try { entries = await readdir(abs, { withFileTypes: true }) } catch { continue }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    let rules = inherited
    if (entries.some(e => e.name === '.gitignore' && e.isFile())) {
      const text = await readTextIfSmall(path.join(abs, '.gitignore'))
      if (text) rules = inherited.concat(parseGitignore(text, rel))
    }
    if (qi === 0) rootRules = rules
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (qi === 0 && entry.isDirectory() && entry.name === DOCTOR_DIR) continue
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const childAbs = path.join(abs, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || isIgnored(childRel, true, rules)) continue
        queue.push({ rel: childRel, abs: childAbs, rules })
      } else if (entry.isFile()) {
        const ignored = isIgnored(childRel, false, rules)
        const interesting = isEnvFile(entry.name) || isSensitiveName(entry.name)
        if (ignored && !interesting) continue
        if (!ignored && counted >= maxFiles) { truncated = true; break outer }
        let size = 0
        try { size = (await stat(childAbs)).size } catch { /* ignore */ }
        files.push({ path: childRel, size, ignored })
        if (!ignored) counted++
      }
    }
  }
  return { files, truncated, counted, rootRules }
}

// Split a shell command into simple commands and return [{ bin, args, viaNpx }].
function parseCommands(command) {
  const result = []
  for (const segment of command.split(/&&|\|\||;|\||&/)) {
    let tokens = segment.trim().split(/\s+/).filter(Boolean)
    let viaNpx = false
    for (;;) {
      if (!tokens.length) break
      const t = tokens[0]
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { tokens.shift(); continue }
      if (t === 'cross-env' || t === 'env') { tokens.shift(); continue }
      if (t === 'npx' || t === 'pnpx' || t === 'bunx') { viaNpx = true; tokens.shift(); while (tokens[0]?.startsWith('-')) tokens.shift(); continue }
      if ((t === 'pnpm' || t === 'yarn') && (tokens[1] === 'dlx')) { viaNpx = true; tokens = tokens.slice(2); continue }
      if ((t === 'pnpm' || t === 'npm' || t === 'yarn') && tokens[1] === 'exec') { tokens = tokens.slice(2); continue }
      break
    }
    if (tokens.length) result.push({ bin: tokens[0], args: tokens.slice(1), viaNpx })
  }
  return result
}

function detectStack(fileNames, deps, counts, pkg) {
  const stack = []
  if (pkg) stack.push('Node.js')
  if (counts.ts || fileNames.has('tsconfig.json') || deps.typescript) stack.push('TypeScript')
  for (const [dep, label] of [['electron', 'Electron'], ['react', 'React'], ['vue', 'Vue'], ['svelte', 'Svelte'], ['next', 'Next.js'], ['vite', 'Vite'], ['express', 'Express'], ['@deepseek-ai/dsh-tools', 'DSH plugin']]) {
    if (deps[dep]) stack.push(label)
  }
  if (counts.py) stack.push('Python')
  if (counts.go || fileNames.has('go.mod')) stack.push('Go')
  if (counts.rs || fileNames.has('Cargo.toml')) stack.push('Rust')
  if (counts.java) stack.push('Java/Kotlin')
  if (counts.cs) stack.push('C#')
  return stack
}

export async function runAudit(projectPath, options = {}) {
  const { maxFiles: requestedMaxFiles = DEFAULT_MAX_FILES, language = 'en', signal } = options
  if (typeof projectPath !== 'string' || !path.isAbsolute(projectPath)) {
    throw new Error('projectPath must be an absolute directory path.')
  }
  const root = await realpath(projectPath)
  const rootInfo = await stat(root)
  if (!rootInfo.isDirectory()) throw new Error('The supplied path is not a directory.')

  const maxFiles = Math.min(MAX_FILES_HARD_LIMIT, Math.max(50, Math.floor(Number(requestedMaxFiles) || DEFAULT_MAX_FILES)))
  const rootEntries = await readdir(root, { withFileTypes: true })
  const rootNames = new Set(rootEntries.map(e => e.name))
  const rootDirs = rootEntries.filter(e => e.isDirectory()).map(e => e.name).filter(n => n !== DOCTOR_DIR).sort()
  const { files, truncated, counted, rootRules: rules } = await collect(root, maxFiles, signal)
  const live = files.filter(f => !f.ignored)
  const issues = []
  const counts = { total: counted, js: 0, ts: 0, py: 0, json: 0, docs: 0, go: 0, rs: 0, java: 0, cs: 0, cpp: 0 }

  for (const file of live) {
    const ext = path.extname(file.path).toLowerCase()
    for (const [key, exts] of Object.entries(LANG_BY_EXT)) if (exts.includes(ext)) counts[key]++
  }

  // package.json
  let packageJson = null
  if (rootNames.has('package.json')) {
    const text = await readTextIfSmall(path.join(root, 'package.json'))
    if (text === null) issues.push(issue('warning', 'PACKAGE_TOO_LARGE', {}, 'package.json'))
    else {
      try { packageJson = JSON.parse(text.replace(/^\uFEFF/, '')) }
      catch { issues.push(issue('error', 'INVALID_PACKAGE_JSON', {}, 'package.json')) }
    }
  }
  if (packageJson && (typeof packageJson !== 'object' || Array.isArray(packageJson))) packageJson = null

  // README / LICENSE (case-insensitive, any extension)
  const lowerNames = [...rootNames].map(n => n.toLowerCase())
  if (!lowerNames.some(n => /^readme(\.[a-z]+)?$/.test(n))) issues.push(issue('info', 'README_MISSING'))
  const hasLicenseFile = lowerNames.some(n => /^(license|licence|copying)(\.[a-z]+)?$/.test(n))

  // .gitignore and secrets
  const hasGitignore = rootNames.has('.gitignore')
  if (!hasGitignore) issues.push(issue('warning', 'GITIGNORE_MISSING'))
  const exposedEnv = files.filter(f => !f.ignored && isEnvFile(path.basename(f.path))).map(f => f.path)
  if (exposedEnv.length) issues.push(issue('warning', 'ENV_NOT_IGNORED', { files: exposedEnv.slice(0, 5) }))
  const exposedSecrets = files.filter(f => !f.ignored && isSensitiveName(path.basename(f.path))).map(f => f.path)
  if (exposedSecrets.length) issues.push(issue('warning', 'SENSITIVE_FILE', { files: exposedSecrets.slice(0, 5) }))
  if (hasGitignore && packageJson && rootNames.has('package.json') && !isIgnored('node_modules', true, rules)) {
    issues.push(issue('warning', 'NODE_MODULES_NOT_IGNORED', {}, '.gitignore'))
  }
  if (hasGitignore) {
    const unignored = BUILD_DIRS.filter(d => rootDirs.includes(d) && !isIgnored(d, true, rules))
    if (unignored.length) issues.push(issue('info', 'BUILD_NOT_IGNORED', { dirs: unignored }, '.gitignore'))
  }
  const large = live.filter(f => f.size > LARGE_FILE_BYTES).sort((a, b) => b.size - a.size)
  if (large.length) issues.push(issue('warning', 'LARGE_FILE', { limitMb: LARGE_FILE_BYTES / 1024 / 1024, files: large.slice(0, 3).map(f => `${f.path} (${Math.round(f.size / 1024 / 1024)} MB)`) }))

  let deps = {}
  if (packageJson) {
    const dependencies = packageJson.dependencies && typeof packageJson.dependencies === 'object' ? packageJson.dependencies : {}
    const devDependencies = packageJson.devDependencies && typeof packageJson.devDependencies === 'object' ? packageJson.devDependencies : {}
    const peer = packageJson.peerDependencies && typeof packageJson.peerDependencies === 'object' ? packageJson.peerDependencies : {}
    const optional = packageJson.optionalDependencies && typeof packageJson.optionalDependencies === 'object' ? packageJson.optionalDependencies : {}
    deps = { ...peer, ...optional, ...dependencies, ...devDependencies }
    const scripts = packageJson.scripts && typeof packageJson.scripts === 'object' ? packageJson.scripts : {}
    const isWorkspace = Boolean(packageJson.workspaces)
    const isPrivate = packageJson.private === true

    if (!packageJson.name) issues.push(issue('info', 'PACKAGE_NAME_MISSING', {}, 'package.json'))
    if (Object.keys(scripts).length === 0) issues.push(issue('info', 'SCRIPTS_MISSING', {}, 'package.json'))
    else if (!scripts.test || /no test specified/i.test(String(scripts.test))) {
      issues.push(issue('info', 'TEST_SCRIPT_MISSING', {}, 'package.json'))
    }

    // scripts: undeclared tools and missing files
    const seen = new Set()
    for (const [scriptName, command] of Object.entries(scripts)) {
      if (typeof command !== 'string') continue
      for (const { bin, args, viaNpx } of parseCommands(command)) {
        const binPackage = KNOWN_BINS[bin]
        if (binPackage && !viaNpx && !isWorkspace && !deps[binPackage] && !deps[bin] && !seen.has(bin)) {
          seen.add(bin)
          issues.push(issue('warning', 'SCRIPT_DEPENDENCY_MISSING', { script: scriptName, bin, pkg: binPackage }, 'package.json'))
        }
        if (RUNNERS_WITH_FILE.has(bin)) {
          const target = args.find(a => !a.startsWith('-'))
          if (target && !/[*$%`<>{}]/.test(target) && /\.(c|m)?[jt]sx?$/.test(target)) {
            const resolved = path.resolve(root, target)
            if (resolved.startsWith(root + path.sep) && !(await exists(resolved))) {
              issues.push(issue('warning', 'SCRIPT_FILE_MISSING', { script: scriptName, target }, 'package.json'))
            }
          }
        }
      }
    }

    // declared entry points
    const entries = []
    if (typeof packageJson.main === 'string') entries.push(['main', packageJson.main])
    if (typeof packageJson.bin === 'string') entries.push(['bin', packageJson.bin])
    else if (packageJson.bin && typeof packageJson.bin === 'object') for (const v of Object.values(packageJson.bin)) if (typeof v === 'string') entries.push(['bin', v])
    for (const [field, target] of entries) {
      const resolved = path.resolve(root, target)
      if (resolved.startsWith(root + path.sep) && !(await exists(resolved))) {
        issues.push(issue('warning', 'ENTRY_MISSING', { field, target, built: /^\.?\/?(dist|build|lib|out)\//.test(target) }, 'package.json'))
      }
    }

    // dependencies hygiene
    const loose = Object.entries({ ...dependencies, ...devDependencies }).filter(([, value]) => typeof value === 'string' && /^(\*|latest|)$/.test(value.trim())).map(([key]) => key)
    if (loose.length) issues.push(issue('warning', 'LOOSE_DEPENDENCY_VERSION', { names: loose.slice(0, 8) }, 'package.json'))
    const duplicated = Object.keys(dependencies).filter(key => key in devDependencies)
    if (duplicated.length) issues.push(issue('warning', 'DUPLICATE_DEPENDENCY', { names: duplicated.slice(0, 8) }, 'package.json'))

    const lockfiles = LOCKFILES.filter(f => rootNames.has(f))
    if (lockfiles.length > 1) issues.push(issue('warning', 'MULTIPLE_LOCKFILES', { files: lockfiles }))
    const manager = typeof packageJson.packageManager === 'string' ? packageJson.packageManager : ''
    if (manager && lockfiles.length) {
      const expected = manager.startsWith('pnpm') ? 'pnpm-lock.yaml' : manager.startsWith('yarn') ? 'yarn.lock' : manager.startsWith('bun') ? (rootNames.has('bun.lock') ? 'bun.lock' : 'bun.lockb') : manager.startsWith('npm') ? 'package-lock.json' : null
      if (expected && !rootNames.has(expected)) issues.push(issue('warning', 'LOCKFILE_MISMATCH', { manager, expected }))
    }
    if (!lockfiles.length && !isWorkspace && (Object.keys(dependencies).length + Object.keys(devDependencies).length) > 0) issues.push(issue('info', 'LOCKFILE_MISSING'))
    if (!isPrivate && !packageJson.engines) issues.push(issue('info', 'ENGINES_MISSING', {}, 'package.json'))
    if (!isPrivate && !packageJson.license && !hasLicenseFile) issues.push(issue('info', 'LICENSE_MISSING', {}, 'package.json'))
  }

  if (counts.py > 0 && !PY_MANIFESTS.some(f => rootNames.has(f))) issues.push(issue('info', 'PY_MANIFEST_MISSING'))

  if (rootNames.has('tsconfig.json')) {
    const text = await readTextIfSmall(path.join(root, 'tsconfig.json'))
    if (text !== null) {
      try {
        JSON.parse(text.replace(/^\uFEFF/, '').replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/.*$/gm, (m, str) => str || '').replace(/,\s*([}\]])/g, '$1'))
      } catch { issues.push(issue('warning', 'TSCONFIG_PARSE', {}, 'tsconfig.json')) }
    }
  }

  if (truncated) issues.push(issue('info', 'SCAN_TRUNCATED', { count: counted, hard: MAX_FILES_HARD_LIMIT }))
  if (issues.length === 0) issues.push(issue('info', 'NO_COMMON_ISSUES'))

  const rank = { error: 0, warning: 1, info: 2 }
  issues.sort((a, b) => rank[a.severity] - rank[b.severity])
  const tally = (s) => issues.filter(x => x.severity === s).length
  const realIssues = issues.filter(x => x.code !== 'NO_COMMON_ISSUES' && x.code !== 'SCAN_TRUNCATED')
  const score = Math.max(0, 100 - realIssues.filter(x => x.severity === 'error').length * 25 - realIssues.filter(x => x.severity === 'warning').length * 8 - realIssues.filter(x => x.severity === 'info').length * 2)
  const stack = detectStack(rootNames, deps, counts, packageJson)

  const catalog = MESSAGES[pickLanguage(language)]
  const rendered = issues.map(x => {
    const [title, detail] = (catalog.issues[x.code] || (() => [x.code, '']))(x.params)
    return { severity: x.severity, code: x.code, title, detail, file: x.file }
  })
  return {
    root,
    language: pickLanguage(language),
    counts,
    truncated,
    score,
    stack,
    rootDirs,
    errors: tally('error'),
    warnings: tally('warning'),
    notes: tally('info'),
    issues: rendered,
    packageManager: (() => {
      if (!packageJson) return null
      if (typeof packageJson.packageManager === 'string') return packageJson.packageManager.split('@')[0]
      const found = LOCKFILES.filter(f => rootNames.has(f))
      if (found.includes('pnpm-lock.yaml')) return 'pnpm'
      if (found.includes('yarn.lock')) return 'yarn'
      if (found.some(f => f.startsWith('bun'))) return 'bun'
      if (found.includes('package-lock.json')) return 'npm'
      return null
    })(),
  }
}

export function formatReport(result) {
  const ui = MESSAGES[result.language].ui
  const c = result.counts
  const lines = [
    '# AI Project Doctor', '',
    `**${ui.project}:** ${result.root}`, '',
    `**${ui.files}:** ${c.total}${result.truncated ? ` (${ui.truncated})` : ''}`, '',
    `**${ui.score}:** ${result.score}/100`, '',
    `**${ui.stack}:** ${result.stack.length ? result.stack.join(', ') : ui.none}`, '',
    `**${ui.inventory}:** ${c.js} JS · ${c.ts} TS · ${c.py} Python · ${c.json} JSON · ${c.docs} ${ui.docsWord}`, '',
    `**${ui.topLevel}:** ${result.rootDirs.length ? result.rootDirs.slice(0, 15).map(d => d + '/').join(' ') : ui.none}`, '',
    `**${ui.findings}:** ${result.issues.length} (${result.errors} ${ui.errors}, ${result.warnings} ${ui.warnings}, ${result.notes} ${ui.notes})`, '',
  ]
  lines.push(result.issues.map((x, i) => `${i + 1}. **[${x.severity.toUpperCase()}] ${x.title}**${x.file ? ` — \`${x.file}\`` : ''}\n   ${x.detail}\n   Code: \`${x.code}\``).join('\n\n'))
  lines.push('', '---', ui.footer)
  return lines.join('\n')
}

// Backwards-compatible entry point: returns the Markdown (or JSON) report.
export async function auditProject(projectPath, requestedMaxFiles = DEFAULT_MAX_FILES, options = {}) {
  const result = await runAudit(projectPath, { ...options, maxFiles: requestedMaxFiles })
  return options.format === 'json' ? JSON.stringify(result, null, 2) : formatReport(result)
}
