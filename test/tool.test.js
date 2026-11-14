import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { createTool } from '../tool.js'

const tool = createTool((definition) => definition) // identity stands in for defineTool

test('tool contract', () => {
  assert.equal(tool.name, 'project_doctor')
  assert.equal(tool.parameters.project_path.required, true)
  assert.deepEqual(tool.parameters.fixes.items, { type: 'string' })
  assert.equal(tool.isConcurrencySafe(), true)
  assert.deepEqual(tool.output.render({}, 'hi'), [{ type: 'text', text: 'hi' }])
})

test('execute reports a failure value instead of throwing', async () => {
  const relative = await tool.execute({ project_path: 'relative/path' }, {})
  assert.match(relative.error, /absolute/)
  const missing = await tool.execute({ project_path: path.join(os.tmpdir(), 'doctor-does-not-exist-7f3a') }, {})
  assert.match(missing.error, /ENOENT|no such file|not exist/i)
})

test('fix without selection proposes the fixes and changes nothing', async () => {
  const value = await tool.execute({ project_path: process.cwd(), action: 'fix', format: 'json' }, {})
  assert.equal(value.action, 'fix')
  assert.equal(value.needsSelection, true)
  assert.equal(value.result, undefined)
  assert.ok(Array.isArray(value.fixes))
})

test('unknown actions fall back to audit', async () => {
  const value = await tool.execute({ project_path: process.cwd(), action: 'nonsense' }, {})
  assert.equal(value.action, 'audit')
  assert.equal(typeof value.report.score, 'number')
})
