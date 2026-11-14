import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { API_PREFIX, createApiHandler } from '../server.js'

function request(action, body, headers = {}, method = 'POST') {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    url: API_PREFIX + '/' + action,
    headers: { 'x-project-doctor': '1', ...headers },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
  }
}

function response() {
  return {
    status: 0,
    body: '',
    headers: {},
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {} },
    end(body) { this.body = body ?? '' },
  }
}

const handle = createApiHandler({ getOrigin: () => 'http://127.0.0.1:65239' })
const run = async (req) => {
  const res = response()
  await handle(req, res)
  return { status: res.status, data: res.body ? JSON.parse(res.body) : {} }
}

async function project(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doctor-api-'))
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, content)
  }
  return dir
}

test('the panel API refuses a request without its header', async () => {
  const { status, data } = await run(request('scan', { path: os.tmpdir() }, { 'x-project-doctor': '' }))
  assert.equal(status, 403)
  assert.match(data.error, /x-project-doctor/)
})

test('a cross-origin request is refused', async () => {
  const { status } = await run(request('scan', { path: os.tmpdir() }, { origin: 'http://evil.example' }))
  assert.equal(status, 403)
})

test('scan returns the report, the fix plan, and backups', async () => {
  const dir = await project({ 'package.json': '{"name":"demo","scripts":{"build":"x"}}' })
  try {
    const { status, data } = await run(request('scan', { path: dir }))
    assert.equal(status, 200)
    assert.equal(typeof data.report.score, 'number')
    assert.ok(data.fixes.some(fix => fix.id === 'gitignore'))
    assert.deepEqual(data.backups, [])
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('fix then rollback round-trips through the API', async () => {
  const dir = await project({ 'package.json': '{"name":"demo"}' })
  try {
    const fixed = await run(request('fix', { path: dir, fixes: ['gitignore', 'readme'] }))
    assert.equal(fixed.status, 200)
    assert.equal(fixed.data.result.items.filter(item => item.status === 'applied').length, 2)
    assert.ok(fixed.data.result.backupId)
    assert.match(await readFile(path.join(dir, 'README.md'), 'utf8'), /# demo/)

    const rolled = await run(request('rollback', { path: dir }))
    assert.equal(rolled.status, 200)
    assert.deepEqual(rolled.data.result.deleted, ['README.md', '.gitignore'])
    assert.equal(rolled.data.backups.length, 1)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('unknown actions and invalid bodies answer 4xx with a message', async () => {
  const unknown = await run(request('nope', { path: os.tmpdir() }))
  assert.equal(unknown.status, 404)
  const missingPath = await run(request('scan', {}))
  assert.equal(missingPath.status, 400)
  assert.match(missingPath.data.error, /path/)
  const get = await run(request('scan', undefined, {}, 'GET'))
  assert.equal(get.status, 405)
})
