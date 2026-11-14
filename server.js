// Web panel API for the right-sidebar view. Same operations the agent tool uses.
import { runAudit } from './audit.js'
import { applyFixes, listBackups, planFixes, rollback } from './fix.js'
import { pickLanguage } from './messages.js'

export const API_PREFIX = '/project-doctor/api'

const MAX_BODY_BYTES = 64 * 1024
const MAX_PATH_LENGTH = 4096

function send(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large.')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Request body must be a JSON object.')
  return parsed
}

function projectPathOf(body) {
  const value = body.path
  if (typeof value !== 'string' || value.length === 0) throw new Error('"path" is required.')
  if (value.length > MAX_PATH_LENGTH) throw new Error('"path" is too long.')
  return value
}

function languageOf(body) {
  return pickLanguage(body.language)
}

async function review(projectPath, body) {
  const language = languageOf(body)
  const report = await runAudit(projectPath, { maxFiles: body.maxFiles, language })
  return { report, fixes: planFixes(report), backups: await listBackups(report.root) }
}

/**
 * Create the request handler for the panel API.
 * @param {{ getOrigin: () => string | undefined }} options origin used for the same-site check
 */
export function createApiHandler({ getOrigin }) {
  return async function handle(req, res) {
    try {
      if (req.method !== 'POST') {
        send(res, 405, { error: 'Use POST.' })
        return
      }
      // A custom header keeps a cross-site form or fetch from reaching a mutating action:
      // browsers must preflight it, and this route answers no preflight.
      if (req.headers['x-project-doctor'] !== '1') {
        send(res, 403, { error: 'Missing the x-project-doctor header.' })
        return
      }
      const origin = req.headers.origin
      let expected
      try { expected = typeof getOrigin === 'function' ? getOrigin() : undefined } catch { expected = undefined }
      if (typeof origin === 'string' && origin !== '' && typeof expected === 'string' && origin !== expected) {
        send(res, 403, { error: 'Cross-origin request refused.' })
        return
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const action = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '')
      const body = await readJsonBody(req)
      const projectPath = projectPathOf(body)

      if (action === 'scan') {
        send(res, 200, await review(projectPath, body))
        return
      }
      if (action === 'backups') {
        send(res, 200, { backups: await listBackups(projectPath) })
        return
      }
      if (action === 'fix') {
        const result = await applyFixes(projectPath, body.fixes, { language: languageOf(body) })
        send(res, 200, { result, ...(await review(projectPath, body)) })
        return
      }
      if (action === 'rollback') {
        const backups = await listBackups(projectPath)
        const target = typeof body.backupId === 'string' && body.backupId ? body.backupId : backups[0]?.id
        if (!target) throw new Error('There is no backup to roll back.')
        const result = await rollback(projectPath, target)
        send(res, 200, { result, ...(await review(projectPath, body)) })
        return
      }
      send(res, 404, { error: `Unknown action "${action}".` })
    } catch (error) {
      send(res, 400, { error: error instanceof Error ? error.message : String(error) })
    }
  }
}
