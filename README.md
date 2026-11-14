# AI Project Doctor

**Diagnose a project, see what is wrong, and fix it — with a backup of every file the doctor touches.**

A bundle for [DeepSeek Harness](https://github.com/deepseek-ai/dsh): a **Doctor** panel in the Web client and a `project_doctor` agent tool that share one implementation.

[![CI](https://github.com/Phikec/dsh-ai-project-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/Phikec/dsh-ai-project-doctor/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![DSH](https://img.shields.io/badge/dsh-0.2.x-6C72FF)](https://github.com/deepseek-ai/dsh)

![The Doctor panel beside a conversation](docs/panel-preview.svg)

## What it does

- **Audits** a project directory without changing it: `package.json` and its scripts, lockfiles, README, LICENSE, `engines`, dependency hygiene, a real `.gitignore` matcher, exposed `.env` and key files by name, large files, a stack detection pass, and a 0–100 health score.
- **Repairs** the fixable findings only when asked. Before any write, every affected file is copied to `.dsh-doctor/backups/<id>/`, and the panel or the tool can roll the whole session back.
- **Explains** every finding in English or Russian, with the file, the code, and what to do about it.

The panel does not need a session and spends no model tokens. The agent tool reaches the same operations, so you can ask for a scan or a fix in a conversation.

## The panel

Open **Doctor** in the right sidebar — the guide card, or the shield button in the conversation header.

- health ring, error / warning / note counters, detected stack, file count;
- findings with filters: all, errors, warnings, notes, fixable;
- suggested fixes with checkboxes, **Fix selected**, and **Roll back**;
- the last project path is remembered between sessions.

The panel reads and writes through the Host over `/project-doctor/api/*` on the same web server that serves the page.

## Install

Requires **DeepSeek Harness 0.2.x** (`engines.dsh` is checked at install time). No build step and no install scripts: every runtime file is plain ESM.

### From GitHub

```sh
dsh plugin --profile <profile> add github:Phikec/dsh-ai-project-doctor
```

### From a local checkout

```sh
git clone https://github.com/Phikec/dsh-ai-project-doctor.git
```

Then, in DSH: **Plugins** → **Add plugin** → select the cloned folder. The bundle appears as
`dsh-ai-project-doctor`; enable it and start a new session.

## Use the tool

| Parameter | Description |
|---|---|
| `project_path` | Absolute path to the project directory (required) |
| `action` | `audit` (default), `fix`, `backups`, `rollback` |
| `fixes` | Fix ids for `action: fix`, for example `["gitignore", "readme"]` |
| `backup_id` | Backup to restore; omit to restore the newest |
| `max_files` | 50–5000, default 1500 |
| `language` | `en` (default) or `ru` |
| `format` | `markdown` (default) or `json` |

`action: fix` without `fixes` lists the candidates and changes nothing.

```
Run project_doctor on C:\projects\my-app
```

```
Apply the gitignore and readme fixes to C:\projects\my-app
```

```
Roll back the last project_doctor backup for C:\projects\my-app
```

## What it checks

| Area | Findings |
|---|---|
| Manifest | invalid `package.json`, missing name, scripts, `engines`, LICENSE, test script |
| Scripts | undeclared tools (`vite`, `tsc`, `eslint`, …), missing script and `main`/`bin` targets |
| Dependencies | unpinned versions, duplicates, lockfile presence, multiple lockfiles, `packageManager` mismatch |
| Repository | missing `.gitignore`, `node_modules` / build output not ignored, missing README or LICENSE |
| Secrets | `.env*` and key/credential files that are not ignored — names only, never contents |
| Hygiene | files over 25 MB, Python files without a manifest, `tsconfig.json` parse check |

`node_modules`, build output, `.git`, and the doctor's own `.dsh-doctor/` are skipped; the walk is breadth-first, bounded by `max_files`, and deterministic.

## Fixes

| Id | Repairs |
|---|---|
| `gitignore` | creates or extends `.gitignore`; existing lines are preserved |
| `readme` | writes a short `README.md` skeleton |
| `license` | writes an MIT `LICENSE` using the author from `package.json` |
| `engines` | adds `"engines": { "node": ">=20" }` |
| `test-script` | adds `"test": "node --test"` |
| `package-name` | sets a package name derived from the directory |

Fixes are idempotent: a fix whose problem is already solved reports `skipped` and writes nothing. Lockfiles, dependency versions, missing build output, and exposed secrets are never changed automatically — the report explains what to do instead.

## Backups and rollback

```
<project>/.dsh-doctor/backups/<timestamp-id>/
├── manifest.json          # id, project, createdAt, entries with kind and sha256
└── files/…                # copies of every modified file
```

**Roll back** restores modified files byte for byte and deletes the files a fix created. The newest 20 sessions are kept; `.dsh-doctor/` is added to `.gitignore` by the `gitignore` fix and is never scanned.

## Safety

- Writes only inside the project: every target path is resolved and checked against the project root, and symbolic links are not followed.
- Never runs shell commands, never installs packages, never reads `.env` contents.
- The panel API requires the `x-project-doctor` request header and refuses a cross-origin `Origin`, so another page cannot drive a fix with a simple form post.
- The audit is heuristic. It is not a build, a test run, a security scanner, or a code review, and the score is a summary rather than a guarantee.

## Development

| File | Role |
|---|---|
| `index.js` | Host entry: registers the tool and the panel API route |
| `tool.js` | `project_doctor` definition (`defineTool` from `@deepseek-ai/dsh-tools`) |
| `audit.js` | scan engine |
| `fix.js` | fixes, backups, rollback |
| `server.js` | panel API handlers |
| `client.js` | right-sidebar panel (Client module) |
| `locale/` | display metadata for the Plugins page |

```sh
node --test
```

32 tests cover the scan engine, the fixes and their rollback, the API contract, the tool definition, and the panel component rendered against the real API handler. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT © [Phikec](https://github.com/Phikec). See [LICENSE](LICENSE).
