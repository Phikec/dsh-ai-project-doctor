# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub:
**Security** → **Report a vulnerability** on
[the repository](https://github.com/Phikec/dsh-ai-project-doctor/security/advisories/new).

Do not open a public issue for a vulnerability. Include the DeepSeek Harness version,
the affected file or endpoint, and a minimal reproduction.

## Scope

The plugin reads files inside a project directory and can write to it when you ask for
fixes. Reports that matter most:

- a write that escapes the project directory, including through a symbolic link;
- a request that reaches `/project-doctor/api/*` from another origin, or without the
  `x-project-doctor` header;
- reading `.env` contents or secrets that the report claims not to read;
- executing a shell command or a script from the project.

Backups are plain copies inside the project (`<project>/.dsh-doctor/backups/`), and the
doctor never uploads project data anywhere.
