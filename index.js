import { defineTool } from '@deepseek-ai/dsh-tools'
import { createTool } from './tool.js'
import { API_PREFIX, createApiHandler } from './server.js'

export { auditProject, runAudit, formatReport } from './audit.js'
export { applyFixes, listBackups, rollback, planFixes, FIX_ORDER } from './fix.js'

export const name = 'ai-project-doctor'
export const inject = ['tools']

export function apply(ctx) {
  // Registered through ctx, so Cordis disposes it automatically when the plugin unloads.
  ctx.tools.register(createTool(defineTool))

  // The panel talks to the same operations over the Host's own HTTP server. A profile
  // without the web server keeps the agent tool and simply has no panel API.
  ctx.inject(['webServer'], (webCtx) => {
    const handle = createApiHandler({ getOrigin: () => webCtx.webServer.getOrigin() })
    webCtx.effect(
      () => webCtx.webServer.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: (req, res) => {
          handle(req, res).catch(() => {
            try {
              res.writeHead(500)
              res.end()
            } catch { /* response may already be sent */ }
          })
        },
      }),
      'ai-project-doctor: panel API',
    )
  })
}
