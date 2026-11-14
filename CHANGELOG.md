# Changelog

## 0.3.1

Fixes
- Primary buttons were white-on-white in the dark theme: the panel used
  `button-primary-fill` with `label-on-color`, which are the same near-white in that
  theme. **Fix selected** and **Scan** now use the accent fill with the on-colour label
  and keep their contrast in both themes.

Docs
- The README shows a real screenshot of the panel (`docs/panel.png`) instead of an
  illustration.

## 0.3.0

New
- Right-sidebar panel: tab type with a guide card and a header button, score ring,
  severity counters, stack chips, findings with filters, fix checkboxes, Fix selected,
  Roll back, and a remembered project path.
- Panel API on the Host web server (`/project-doctor/api/{scan,fix,backups,rollback}`),
  guarded by a custom request header and a same-origin check.
- Safe fixes with automatic backups: `gitignore`, `readme`, `license`, `engines`,
  `test-script`, `package-name`.
- `.dsh-doctor/backups/<id>/` with a manifest (paths, kinds, sha256 before/after),
  rollback that restores modified files and deletes created ones, and pruning to 20
  sessions.
- `project_doctor` actions: `audit`, `fix`, `backups`, `rollback`; canonical JSON output
  with a Markdown renderer; `json` format still available.
- Version gate fixed: `engines.dsh >=0.2.0 <0.3.0` and the matching
  `@deepseek-ai/dsh-tools` peer range replace the 0.1.x-only range that made DSH 0.2.2
  refuse the bundle.
- Display metadata without `meta.detail`, so the bundle page shows this README instead of
  a text document pretending to be an image preview.

Fixes
- `.gitignore` parsing now strips a UTF-8 BOM, so a file written by PowerShell 5.1 no
  longer loses its first pattern.
- The audit skips `.dsh-doctor`, so its own backups never appear as findings.

## 0.2.0

- First released audit: package.json, scripts, lockfiles, README/LICENSE, real
  `.gitignore` matching, exposed env and key files by name, large files, health score,
  English and Russian reports, JSON output, translation catalogue.

## 0.1.0

- Initial audit tool.
