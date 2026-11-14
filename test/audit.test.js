import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { auditProject, runAudit } from '../audit.js'
import { parseGitignore, isIgnored } from '../gitignore.js'

async function project(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'project-doctor-'))
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return dir
}
const codes = (r) => r.issues.map(i => i.code)

test('reports missing README and gitignore without changing project files', async () => {
  const dir = await project({ 'package.json': { name: 'sample', scripts: { build: 'vite build' }, devDependencies: {} } })
  try {
    const report = await auditProject(dir)
    assert.match(report, /Project Doctor/)
    assert.match(report, /README is missing/)
    assert.match(report, /.gitignore is missing/)
    assert.match(report, /undeclared vite/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('rejects relative paths', async () => {
  await assert.rejects(() => auditProject('.'), /absolute directory path/)
})

test('tsc is satisfied by the typescript package', async () => {
  const dir = await project({ 'package.json': { name: 'a', private: true, scripts: { build: 'tsc -p .', test: 'node --test' }, devDependencies: { typescript: '^5.0.0' } }, 'README.md': '#', '.gitignore': 'node_modules\n' })
  try {
    assert.ok(!codes(await runAudit(dir)).includes('SCRIPT_DEPENDENCY_MISSING'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('detects undeclared tools through env prefixes and && chains, ignores npx', async () => {
  const dir = await project({ 'package.json': { name: 'a', private: true, scripts: { a: 'NODE_ENV=production webpack && eslint .', b: 'npx vite build' } } })
  try {
    const r = await runAudit(dir)
    const missing = r.issues.filter(i => i.code === 'SCRIPT_DEPENDENCY_MISSING').map(i => i.title)
    assert.equal(missing.length, 2)
    assert.ok(missing.some(t => t.includes('webpack')) && missing.some(t => t.includes('eslint')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('.env handling: exposed warns, ignored and .env.example do not, contents never read', async () => {
  const exposed = await project({ '.env': 'SECRET=1', '.gitignore': 'dist\n', 'README.md': '#' })
  const safe = await project({ '.env': 'SECRET=1', '.env.example': 'SECRET=', '.gitignore': '.env*\n!.env.example\n', 'README.md': '#' })
  try {
    assert.ok(codes(await runAudit(exposed)).includes('ENV_NOT_IGNORED'))
    assert.ok(!codes(await runAudit(safe)).includes('ENV_NOT_IGNORED'))
  } finally { await rm(exposed, { recursive: true, force: true }); await rm(safe, { recursive: true, force: true }) }
})

test('nested .env is caught and a nested .gitignore can cover it', async () => {
  const bad = await project({ 'apps/web/.env.local': 'X=1', '.gitignore': 'node_modules\n' })
  const good = await project({ 'apps/web/.env.local': 'X=1', 'apps/web/.gitignore': '.env.local\n' })
  try {
    assert.ok(codes(await runAudit(bad)).includes('ENV_NOT_IGNORED'))
    assert.ok(!codes(await runAudit(good)).includes('ENV_NOT_IGNORED'))
  } finally { await rm(bad, { recursive: true, force: true }); await rm(good, { recursive: true, force: true }) }
})

test('flags key files by name and missing script/main files', async () => {
  const dir = await project({ 'server.pem': 'x', 'package.json': { name: 'a', private: true, main: 'src/missing.js', scripts: { start: 'node scripts/nope.js', test: 'x' } } })
  try {
    const c = codes(await runAudit(dir))
    assert.ok(c.includes('SENSITIVE_FILE') && c.includes('SCRIPT_FILE_MISSING') && c.includes('ENTRY_MISSING'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('node_modules not ignored, README.rst accepted, multiple lockfiles, loose versions', async () => {
  const dir = await project({ 'README.rst': 'x', '.gitignore': 'dist\n', 'package-lock.json': '{}', 'yarn.lock': '', 'package.json': { name: 'a', private: true, scripts: { test: 'x' }, dependencies: { left: '*', right: 'latest' } } })
  try {
    const c = codes(await runAudit(dir))
    assert.ok(c.includes('NODE_MODULES_NOT_IGNORED') && c.includes('MULTIPLE_LOCKFILES') && c.includes('LOOSE_DEPENDENCY_VERSION'))
    assert.ok(!c.includes('README_MISSING'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('invalid package.json and tsconfig with comments', async () => {
  const bad = await project({ 'package.json': '{ nope' })
  const ts = await project({ 'tsconfig.json': '{\n // c\n "a": "http://x", /* b */ "c": [1,],\n}' })
  try {
    assert.ok(codes(await runAudit(bad)).includes('INVALID_PACKAGE_JSON'))
    assert.ok(!codes(await runAudit(ts)).includes('TSCONFIG_PARSE'))
  } finally { await rm(bad, { recursive: true, force: true }); await rm(ts, { recursive: true, force: true }) }
})

test('truncation keeps root files visible and reports it', async () => {
  const files = { 'package.json': { name: 'a', private: true, scripts: { test: 'x' } }, 'README.md': '#', '.gitignore': 'x\n' }
  for (let i = 0; i < 80; i++) files[`src/f${i}.js`] = ''
  const dir = await project(files)
  try {
    const r = await runAudit(dir, { maxFiles: 50 })
    assert.equal(r.truncated, true)
    assert.ok(codes(r).includes('SCAN_TRUNCATED'))
    assert.ok(!codes(r).includes('README_MISSING'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('ignored directories are pruned from the inventory', async () => {
  const dir = await project({ 'out/a.js': '', 'src/b.js': '', '.gitignore': 'out/\n' })
  try { assert.equal((await runAudit(dir)).counts.js, 1) }
  finally { await rm(dir, { recursive: true, force: true }) }
})

test('the doctor backup directory is never scanned', async () => {
  const dir = await project({ 'README.md': '#', '.dsh-doctor/backups/x/files/server.pem': 'x', '.dsh-doctor/backups/x/manifest.json': '{}' })
  try {
    const r = await runAudit(dir)
    assert.ok(!codes(r).includes('SENSITIVE_FILE'))
    assert.equal(r.counts.total, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('Russian and JSON output', async () => {
  const dir = await project({ 'package.json': { name: 'a' } })
  try {
    assert.match(await auditProject(dir, 1500, { language: 'ru' }), /Нет README/)
    const json = JSON.parse(await auditProject(dir, 1500, { format: 'json' }))
    assert.equal(typeof json.score, 'number')
    assert.ok(Array.isArray(json.issues))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('clean project scores 100', async () => {
  const dir = await project({ 'README.md': '#', 'LICENSE': 'MIT', '.gitignore': 'node_modules\n', 'package.json': { name: 'a', private: true, scripts: { test: 'node --test' } } })
  try { assert.equal((await runAudit(dir)).score, 100) }
  finally { await rm(dir, { recursive: true, force: true }) }
})

test('gitignore matcher semantics, including a UTF-8 BOM', () => {
  const r = parseGitignore('*.log\n/build\n!keep.log\ndocs/**/tmp\n')
  assert.equal(isIgnored('a/b.log', false, r), true)
  assert.equal(isIgnored('keep.log', false, r), false)
  assert.equal(isIgnored('build', true, r), true)
  assert.equal(isIgnored('x/build', true, r), false)
  assert.equal(isIgnored('docs/a/b/tmp', true, r), true)

  const bom = parseGitignore('\uFEFFnode_modules\ndist\n')
  assert.equal(isIgnored('node_modules', true, bom), true)
  assert.equal(isIgnored('dist', true, bom), true)
})
