import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { applyFixes, listBackups, normalizeFixIds, planFixes, rollback } from '../fix.js'
import { runAudit } from '../audit.js'

async function project(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doctor-fix-'))
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
  return dir
}

const read = (dir, name) => readFile(path.join(dir, name), 'utf8')

test('gitignore fix creates the file, records a backup, and rollback deletes it', async () => {
  const dir = await project({ 'src/a.js': 'x' })
  try {
    const result = await applyFixes(dir, ['gitignore'])
    assert.equal(result.items[0].status, 'applied')
    assert.ok(result.backupId)
    const text = await read(dir, '.gitignore')
    assert.match(text, /node_modules\//)
    assert.match(text, /\.env\*/)
    assert.match(text, /\.dsh-doctor\//)

    const backups = await listBackups(dir)
    assert.equal(backups.length, 1)
    assert.deepEqual(backups[0].entries, [{ path: '.gitignore', kind: 'created' }])

    const undone = await rollback(dir, result.backupId)
    assert.deepEqual(undone.deleted, ['.gitignore'])
    await assert.rejects(() => stat(path.join(dir, '.gitignore')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('an existing .gitignore is extended and restored byte for byte', async () => {
  const dir = await project({ '.gitignore': 'custom\n' })
  try {
    const result = await applyFixes(dir, ['gitignore'])
    const extended = await read(dir, '.gitignore')
    assert.match(extended, /^custom\n/)
    assert.match(extended, /node_modules\//)

    const undone = await rollback(dir, result.backupId)
    assert.deepEqual(undone.restored, ['.gitignore'])
    assert.equal(await read(dir, '.gitignore'), 'custom\n')
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('fixes that are already satisfied are skipped and write no backup', async () => {
  const dir = await project({
    'package.json': { name: 'app', engines: { node: '>=20' }, scripts: { test: 'node --test' } },
  })
  try {
    const result = await applyFixes(dir, ['engines', 'test-script', 'package-name'])
    assert.deepEqual(result.items.map(item => item.status), ['skipped', 'skipped', 'skipped'])
    assert.equal(result.backupId, null)
    assert.equal((await listBackups(dir)).length, 0)
    await assert.rejects(() => stat(path.join(dir, '.dsh-doctor')))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('README and LICENSE are created from the manifest', async () => {
  const dir = await project({
    'package.json': { name: 'demo-app', author: 'Ada Lovelace', description: 'Demo application' },
  })
  try {
    const result = await applyFixes(dir, ['readme', 'license'])
    assert.deepEqual(result.items.map(item => item.status), ['applied', 'applied'])
    const readme = await read(dir, 'README.md')
    assert.match(readme, /# demo-app/)
    assert.match(readme, /Demo application/)
    const license = await read(dir, 'LICENSE')
    assert.match(license, /MIT License/)
    assert.match(license, /Ada Lovelace/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('package.json fixes add the missing fields and keep the rest', async () => {
  const dir = await project({ 'package.json': { version: '1.0.0', scripts: { build: 'vite build' } } })
  try {
    await applyFixes(dir, ['package-name', 'engines', 'test-script'])
    const manifest = JSON.parse(await read(dir, 'package.json'))
    assert.equal(manifest.version, '1.0.0')
    assert.equal(manifest.scripts.build, 'vite build')
    assert.equal(manifest.scripts.test, 'node --test')
    assert.equal(manifest.engines.node, '>=20')
    assert.ok(typeof manifest.name === 'string' && manifest.name.length > 0)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('unknown fix ids are rejected; plan order follows the engine order', async () => {
  assert.throws(() => normalizeFixIds(['nope']), /Unknown fix id/)
  const dir = await project({ 'package.json': { name: 'app', scripts: { build: 'x' } } })
  try {
    const plan = planFixes(await runAudit(dir))
    assert.deepEqual(plan.map(entry => entry.id), ['engines', 'test-script', 'gitignore', 'readme', 'license'])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('relative paths and unknown backups are refused', async () => {
  await assert.rejects(() => applyFixes('.', ['gitignore']), /absolute/)
  const dir = await project({})
  try {
    await assert.rejects(() => rollback(dir, '../escape'), /Invalid backup id/)
    await assert.rejects(() => rollback(dir, 'missing'), /Unknown backup/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
