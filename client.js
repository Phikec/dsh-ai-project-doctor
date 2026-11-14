/**
 * AI Project Doctor — the right-sidebar panel.
 *
 * Scans a project through the Host's panel API, shows the findings, and applies the
 * reversible fixes the Host prepared. All filesystem work stays on the Host; this
 * module only renders and calls the same operations the `project_doctor` tool uses.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ai-project-doctor',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const PACKAGE = 'dsh-ai-project-doctor';
    const NS = 'project-doctor';
    const TAB_KIND = 'project-doctor';
    const OPEN_BUTTON_ID = 'project-doctor-open';
    const API = '/project-doctor/api/';
    const STORE_KEY = 'ai-project-doctor:path';
    const STYLE_ID = PACKAGE + '/styles';

    const CSS = [
      '.pdr-root{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:inherit;line-height:1.5}',
      '.pdr-head{flex:none;display:flex;flex-direction:column;gap:8px;padding:12px 14px 10px}',
      '.pdr-title-row{display:flex;align-items:center;gap:8px;min-width:0}',
      '.pdr-title{font-weight:600;font-size:13px;white-space:nowrap}',
      '.pdr-sub{color:var(--dsw-alias-label-tertiary);font-size:11px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.pdr-spacer{flex:1}',
      '.pdr-path-row{display:flex;gap:6px;align-items:center}',
      '.pdr-input{flex:1;min-width:0;font:inherit;font-size:12px;line-height:1.4;padding:5px 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);outline:none}',
      '.pdr-input::placeholder{color:var(--dsw-alias-label-tertiary)}',
      '.pdr-input:focus{border-color:var(--dsw-alias-border-selected)}',
      '.pdr-button{appearance:none;font:inherit;font-size:12px;line-height:1.4;padding:5px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;white-space:nowrap}',
      '.pdr-button:hover:enabled{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pdr-button:disabled{opacity:.5;cursor:default}',
      '.pdr-primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-on-color)}',
      '.pdr-primary:hover:enabled{filter:brightness(1.12)}',
      '.pdr-small{font-size:11px;padding:2px 7px;border-radius:6px}',
      '.pdr-scroll{flex:1;min-height:0;overflow-y:auto;padding:0 14px 20px;display:flex;flex-direction:column;gap:12px}',
      '.pdr-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-card-fill);padding:10px 12px;display:flex;flex-direction:column;gap:8px}',
      '.pdr-summary{display:flex;align-items:center;gap:12px}',
      '.pdr-summary-main{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.pdr-score-caption{color:var(--dsw-alias-label-tertiary);font-size:11px;text-transform:uppercase;letter-spacing:.04em}',
      '.pdr-counts{display:flex;gap:10px;font-size:12px;flex-wrap:wrap}',
      '.pdr-count{display:inline-flex;align-items:center;gap:4px}',
      '.pdr-dot{width:7px;height:7px;border-radius:50%;flex:none}',
      '.pdr-error{background:var(--dsw-alias-state-error-primary)}',
      '.pdr-warning{background:var(--dsw-alias-state-warn-primary)}',
      '.pdr-info{background:var(--dsw-alias-label-tertiary)}',
      '.pdr-meta{color:var(--dsw-alias-label-secondary);font-size:11px;display:flex;flex-wrap:wrap;gap:4px 8px}',
      '.pdr-chip{border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 7px;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pdr-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--dsw-alias-label-tertiary)}',
      '.pdr-fix{display:flex;align-items:flex-start;gap:8px;padding:5px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.pdr-fix:first-of-type{border-top:0}',
      '.pdr-check{margin:2px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}',
      '.pdr-fix-text{display:flex;flex-direction:column;min-width:0}',
      '.pdr-fix-title{font-size:12px;font-weight:600}',
      '.pdr-fix-detail{color:var(--dsw-alias-label-secondary);font-size:11px}',
      '.pdr-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}',
      '.pdr-filters{display:flex;gap:4px;flex-wrap:wrap}',
      '.pdr-filter{appearance:none;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:2px 8px;border-radius:999px;cursor:pointer}',
      '.pdr-filter:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.pdr-filter[aria-pressed="true"]{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.pdr-issue{display:flex;gap:8px;padding:6px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.pdr-issue:first-of-type{border-top:0}',
      '.pdr-issue-dot{margin-top:5px;width:7px;height:7px;border-radius:50%;flex:none}',
      '.pdr-issue-body{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.pdr-issue-title{font-size:12px;font-weight:600;overflow-wrap:anywhere}',
      '.pdr-issue-detail{font-size:11px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
      '.pdr-issue-meta{font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.pdr-note{font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.pdr-note-ok{color:var(--dsw-alias-state-success-primary)}',
      '.pdr-note-error{color:var(--dsw-alias-state-error-primary)}',
      '.pdr-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:6px;padding:40px 18px;color:var(--dsw-alias-label-secondary)}',
      '.pdr-empty-title{font-weight:600;font-size:13px;color:var(--dsw-alias-label-primary)}',
      '.pdr-empty-hint{font-size:12px;max-width:30ch}',
      '.pdr-ring{flex:none}',
      '.pdr-open{appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;cursor:pointer;padding:0}',
      '.pdr-open:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
    ].join('\n');

    /** English labels; also the fallback dictionary. */
    const en = {
      'tab.title': 'Doctor',
      'tab.description': 'Scan a project, review its health, and fix issues with backups.',
      'open.tooltip': 'Open AI Project Doctor',
      'title': 'AI Project Doctor',
      'subtitle': 'Read-only diagnostics with reversible fixes',
      'path.placeholder': 'Absolute project path, for example C:\\projects\\app',
      'action.scan': 'Scan',
      'action.scanning': 'Scanning…',
      'action.rescan': 'Rescan',
      'action.apply': 'Fix selected',
      'action.applying': 'Fixing…',
      'action.rollback': 'Roll back',
      'action.rollingback': 'Rolling back…',
      'action.selectAll': 'Select all',
      'score.caption': 'Health score',
      'metric.files': 'files',
      'metric.findings': 'findings',
      'fix.caption': 'Suggested fixes',
      'fix.hint': 'Each touched file is copied to .dsh-doctor/backups before it changes.',
      'fix.none': 'Nothing to fix automatically.',
      'fix.nothingSelected': 'Select at least one fix.',
      'finding.caption': 'Findings',
      'finding.none': 'Nothing matches this filter.',
      'filter.all': 'All',
      'filter.errors': 'Errors',
      'filter.warnings': 'Warnings',
      'filter.notes': 'Notes',
      'filter.fixable': 'Fixable',
      'empty.title': 'No scan yet',
      'empty.hint': 'Enter an absolute project path and press Scan.',
      'backup.latest': 'Latest backup',
      'backup.none': 'No backups yet',
      'notice.fixed': 'Applied {count} fix(es). Backup {id}.',
      'notice.nothing': 'No files were changed.',
      'notice.rolledback': 'Rolled back {id}: restored {restored}, deleted {deleted}.',
      'error.prefix': 'Request failed',
      'truncated': 'scan truncated',
      'stack': 'Detected',
    };

    const ru = {
      'tab.title': 'Доктор',
      'tab.description': 'Сканирование проекта, оценка здоровья и исправления с бэкапами.',
      'open.tooltip': 'Открыть AI Project Doctor',
      'title': 'AI Project Doctor',
      'subtitle': 'Диагностика чтением и обратимые исправления',
      'path.placeholder': 'Абсолютный путь к проекту, например C:\\projects\\app',
      'action.scan': 'Сканировать',
      'action.scanning': 'Сканирование…',
      'action.rescan': 'Повторить',
      'action.apply': 'Исправить выбранное',
      'action.applying': 'Исправление…',
      'action.rollback': 'Откатить',
      'action.rollingback': 'Откат…',
      'action.selectAll': 'Выбрать всё',
      'score.caption': 'Оценка здоровья',
      'metric.files': 'файлов',
      'metric.findings': 'находок',
      'fix.caption': 'Предлагаемые исправления',
      'fix.hint': 'Каждый изменяемый файл сначала копируется в .dsh-doctor/backups.',
      'fix.none': 'Автоматически исправлять нечего.',
      'fix.nothingSelected': 'Выберите хотя бы одно исправление.',
      'finding.caption': 'Находки',
      'finding.none': 'Под этот фильтр ничего не подходит.',
      'filter.all': 'Все',
      'filter.errors': 'Ошибки',
      'filter.warnings': 'Предупреждения',
      'filter.notes': 'Заметки',
      'filter.fixable': 'Исправимые',
      'empty.title': 'Сканирования ещё не было',
      'empty.hint': 'Введите абсолютный путь к проекту и нажмите «Сканировать».',
      'backup.latest': 'Последний бэкап',
      'backup.none': 'Бэкапов пока нет',
      'notice.fixed': 'Применено исправлений: {count}. Бэкап {id}.',
      'notice.nothing': 'Файлы не изменялись.',
      'notice.rolledback': 'Откат {id}: восстановлено {restored}, удалено {deleted}.',
      'error.prefix': 'Запрос не выполнен',
      'truncated': 'сканирование обрезано',
      'stack': 'Определено',
    };

    /** Bound at apply time, used before the locale-bound prop is available. */
    let fallbackTranslate = (key) => key;
    let pluginContext;

    /** Language the Host uses for the report text. */
    function reportLanguage() {
      try {
        const lang = document.documentElement.lang || '';
        return lang.toLowerCase().startsWith('ru') ? 'ru' : 'en';
      } catch { return 'en'; }
    }

    /** One panel API call. Throws the Host's message on failure. */
    async function callApi(action, payload) {
      const response = await fetch(API + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-project-doctor': '1' },
        body: JSON.stringify({ ...payload, language: reportLanguage() }),
      });
      let data = {};
      try { data = await response.json(); } catch { data = {}; }
      if (!response.ok || data.error) throw new Error(data.error || ('HTTP ' + response.status));
      return data;
    }

    function readStoredPath() {
      try { return window.localStorage.getItem(STORE_KEY) || ''; } catch { return ''; }
    }

    function writeStoredPath(value) {
      try { window.localStorage.setItem(STORE_KEY, value); } catch { /* storage may be unavailable */ }
    }

    function scoreTone(score) {
      if (score >= 85) return 'var(--dsw-alias-state-success-primary)';
      if (score >= 60) return 'var(--dsw-alias-state-warn-primary)';
      return 'var(--dsw-alias-state-error-primary)';
    }

    function ScoreRing(props) {
      const radius = 26;
      const circumference = 2 * Math.PI * radius;
      const score = Math.max(0, Math.min(100, Number(props.score) || 0));
      const dash = (score / 100) * circumference;
      return h('svg', {
        className: 'pdr-ring', width: 68, height: 68, viewBox: '0 0 68 68',
        role: 'img', 'aria-label': String(score),
      },
      h('circle', { cx: 34, cy: 34, r: radius, fill: 'none', stroke: 'var(--dsw-alias-border-l2)', strokeWidth: 6 }),
      h('circle', {
        cx: 34, cy: 34, r: radius, fill: 'none', stroke: scoreTone(score), strokeWidth: 6,
        strokeLinecap: 'round', strokeDasharray: dash + ' ' + (circumference - dash),
        transform: 'rotate(-90 34 34)',
      }),
      h('text', {
        x: 34, y: 34, textAnchor: 'middle', dominantBaseline: 'central',
        fill: 'var(--dsw-alias-label-primary)', fontSize: 18, fontWeight: 600,
      }, String(score)));
    }

    function EmptyState(props) {
      const t = props.t;
      return h('div', { className: 'pdr-empty' },
        h('svg', { viewBox: '0 0 48 48', width: 48, height: 48, 'aria-hidden': true },
          h('path', {
            d: 'M24 6 39 12v10c0 9-6 15-15 19-9-4-15-10-15-19V12z',
            fill: 'none', stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2.4, strokeLinejoin: 'round',
          }),
          h('path', {
            d: 'M24 17v14M17 24h14',
            stroke: 'var(--dsw-alias-brand-primary)', strokeWidth: 2.4, strokeLinecap: 'round',
          })),
        h('div', { className: 'pdr-empty-title' }, t('empty.title')),
        h('div', { className: 'pdr-empty-hint' }, t('empty.hint')));
    }

    function IssueRow(props) {
      const issue = props.issue;
      const meta = (issue.file ? issue.file + ' · ' : '') + issue.code + (props.fixable ? ' · fixable' : '');
      return h('div', { className: 'pdr-issue' },
        h('span', { className: 'pdr-dot pdr-issue-dot pdr-' + issue.severity }),
        h('span', { className: 'pdr-issue-body' },
          h('span', { className: 'pdr-issue-title' }, issue.title),
          h('span', { className: 'pdr-issue-detail' }, issue.detail),
          h('span', { className: 'pdr-issue-meta' }, meta)));
    }

    function Panel(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const [path, setPath] = useState(readStoredPath);
      const [busy, setBusy] = useState('');
      const [report, setReport] = useState(null);
      const [fixes, setFixes] = useState([]);
      const [backups, setBackups] = useState([]);
      const [error, setError] = useState(null);
      const [notice, setNotice] = useState(null);
      const [filter, setFilter] = useState('all');
      const [selected, setSelected] = useState({});
      const autoRan = useRef(false);

      const applyScan = useCallback((data) => {
        setReport(data.report || null);
        setFixes(Array.isArray(data.fixes) ? data.fixes : []);
        setBackups(Array.isArray(data.backups) ? data.backups : []);
        setSelected((current) => {
          const next = { ...current };
          for (const fix of data.fixes || []) if (next[fix.id] === undefined) next[fix.id] = true;
          return next;
        });
      }, []);

      const scan = useCallback(async (target) => {
        setBusy('scan');
        setError(null);
        setNotice(null);
        try {
          const data = await callApi('scan', { path: target });
          applyScan(data);
          writeStoredPath(target);
        } catch (failure) {
          setError(failure.message);
          setReport(null);
          setFixes([]);
        } finally {
          setBusy('');
        }
      }, [applyScan]);

      useEffect(() => {
        if (autoRan.current) return;
        autoRan.current = true;
        const stored = readStoredPath();
        if (stored) scan(stored);
      }, [scan]);

      const submit = useCallback(() => {
        const target = path.trim();
        if (!target) { setError(t('empty.hint')); return; }
        scan(target);
      }, [path, scan, t]);

      const fixAll = useCallback(async () => {
        const ids = fixes.filter((fix) => selected[fix.id] !== false).map((fix) => fix.id);
        if (ids.length === 0) { setNotice(t('fix.nothingSelected')); return; }
        setBusy('fix');
        setError(null);
        setNotice(null);
        try {
          const data = await callApi('fix', { path: path.trim(), fixes: ids });
          applyScan(data);
          const applied = (data.result?.items || []).filter((item) => item.status === 'applied').length;
          setSelected({});
          setNotice(applied === 0
            ? t('notice.nothing')
            : t('notice.fixed', { count: applied, id: data.result?.backupId || '—' }));
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy('');
        }
      }, [applyScan, fixes, path, selected, t]);

      const rollbackLatest = useCallback(async () => {
        const latest = backups[0];
        if (!latest) return;
        setBusy('rollback');
        setError(null);
        setNotice(null);
        try {
          const data = await callApi('rollback', { path: path.trim(), backupId: latest.id });
          applyScan(data);
          setNotice(t('notice.rolledback', {
            id: data.result?.backupId || latest.id,
            restored: data.result?.restored?.length ?? 0,
            deleted: data.result?.deleted?.length ?? 0,
          }));
        } catch (failure) {
          setError(failure.message);
        } finally {
          setBusy('');
        }
      }, [applyScan, backups, path, t]);

      const fixableCodes = useMemo(() => new Set(fixes.flatMap((fix) => fix.codes || [])), [fixes]);
      const issues = report?.issues || [];
      const visibleIssues = useMemo(() => {
        if (filter === 'all') return issues;
        if (filter === 'fixable') return issues.filter((issue) => fixableCodes.has(issue.code));
        return issues.filter((issue) => issue.severity === filter);
      }, [filter, fixableCodes, issues]);

      const counts = report ? { error: report.errors, warning: report.warnings, info: report.notes } : { error: 0, warning: 0, info: 0 };
      const busyNow = busy !== '';
      const selectedCount = fixes.filter((fix) => selected[fix.id] !== false).length;

      const filters = [
        ['all', 'filter.all'],
        ['error', 'filter.errors'],
        ['warning', 'filter.warnings'],
        ['info', 'filter.notes'],
        ['fixable', 'filter.fixable'],
      ];

      return h('div', { className: 'pdr-root' },
        h('div', { className: 'pdr-head' },
          h('div', { className: 'pdr-title-row' },
            h('span', { className: 'pdr-title' }, t('title')),
            h('span', { className: 'pdr-spacer' }),
            report ? h('span', { className: 'pdr-sub' }, report.root) : null),
          h('div', { className: 'pdr-sub' }, t('subtitle')),
          h('div', { className: 'pdr-path-row' },
            h('input', {
              className: 'pdr-input',
              type: 'text',
              spellCheck: false,
              placeholder: t('path.placeholder'),
              value: path,
              disabled: busyNow,
              onChange: (event) => { setPath(event.target.value); },
              onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
              'aria-label': t('path.placeholder'),
            }),
            h('button', {
              type: 'button', className: 'pdr-button pdr-primary', disabled: busyNow, onClick: submit,
            }, busy === 'scan' ? t('action.scanning') : report ? t('action.rescan') : t('action.scan')))),
        h('div', { className: 'pdr-scroll' },
          error ? h('div', { className: 'pdr-note pdr-note-error' }, t('error.prefix') + ': ' + error) : null,
          notice ? h('div', { className: 'pdr-note pdr-note-ok' }, notice) : null,
          !report && !error ? h(EmptyState, { t }) : null,

          report ? h('div', { className: 'pdr-card pdr-summary' },
            h(ScoreRing, { score: report.score }),
            h('div', { className: 'pdr-summary-main' },
              h('div', { className: 'pdr-score-caption' }, t('score.caption')),
              h('div', { className: 'pdr-counts' },
                h('span', { className: 'pdr-count' }, h('span', { className: 'pdr-dot pdr-error' }), String(counts.error)),
                h('span', { className: 'pdr-count' }, h('span', { className: 'pdr-dot pdr-warning' }), String(counts.warning)),
                h('span', { className: 'pdr-count' }, h('span', { className: 'pdr-dot pdr-info' }), String(counts.info))),
              h('div', { className: 'pdr-meta' },
                h('span', null, report.counts.total + ' ' + t('metric.files') + (report.truncated ? ' (' + t('truncated') + ')' : '')),
                report.stack.length ? h('span', null, t('stack') + ': ' + report.stack.join(', ')) : null))) : null,

          report ? h('div', { className: 'pdr-card' },
            h('div', { className: 'pdr-title-row' },
              h('span', { className: 'pdr-section-title' }, t('fix.caption')),
              h('span', { className: 'pdr-spacer' }),
              fixes.length ? h('button', {
                type: 'button', className: 'pdr-button pdr-small',
                onClick: () => {
                  const next = {};
                  for (const fix of fixes) next[fix.id] = true;
                  setSelected(next);
                },
              }, t('action.selectAll')) : null),
            fixes.length
              ? fixes.map((fix) => h('label', { className: 'pdr-fix', key: fix.id },
                  h('input', {
                    type: 'checkbox', className: 'pdr-check',
                    checked: selected[fix.id] !== false,
                    onChange: (event) => {
                      const checked = event.target.checked;
                      setSelected((current) => ({ ...current, [fix.id]: checked }));
                    },
                  }),
                  h('span', { className: 'pdr-fix-text' },
                    h('span', { className: 'pdr-fix-title' }, fix.title),
                    h('span', { className: 'pdr-fix-detail' }, fix.detail))))
              : h('div', { className: 'pdr-note' }, t('fix.none')),
            fixes.length || backups.length ? h('div', { className: 'pdr-actions' },
              fixes.length ? h('button', {
                type: 'button', className: 'pdr-button pdr-primary', disabled: busyNow || selectedCount === 0,
                onClick: fixAll,
              }, busy === 'fix' ? t('action.applying') : t('action.apply') + ' (' + selectedCount + ')') : null,
              backups.length ? h('button', {
                type: 'button', className: 'pdr-button', disabled: busyNow, onClick: rollbackLatest,
              }, busy === 'rollback' ? t('action.rollingback') : t('action.rollback')) : null) : null,
            h('div', { className: 'pdr-note' }, t('fix.hint'),
              backups.length
                ? h('span', null, ' ', t('backup.latest') + ': ' + backups[0].id)
                : h('span', null, ' ', t('backup.none')))) : null,

          report ? h('div', { className: 'pdr-card' },
            h('div', { className: 'pdr-title-row' },
              h('span', { className: 'pdr-section-title' }, t('finding.caption') + ' (' + issues.length + ')')),
            h('div', { className: 'pdr-filters' }, filters.map(([value, key]) =>
              h('button', {
                key: value, type: 'button', className: 'pdr-filter',
                'aria-pressed': filter === value ? 'true' : 'false',
                onClick: () => setFilter(value),
              }, t(key)))),
            visibleIssues.length === 0
              ? h('div', { className: 'pdr-note' }, t('finding.none'))
              : visibleIssues.map((issue, index) => h(IssueRow, {
                  key: issue.code + ':' + index,
                  issue,
                  fixable: fixableCodes.has(issue.code),
                })),
          ) : null));
    }

    /** Conversation header button that reveals the Doctor tab. */
    function OpenButton(props) {
      const t = typeof props.t === 'function' ? props.t : fallbackTranslate;
      const open = () => {
        try {
          const service = pluginContext === undefined ? undefined : pluginContext.sidebarRight;
          if (service === undefined) throw new Error('the sidebarRight service is unavailable');
          service.openTab(TAB_KIND);
        } catch (failure) {
          console.error('project-doctor: cannot open the panel', failure);
        }
      };
      return h('button', {
        type: 'button', className: 'pdr-open', title: t('open.tooltip'), 'aria-label': t('open.tooltip'),
        'data-project-doctor-open': '', onClick: open,
      }, h('svg', {
        viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
      },
      h('path', { d: 'M8 2.2 13 4.2v3.4c0 3.1-2.1 5.1-5 6.2-2.9-1.1-5-3.1-5-6.2V4.2z' }),
      h('path', { d: 'M8 5.6v4.4M5.8 7.8h4.4' })));
    }

    /** Client services required by the registrations below. */
    const inject = ['locale', 'sidebarRight', 'sidebarRightTabs', 'slots'];

    function apply(ctx) {
      pluginContext = ctx;
      const t = ctx.locale.bind(NS);
      fallbackTranslate = t;

      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'project-doctor: dictionaries');

      ctx.effect(() => {
        if (typeof document === 'undefined') return undefined;
        const tag = document.createElement('style');
        tag.dataset.plugin = PACKAGE;
        tag.dataset.pluginCss = STYLE_ID;
        tag.textContent = CSS;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'project-doctor: styles');

      ctx.effect(
        () => ctx.sidebarRightTabs.register({
          id: PACKAGE,
          kind: TAB_KIND,
          title: () => t('tab.title'),
          guide: [{
            id: 'open',
            order: 72,
            title: () => t('tab.title'),
            description: () => t('tab.description'),
          }],
        }),
        'project-doctor: sidebar tab type',
      );

      ctx.effect(
        () => ctx.slots.inject('sidebar.right.pane.tab', () =>
          ctx.slots.register({ name: 'sidebar.right.pane.tab', key: PACKAGE, locale: NS }, Panel)),
        'project-doctor: tab body',
      );

      ctx.effect(
        () => ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register({
            name: 'conversation.session.header.utilities', id: OPEN_BUTTON_ID, order: -1, locale: NS,
          }, OpenButton)),
        'project-doctor: header button',
      );
    }

    return { inject, apply };
  },
});
