# Contributing

Thanks for taking a look. The project is small and has no build step: every runtime file
is plain ESM JavaScript.

## Set up

```bash
git clone https://github.com/Phikec/dsh-ai-project-doctor.git
cd dsh-ai-project-doctor
node --test
```

Node.js 20 or newer. There are no dependencies to install; tests use the Node test
runner and temporary directories only.

## Change a check or a fix

- **A finding** starts in `audit.js` as an `issue(severity, code, params, file)` and needs
  a wording entry for `en` and `ru` in `messages.js`. Keep the code stable: it is part of
  the panel filter and of the fix plan.
- **A fix** lives in `fix.js`: add the id to `FIX_ORDER`, map its issue codes in
  `FIX_CODES`, implement it with `writeTracked()` so the file is backed up, and add its
  label to `MESSAGES.en.fixes` and `MESSAGES.ru.fixes`. A fix must be idempotent and
  report `skipped` when there is nothing to do.
- **A panel change** lives in `client.js`. It must keep working without a session, use
  the `--dsw-alias-*` theme tokens instead of literal colours, and leave the Host as the
  only place that touches the filesystem.

## Tests

- `test/audit.test.js` — scan behaviour on temporary projects.
- `test/fix.test.js` — fixes, backups, rollback, refusals.
- `test/server.test.js` — the panel API contract.
- `test/tool.test.js` — the `project_doctor` definition.
- `test/client.test.js` — the panel component rendered against the real API handler.

Every change that touches behaviour should leave `node --test` green. For a change to
what the panel shows, describe what you verified in the pull request; the panel rendering
itself needs a real browser.

## Pull requests

Keep a pull request focused. Update `CHANGELOG.md` under an "Unreleased" heading when the
change is user-visible, and mention the DeepSeek Harness version you tested against.
