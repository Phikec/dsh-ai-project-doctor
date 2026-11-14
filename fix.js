// Safe, reversible fixes. Every change is written inside the project and copied to
// .dsh-doctor/backups/<id>/ first, so one call can undo a whole session.
import { copyFile, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { DOCTOR_DIR, runAudit } from './audit.js'
import { MESSAGES, pickLanguage, fixText } from './messages.js'

/** Fix ids in the order they are applied. */
export const FIX_ORDER = ['package-name', 'engines', 'test-script', 'gitignore', 'readme', 'license']

const MAX_BACKUPS = 20
const BACKUPS = 'backups'
const MANIFEST = 'manifest.json'

const GITIGNORE_BASE = ['node_modules/', 'dist/', 'build/', 'out/', '.env*', '!.env.example', '*.log', '.dsh-doctor/']

/** Issue codes each fix addresses, for planning and for the panel. */
const FIX_CODES = {
  gitignore: ['GITIGNORE_MISSING', 'ENV_NOT_IGNORED', 'NODE_MODULES_NOT_IGNORED', 'BUILD_NOT_IGNORED'],
  readme: ['README_MISSING'],
  license: ['LICENSE_MISSING'],
  engines: ['ENGINES_MISSING'],
  'test-script': ['TEST_SCRIPT_MISSING'],
  'package-name': ['PACKAGE_NAME_MISSING'],
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/** Localized, ordered fix plan for one report. */
export function planFixes(report) {
  const language = pickLanguage(report?.language)
  const codes = new Set((report?.issues || []).map(issue => issue.code))
  const plan = []
  for (const id of FIX_ORDER) {
    if (!FIX_CODES[id].some(code => codes.has(code))) continue
    const [title, detail] = fixText(language, id)
    plan.push({ id, title, detail, codes: FIX_CODES[id].filter(code => codes.has(code)) })
  }
  return plan
}

/** Reject ids the engine does not implement. */
export function normalizeFixIds(ids) {
  const requested = Array.isArray(ids) ? ids : typeof ids === 'string' ? ids.split(',') : []
  const clean = []
  for (const raw of requested) {
    const id = String(raw || '').trim()
    if (!id) continue
    if (!FIX_ORDER.includes(id)) throw new Error(`Unknown fix id "${id}". Known ids: ${FIX_ORDER.join(', ')}.`)
    if (!clean.includes(id)) clean.push(id)
  }
  return FIX_ORDER.filter(id => clean.includes(id))
}

async function pathExists(target) {
  try { await stat(target); return true } catch { return false }
}

function inside(root, target) {
  const resolved = path.resolve(target)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Refusing to write outside the project: ${resolved}`)
  }
  return resolved
}

async function readJson(root) {
  const file = path.join(root, 'package.json')
  if (!(await pathExists(file))) return undefined
  const text = await readFile(file, 'utf8')
  try {
    return { file, text, value: JSON.parse(text.replace(/^\uFEFF/, '')) }
  } catch {
    return { file, text, value: undefined }
  }
}

function sanitizeName(name) {
  const cleaned = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, 200)
  return cleaned || 'project'
}

function authorName(value) {
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '').replace(/\([^)]*\)/g, '').trim()
  if (value && typeof value === 'object' && typeof value.name === 'string') return value.name.trim()
  return ''
}

async function createSession(root, report) {
  const id = `${stamp()}-${randomUUID().slice(0, 8)}`
  const dir = path.join(root, DOCTOR_DIR, BACKUPS, id)
  await mkdir(dir, { recursive: true })
  return {
    id,
    dir,
    root,
    report,
    startedAt: new Date().toISOString(),
    entries: [],
    json: await readJson(root),
  }
}

/** Copy-and-write one file, recording the backup entry for rollback. */
async function writeTracked(session, relPath, content) {
  const target = inside(session.root, path.join(session.root, relPath))
  const existed = await pathExists(target)
  const before = existed ? await readFile(target, 'utf8').catch(() => null) : null
  if (existed) {
    const mirror = path.join(session.dir, 'files', relPath)
    await mkdir(path.dirname(mirror), { recursive: true })
    await copyFile(target, mirror)
  }
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content, 'utf8')
  session.entries.push({
    path: relPath.split(path.sep).join('/'),
    kind: existed ? 'modified' : 'created',
    sha256Before: before === null ? null : sha256(before),
    sha256After: sha256(content),
  })
  return relPath
}

async function writePackageJson(session, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`
  await writeTracked(session, 'package.json', text)
}

const skip = (message) => ({ status: 'skipped', message })

async function fixPackageName(session) {
  const json = session.json
  if (!json || json.value === undefined) return skip('package.json is missing or not valid JSON')
  if (json.value.name) return skip('package.json already has a name')
  json.value.name = sanitizeName(path.basename(session.root))
  await writePackageJson(session, json.value)
  return { status: 'applied', file: 'package.json', message: `name = ${json.value.name}` }
}

async function fixEngines(session) {
  const json = session.json
  if (!json || json.value === undefined) return skip('package.json is missing or not valid JSON')
  if (json.value.engines) return skip('package.json already declares engines')
  json.value.engines = { node: '>=20' }
  await writePackageJson(session, json.value)
  return { status: 'applied', file: 'package.json', message: 'engines.node = >=20' }
}

async function fixTestScript(session) {
  const json = session.json
  if (!json || json.value === undefined) return skip('package.json is missing or not valid JSON')
  const scripts = json.value.scripts && typeof json.value.scripts === 'object' ? json.value.scripts : {}
  if (scripts.test && !/no test specified/i.test(String(scripts.test))) return skip('package.json already has a real test script')
  scripts.test = 'node --test'
  json.value.scripts = scripts
  await writePackageJson(session, json.value)
  return { status: 'applied', file: 'package.json', message: 'scripts.test = node --test' }
}

async function fixGitignore(session) {
  const report = session.report
  const wanted = [...GITIGNORE_BASE]
  const buildIssue = (report?.issues || []).find(issue => issue.code === 'BUILD_NOT_IGNORED')
  const dirs = Array.isArray(buildIssue?.params?.dirs) ? buildIssue.params.dirs : []
  for (const dir of dirs) {
    const line = `${dir}/`
    if (!wanted.includes(line)) wanted.push(line)
  }
  const file = path.join(session.root, '.gitignore')
  const exists = await pathExists(file)
  const current = exists ? await readFile(file, 'utf8') : ''
  const lines = current.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim())
  const present = new Set(lines)
  const missing = wanted.filter(line => !present.has(line))
  if (missing.length === 0) return skip('.gitignore already covers every recommended pattern')
  const header = exists ? '' : `# AI Project Doctor recommendations\n# Generated ${new Date().toISOString().slice(0, 10)}\n`
  const body = `${header}${missing.join('\n')}\n`
  const content = exists
    ? `${current.replace(/\s+$/, '')}\n\n# AI Project Doctor\n${body}`
    : body
  await writeTracked(session, '.gitignore', content.replace(/^\n+/, ''))
  return { status: 'applied', file: '.gitignore', message: `added ${missing.length} pattern(s)` }
}

async function fixReadme(session) {
  const root = session.root
  const entries = await readdir(root).catch(() => [])
  if (entries.some(name => /^readme(\.[a-z]+)?$/i.test(name))) return skip('the project already has a README')
  const json = session.json?.value
  const name = typeof json?.name === 'string' && json.name ? json.name : path.basename(root)
  const description = typeof json?.description === 'string' && json.description ? json.description : 'Project documentation.'
  const scripts = json?.scripts && typeof json.scripts === 'object' ? Object.keys(json.scripts) : []
  const scriptLines = scripts.length
    ? scripts.map(key => `- \`npm run ${key}\` — ${key}`).join('\n')
    : '- Add scripts to `package.json` as the project grows.'
  const content = [
    `# ${name}`, '',
    description, '',
    '## Overview', '',
    'Describe what this project does and who it is for.', '',
    '## Getting started', '',
    '```sh', 'npm install', '```', '',
    '## Scripts', '', scriptLines, '',
    '## Project structure', '',
    'Describe the main directories and entry points.', '',
    '## License', '', 'See `LICENSE`.', '',
  ].join('\n')
  await writeTracked(session, 'README.md', content)
  return { status: 'applied', file: 'README.md', message: 'skeleton written' }
}

async function fixLicense(session) {
  const root = session.root
  const entries = await readdir(root).catch(() => [])
  if (entries.some(name => /^(license|licence|copying)(\.[a-z]+)?$/i.test(name))) return skip('the project already has a LICENSE file')
  const json = session.json?.value
  if (json && typeof json.license === 'string' && json.license) return skip(`package.json already declares the license "${json.license}"`)
  const holder = authorName(json?.author) || (typeof json?.name === 'string' && json.name) || path.basename(root)
  const year = new Date().getFullYear()
  const content = [
    'MIT License', '',
    `Copyright (c) ${year} ${holder}`, '',
    'Permission is hereby granted, free of charge, to any person obtaining a copy',
    'of this software and associated documentation files (the "Software"), to deal',
    'in the Software without restriction, including without limitation the rights',
    'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
    'copies of the Software, and to permit persons to whom the Software is',
    'furnished to do so, subject to the following conditions:', '',
    'The above copyright notice and this permission notice shall be included in all',
    'copies or substantial portions of the Software.', '',
    'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
    'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
    'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
    'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
    'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
    'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
    'SOFTWARE.', '',
  ].join('\n')
  await writeTracked(session, 'LICENSE', content)
  return { status: 'applied', file: 'LICENSE', message: `MIT, ${holder}` }
}

const IMPLEMENTATIONS = {
  'package-name': fixPackageName,
  engines: fixEngines,
  'test-script': fixTestScript,
  gitignore: fixGitignore,
  readme: fixReadme,
  license: fixLicense,
}

async function writeManifest(session, extra = {}) {
  const manifest = {
    id: session.id,
    project: session.root,
    createdAt: session.startedAt,
    finishedAt: new Date().toISOString(),
    entries: session.entries,
    ...extra,
  }
  await writeFile(path.join(session.dir, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

/**
 * Apply the requested fixes to a project, backing every touched file up first.
 * @returns {{backupId: string|null, dir: string|null, items: Array, report?: object}}
 */
export async function applyFixes(projectPath, ids, options = {}) {
  if (typeof projectPath !== 'string' || !path.isAbsolute(projectPath)) {
    throw new Error('projectPath must be an absolute directory path.')
  }
  const root = await realpath(projectPath)
  const info = await stat(root)
  if (!info.isDirectory()) throw new Error('The supplied path is not a directory.')
  const selected = normalizeFixIds(ids)
  if (selected.length === 0) throw new Error(`No fixes selected. Known ids: ${FIX_ORDER.join(', ')}.`)
  const language = pickLanguage(options.language)
  const report = options.report && options.report.root === root ? options.report : await runAudit(root, { language })
  const session = await createSession(root, report)
  const items = []
  for (const id of selected) {
    try {
      const outcome = await IMPLEMENTATIONS[id](session)
      const [title] = fixText(language, id)
      items.push({ id, title, ...outcome })
    } catch (error) {
      items.push({ id, title: fixText(language, id)[0], status: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
  }
  if (session.entries.length === 0) {
    await rm(session.dir, { recursive: true, force: true })
    const backupsDir = path.dirname(session.dir)
    const remaining = await readdir(backupsDir).catch(() => [])
    if (remaining.length === 0) {
      await rm(backupsDir, { recursive: true, force: true }).catch(() => {})
      const doctorDir = path.dirname(backupsDir)
      const left = await readdir(doctorDir).catch(() => [])
      if (left.length === 0) await rm(doctorDir, { recursive: true, force: true }).catch(() => {})
    }
    return { backupId: null, dir: null, items }
  }
  await writeManifest(session)
  await pruneBackups(root)
  return { backupId: session.id, dir: `${DOCTOR_DIR}/${BACKUPS}/${session.id}`, items }
}

/** Backups for one project, newest first. */
export async function listBackups(projectPath) {
  const root = await realpath(projectPath)
  const base = path.join(root, DOCTOR_DIR, BACKUPS)
  const ids = (await readdir(base).catch(() => [])).filter(name => /^[0-9A-Za-z:._-]+$/.test(name))
  const rows = []
  for (const id of ids) {
    const manifest = await readFile(path.join(base, id, MANIFEST), 'utf8').catch(() => null)
    if (manifest === null) continue
    try {
      const parsed = JSON.parse(manifest)
      rows.push({
        id,
        createdAt: parsed.createdAt ?? null,
        finishedAt: parsed.finishedAt ?? null,
        rolledBackAt: parsed.rolledBackAt ?? null,
        entries: Array.isArray(parsed.entries) ? parsed.entries.map(entry => ({ path: entry.path, kind: entry.kind })) : [],
      })
    } catch { /* ignore a corrupt manifest */ }
  }
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return rows.slice(0, MAX_BACKUPS)
}

async function pruneBackups(root) {
  const all = await listBackups(root)
  for (const row of all.slice(MAX_BACKUPS)) {
    await rm(path.join(root, DOCTOR_DIR, BACKUPS, row.id), { recursive: true, force: true }).catch(() => {})
  }
}

/** Restore one backup session: rewrite modified files and delete files the fixes created. */
export async function rollback(projectPath, backupId) {
  const root = await realpath(projectPath)
  const base = path.join(root, DOCTOR_DIR, BACKUPS)
  const id = String(backupId || '')
  if (!/^[0-9A-Za-z:._-]+$/.test(id)) throw new Error('Invalid backup id.')
  const dir = path.join(base, id)
  const manifestPath = path.join(dir, MANIFEST)
  const text = await readFile(manifestPath, 'utf8').catch(() => null)
  if (text === null) throw new Error(`Unknown backup "${id}".`)
  const manifest = JSON.parse(text)
  const restored = []
  const deleted = []
  const skipped = []
  const entries = Array.isArray(manifest.entries) ? [...manifest.entries].reverse() : []
  for (const entry of entries) {
    const target = inside(root, path.join(root, entry.path))
    if (entry.kind === 'modified') {
      const mirror = path.join(dir, 'files', entry.path)
      if (!(await pathExists(mirror))) { skipped.push(entry.path); continue }
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(mirror, target)
      restored.push(entry.path)
    } else if (entry.kind === 'created') {
      if (await pathExists(target)) {
        await rm(target, { force: true })
        deleted.push(entry.path)
      } else skipped.push(entry.path)
    } else skipped.push(entry.path)
  }
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, rolledBackAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  return { backupId: id, restored, deleted, skipped }
}

/** Human summary lines for one fix result, shared by the tool and the panel. */
export function describeFixOutcome(language, result) {
  const ui = MESSAGES[pickLanguage(language)].ui
  const lines = []
  for (const item of result.items) {
    const status = item.status === 'applied' ? ui.fixApplied : item.status === 'skipped' ? ui.fixSkipped : ui.fixFailed
    lines.push(`- **${item.title}** — ${status}: ${item.message}`)
  }
  return lines
}
