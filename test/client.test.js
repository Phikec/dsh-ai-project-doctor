// End-to-end check of the panel without a browser: the real right-sidebar component
// renders against a tiny React shim whose fetches hit the package's real API handler.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { API_PREFIX, createApiHandler } from '../server.js'

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

/** Minimal hook-capable React stand-in: enough for one panel instance. */
function createReact() {
  let current = null
  const createElement = (type, props, ...children) => ({
    type,
    props: {
      ...(props ?? {}),
      ...(children.length === 0 ? {} : { children: children.length === 1 ? children[0] : children }),
    },
  })
  const shim = {
    createElement,
    useState(initial) {
      const instance = current
      const slot = instance.index++
      if (!(slot in instance.state)) instance.state[slot] = typeof initial === 'function' ? initial() : initial
      const set = (next) => {
        const value = typeof next === 'function' ? next(instance.state[slot]) : next
        if (Object.is(value, instance.state[slot])) return
        instance.state[slot] = value
        instance.rerender()
      }
      return [instance.state[slot], set]
    },
    useEffect(effect) { current.effects.push(effect) },
    useMemo(factory) { return factory() },
    useCallback(fn) { return fn },
    useRef(initial) {
      const instance = current
      const slot = instance.index++
      if (!(slot in instance.refs)) instance.refs[slot] = { current: initial }
      return instance.refs[slot]
    },
  }
  function mount(Component, props) {
    const instance = { Component, props, state: {}, refs: {}, index: 0, effects: [], tree: null }
    instance.rerender = () => { instance.tree = render(instance) }
    instance.rerender()
    return instance
  }
  function render(instance) {
    current = instance
    instance.index = 0
    instance.effects = []
    const tree = instance.Component(instance.props)
    for (const effect of instance.effects) effect()
    return tree
  }
  return { shim, mount }
}

/** Expand stateless function components so the tree can be inspected. */
function expand(node) {
  if (Array.isArray(node)) return node.map(expand).flat()
  if (node !== null && typeof node === 'object' && typeof node.type === 'function') {
    return expand(node.type(node.props))
  }
  return node
}

/** Flatten every text node of an element tree. */
function textOf(node) {
  const value = expand(node)
  if (value === null || value === undefined || typeof value === 'boolean') return ''
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.map(textOf).join(' ')
  return textOf(value.props?.children)
}

/** Depth-first search for elements matching a predicate. */
function findAll(node, predicate, found = []) {
  const value = expand(node)
  if (value === null || value === undefined || typeof value !== 'object') return found
  if (Array.isArray(value)) { for (const child of value) findAll(child, predicate, found); return found }
  if (predicate(value)) found.push(value)
  findAll(value.props?.children, predicate, found)
  return found
}

function buttons(tree, label) {
  return findAll(tree, (node) => node.type === 'button' && textOf(node).includes(label))
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms))

async function project(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doctor-panel-'))
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name)
    await mkdir(path.dirname(full), { recursive: true })
    await writeFile(full, content)
  }
  return dir
}

test('the panel renders, scans, fixes, and rolls back against the real API', async () => {
  const { shim, mount } = createReact()

  // Capture the client module registration the loader receives.
  let registration
  const storage = new Map()
  const opened = []
  globalThis.window = {
    __ModuleLoader__: { load: (value) => { registration = value } },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
    },
  }
  globalThis.document = {
    documentElement: { lang: 'en' },
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
    head: { appendChild() {} },
  }

  await import(pathToFileURL(path.join(here, '..', 'client.js')).href)
  assert.equal(registration.id, 'dsh-ai-project-doctor')
  assert.match(registration.id, /^dsh-/)

  const api = createApiHandler({ getOrigin: () => 'http://127.0.0.1:65239' })
  globalThis.fetch = async (url, init) => {
    const action = String(url).slice(API_PREFIX.length + 1)
    const body = JSON.parse(init.body)
    const chunks = [Buffer.from(JSON.stringify(body))]
    const req = {
      method: 'POST',
      url: API_PREFIX + '/' + action,
      headers: { 'x-project-doctor': '1' },
      async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk },
    }
    const res = {
      status: 0, payload: '',
      writeHead(status) { this.status = status },
      end(payload) { this.payload = payload ?? '' },
    }
    await api(req, res)
    return { ok: res.status < 400, status: res.status, json: async () => JSON.parse(res.payload || '{}') }
  }

  const dictionaries = {}
  const tabs = []
  const bodies = new Map()
  const headerButtons = new Map()

  const ctx = {
    effect: (fn) => { fn(); return () => {} },
    inject: (_services, fn) => { fn(); return () => {} },
    locale: {
      bind: (namespace) => (key, params) => {
        const template = dictionaries[namespace]?.en?.[key] ?? key
        return String(template).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
      },
      register: (namespace, value) => { dictionaries[namespace] = value; return () => {} },
    },
    sidebarRightTabs: { register: (definition) => { tabs.push(definition); return () => {} } },
    sidebarRight: { openTab: (kind) => { opened.push(kind); return 'tab-1' } },
    slots: {
      inject: (_name, fn) => { fn(); return () => {} },
      register: (definition, component) => {
        if (definition.name === 'sidebar.right.pane.tab') bodies.set(definition.key, component)
        else headerButtons.set(definition.id, { definition, component })
        return () => {}
      },
    },
  }

  const plugin = registration.factory((specifier) => {
    if (specifier === 'react') return shim
    throw new Error(`unexpected external "${specifier}"`)
  })
  assert.deepEqual(plugin.inject, ['locale', 'sidebarRight', 'sidebarRightTabs', 'slots'])
  plugin.apply(ctx)

  assert.equal(tabs.length, 1)
  assert.equal(tabs[0].kind, 'project-doctor')
  assert.equal(tabs[0].guide[0].id, 'open')
  assert.ok(bodies.has('dsh-ai-project-doctor'))
  assert.ok(headerButtons.has('project-doctor-open'))

  const t = (key, params) => ctx.locale.bind('project-doctor')(key, params)
  const Panel = bodies.get('dsh-ai-project-doctor')

  const dir = await project({ 'package.json': '{"name":"panel-demo","scripts":{"build":"x"}}' })
  try {
    const panel = mount(Panel, { t })
    assert.match(textOf(panel.tree), /No scan yet/)

    const input = findAll(panel.tree, (node) => node.type === 'input')[0]
    assert.ok(input)
    input.props.onChange({ target: { value: dir } })

    buttons(panel.tree, 'Scan')[0].props.onClick()
    await settle()
    assert.match(textOf(panel.tree), /Health score/)
    assert.match(textOf(panel.tree), /1 file|2 files|\d+ files/)
    assert.match(textOf(panel.tree), /Suggested fixes/)

    buttons(panel.tree, 'Fix selected')[0].props.onClick()
    await settle()
    assert.match(textOf(panel.tree), /Applied \d+ fix/)
    assert.match(textOf(panel.tree), /Latest backup/)

    buttons(panel.tree, 'Roll back')[0].props.onClick()
    await settle()
    assert.match(textOf(panel.tree), /Rolled back/)
    assert.match(textOf(panel.tree), /No backups yet|Latest backup/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  // The header button reveals the panel tab.
  const open = headerButtons.get('project-doctor-open').component
  const openTree = open({ t })
  openTree.props.onClick()
  assert.deepEqual(opened, ['project-doctor'])
})
