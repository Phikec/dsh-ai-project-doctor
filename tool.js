import { formatReport, runAudit } from './audit.js'
import { applyFixes, describeFixOutcome, listBackups, planFixes, rollback } from './fix.js'
import { MESSAGES, pickLanguage } from './messages.js'

const ACTIONS = ['audit', 'fix', 'backups', 'rollback']

function reportSummary(language, report) {
  const ui = MESSAGES[language].ui
  return [
    `**${ui.project}:** ${report.root}`,
    `**${ui.score}:** ${report.score}/100`,
    `**${ui.findings}:** ${report.issues.length} (${report.errors} ${ui.errors}, ${report.warnings} ${ui.warnings}, ${report.notes} ${ui.notes})`,
  ].join('  \n')
}

function renderFixList(fixes) {
  if (!fixes.length) return ''
  return ['', '### Suggested fixes', ...fixes.map(fix => `- \`${fix.id}\` — **${fix.title}**: ${fix.detail}`)].join('\n')
}

function renderText(value, format) {
  if (value === null || typeof value !== 'object') return String(value)
  if (format === 'json') return JSON.stringify(value, null, 2)
  const language = pickLanguage(value.language)
  const ui = MESSAGES[language].ui
  const lines = []

  if (value.error) return `Project Doctor: ${value.error}`

  if (value.action === 'audit') {
    lines.push(formatReport(value.report))
    lines.push(renderFixList(value.fixes || []))
    return lines.join('\n')
  }

  if (value.action === 'fix') {
    if (value.needsSelection) {
      lines.push('No fixes were applied: choose one or more ids from `fixes`.', '')
      lines.push(reportSummary(language, value.report))
      lines.push(renderFixList(value.fixes || []))
      return lines.join('\n')
    }
    lines.push('## AI Project Doctor — fixes', '')
    lines.push(reportSummary(language, value.report), '')
    lines.push(...describeFixOutcome(language, value.result))
    lines.push('')
    lines.push(value.result.backupId
      ? `**${ui.backupCreated}:** \`${value.result.dir}\` (id \`${value.result.backupId}\`). Undo with \`action: rollback\`.`
      : `**${ui.backup}:** nothing was written.`)
    lines.push('', ui.fixHint)
    return lines.join('\n')
  }

  if (value.action === 'backups') {
    lines.push('## AI Project Doctor — backups', '')
    if (!value.backups.length) lines.push(ui.noBackups)
    for (const backup of value.backups) {
      const state = backup.rolledBackAt ? ` (${ui.rolledBack} ${backup.rolledBackAt})` : ''
      lines.push(`- \`${backup.id}\` — ${backup.createdAt}${state}`)
      for (const entry of backup.entries) lines.push(`  - ${entry.kind === 'created' ? '+' : '~'} \`${entry.path}\``)
    }
    return lines.join('\n')
  }

  if (value.action === 'rollback') {
    lines.push('## AI Project Doctor — rollback', '')
    lines.push(`**${ui.rolledBack}:** \`${value.result.backupId}\``)
    lines.push(`**${ui.restoredFiles}:** ${value.result.restored.length}`)
    if (value.result.restored.length) lines.push(...value.result.restored.map(file => `- \`${file}\``))
    lines.push(`**${ui.deletedFiles}:** ${value.result.deleted.length}`)
    if (value.result.deleted.length) lines.push(...value.result.deleted.map(file => `- \`${file}\``))
    if (value.report) lines.push('', reportSummary(language, value.report))
    return lines.join('\n')
  }

  return JSON.stringify(value, null, 2)
}

async function runAction(args) {
  const language = pickLanguage(args?.language)
  const projectPath = args?.project_path
  const action = ACTIONS.includes(String(args?.action || 'audit')) ? String(args?.action || 'audit') : 'audit'
  const format = String(args?.format || '').toLowerCase() === 'json' ? 'json' : 'markdown'

  if (action === 'audit') {
    const report = await runAudit(projectPath, { maxFiles: args?.max_files, language })
    return { action, projectPath: report.root, language, format, report, fixes: planFixes(report) }
  }

  if (action === 'fix') {
    const ids = Array.isArray(args?.fixes) ? args.fixes : []
    if (ids.length === 0) {
      const report = await runAudit(projectPath, { maxFiles: args?.max_files, language })
      return { action, projectPath: report.root, language, format, needsSelection: true, report, fixes: planFixes(report) }
    }
    const result = await applyFixes(projectPath, ids, { language })
    const report = await runAudit(result.items.length ? projectPath : projectPath, { maxFiles: args?.max_files, language })
    return { action, projectPath: report.root, language, format, result, report, fixes: planFixes(report) }
  }

  if (action === 'backups') {
    const backups = await listBackups(projectPath)
    return { action, projectPath, language, format, backups }
  }

  const backups = await listBackups(projectPath)
  const target = typeof args?.backup_id === 'string' && args.backup_id ? args.backup_id : backups[0]?.id
  if (!target) throw new Error('There is no backup to roll back.')
  const result = await rollback(projectPath, target)
  const report = await runAudit(projectPath, { maxFiles: args?.max_files, language })
  return { action, projectPath: report.root, language, format, result, report }
}

// defineTool is injected so the tool can be unit-tested without the DSH runtime.
export function createTool(defineTool) {
  return defineTool({
    name: 'project_doctor',
    description: 'Diagnose and repair a software project directory: package.json health, scripts, lockfiles, README/LICENSE, .gitignore coverage, exposed .env and key files (names only), large files, plus a 0-100 health score. Actions: audit (default), fix (apply selected fixes after copying each touched file to .dsh-doctor/backups), backups (list), rollback (restore one backup). Never runs shell commands or installs packages, never reads .env contents, and writes only inside the project directory.',
    parameters: {
      project_path: { type: 'string', required: true, description: 'Absolute path to the project directory.' },
      action: { type: 'string', description: 'What to do: "audit" (default), "fix", "backups", or "rollback".' },
      fixes: { type: 'array', items: { type: 'string' }, description: 'Fix ids for action="fix", for example ["gitignore","readme"]. Omit to list the suggested fixes without changing anything.' },
      backup_id: { type: 'string', description: 'Backup id for action="rollback"; omit to restore the newest backup.' },
      max_files: { type: 'number', description: 'Maximum files to inventory (50-5000, default 1500).' },
      language: { type: 'string', description: 'Report language: "en" (default) or "ru".' },
      format: { type: 'string', description: 'Output format: "markdown" (default) or "json".' },
    },
    output: {
      schema: { type: 'json' },
      render: (args, value) => [{ type: 'text', text: renderText(value, String(args?.format || '').toLowerCase()) }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      try {
        return await runAction(args)
      } catch (error) {
        return { action: String(args?.action || 'audit'), projectPath: String(args?.project_path || ''), language: pickLanguage(args?.language), error: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
