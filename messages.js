// Report text catalog. Issues carry a code + params; wording lives here (en / ru).

const list = (a) => a.join(', ')

export const MESSAGES = {
  en: {
    ui: {
      project: 'Project', files: 'Files inspected', truncated: 'scan truncated', inventory: 'Inventory',
      docsWord: 'documentation files', findings: 'Findings', errors: 'errors', warnings: 'warnings', notes: 'notes',
      score: 'Health score', stack: 'Detected', topLevel: 'Top level', none: 'none',
      footer: 'Read-only scan. No files were changed, no shell commands were executed, .env contents were never read.',
      cancelled: 'The scan was cancelled.',
      fixesHeading: 'Suggested fixes', fixesLine: 'Fixable checks',
      backup: 'Backup', backupCreated: 'Backup created',
      fixApplied: 'applied', fixSkipped: 'skipped', fixFailed: 'failed',
      backupList: 'Backups', rollback: 'Rollback', rolledBack: 'Rolled back',
      restoredFiles: 'Restored files', deletedFiles: 'Deleted created files', noBackups: 'No backups yet.',
      fixHint: 'Every change is written only inside the project and copied to .dsh-doctor/backups first.',
    },
    issues: {
      PACKAGE_TOO_LARGE: () => ['package.json could not be read', 'The file is larger than the 1 MiB inspection limit.'],
      INVALID_PACKAGE_JSON: () => ['Invalid package.json', 'The root package.json is not valid JSON.'],
      README_MISSING: () => ['Project README is missing', 'Add a README with setup, run, test, and build instructions.'],
      GITIGNORE_MISSING: () => ['.gitignore is missing', 'Generated files, dependencies, build output, and local secrets may be committed accidentally.'],
      ENV_NOT_IGNORED: (p) => ['Environment files may not be ignored', `Found ${list(p.files)} not excluded by .gitignore. Contents were not read. Add the pattern (for example ".env*" plus "!.env.example") and rotate any secrets that were already committed.`],
      SENSITIVE_FILE: (p) => ['Possible secret or key file is not ignored', `File names look like keys or credentials: ${list(p.files)}. Contents were not read. Make sure they are not committed.`],
      NODE_MODULES_NOT_IGNORED: () => ['node_modules is not ignored', 'A package.json exists, but .gitignore does not exclude node_modules.'],
      BUILD_NOT_IGNORED: (p) => ['Build output is not ignored', `Directory ${list(p.dirs)} exists but is not excluded by .gitignore.`],
      LARGE_FILE: (p) => ['Very large files in the project', `Files over ${p.limitMb} MB: ${list(p.files)}. Consider Git LFS or keeping them out of the repository.`],
      PACKAGE_NAME_MISSING: () => ['Package name is missing', 'Add a name field to make the package easier to identify.'],
      SCRIPTS_MISSING: () => ['No npm scripts found', 'Consider adding standard scripts such as dev, build, and test where applicable.'],
      TEST_SCRIPT_MISSING: () => ['No real test script', 'There is no "test" script or it is the npm placeholder. Add one so CI and agents can verify changes.'],
      SCRIPT_DEPENDENCY_MISSING: (p) => [`Script may require undeclared ${p.bin}`, `The "${p.script}" script invokes ${p.bin}, but ${p.pkg} is absent from dependencies and devDependencies.`],
      SCRIPT_FILE_MISSING: (p) => ['Script points to a missing file', `The "${p.script}" script runs ${p.target}, but that file does not exist.`],
      ENTRY_MISSING: (p) => [`Declared ${p.field} file is missing`, `package.json ${p.field} points to ${p.target}, which does not exist${p.built ? ' (it may be produced by a build step)' : ''}.`],
      MULTIPLE_LOCKFILES: (p) => ['Multiple package-manager lockfiles found', `Found: ${list(p.files)}. Keep the lockfile for the package manager used by this project.`],
      LOCKFILE_MISMATCH: (p) => ['packageManager and lockfile do not match', `package.json declares ${p.manager}, but ${p.expected} was not found.`],
      LOCKFILE_MISSING: () => ['No lockfile', 'The project has dependencies but no lockfile, so installs are not reproducible.'],
      LOOSE_DEPENDENCY_VERSION: (p) => ['Unpinned dependency versions', `These use "*", "latest" or an empty range: ${list(p.names)}.`],
      DUPLICATE_DEPENDENCY: (p) => ['Dependency declared twice', `Listed in both dependencies and devDependencies: ${list(p.names)}.`],
      ENGINES_MISSING: () => ['No "engines" field', 'Declare the supported Node.js version so contributors and CI use a compatible runtime.'],
      LICENSE_MISSING: () => ['No license', 'Add a LICENSE file or a "license" field if the project will be shared.'],
      PY_MANIFEST_MISSING: () => ['Python files without a dependency manifest', 'Add requirements.txt or pyproject.toml so the environment can be recreated.'],
      TSCONFIG_PARSE: () => ['tsconfig.json may contain invalid JSON', 'The basic JSON check failed. TypeScript config files may use comments and trailing commas; verify with the TypeScript compiler.'],
      SCAN_TRUNCATED: (p) => ['File scan reached its limit', `Inspected the first ${p.count} files. Increase max_files (up to ${p.hard}) for a broader inventory.`],
      NO_COMMON_ISSUES: () => ['No common configuration issues detected', 'This is a lightweight static check, not a full build, test, security, or code-quality audit.'],
    },
    fixes: {
      gitignore: ['Add or extend .gitignore', 'Creates or completes .gitignore with dependency, build, environment, and backup patterns. Existing lines are preserved.'],
      readme: ['Create README.md', 'Writes a short README skeleton with overview, usage, and scripts sections.'],
      license: ['Create LICENSE', 'Writes an MIT license using the package author or the directory name as the holder.'],
      engines: ['Declare Node.js engines', 'Adds "engines": { "node": ">=20" } to package.json.'],
      'test-script': ['Add a test script', 'Adds "test": "node --test" so CI and agents can run tests.'],
      'package-name': ['Set the package name', 'Adds a name derived from the directory to package.json.'],
    },
  },
  ru: {
    ui: {
      project: 'Проект', files: 'Проверено файлов', truncated: 'сканирование обрезано', inventory: 'Состав',
      docsWord: 'файлов документации', findings: 'Находки', errors: 'ошибок', warnings: 'предупреждений', notes: 'заметок',
      score: 'Оценка здоровья', stack: 'Определено', topLevel: 'Корень', none: 'нет',
      footer: 'Только чтение. Файлы не менялись, команды не запускались, содержимое .env не читалось.',
      cancelled: 'Сканирование отменено.',
      fixesHeading: 'Предлагаемые исправления', fixesLine: 'Исправимо проверок',
      backup: 'Бэкап', backupCreated: 'Бэкап создан',
      fixApplied: 'выполнено', fixSkipped: 'пропущено', fixFailed: 'ошибка',
      backupList: 'Бэкапы', rollback: 'Откат', rolledBack: 'Откат выполнен',
      restoredFiles: 'Восстановлено файлов', deletedFiles: 'Удалено созданных файлов', noBackups: 'Бэкапов пока нет.',
      fixHint: 'Любое изменение пишется только внутри проекта и сначала копируется в .dsh-doctor/backups.',
    },
    issues: {
      PACKAGE_TOO_LARGE: () => ['Не удалось прочитать package.json', 'Файл больше лимита проверки в 1 МиБ.'],
      INVALID_PACKAGE_JSON: () => ['Некорректный package.json', 'Корневой package.json не является валидным JSON.'],
      README_MISSING: () => ['Нет README', 'Добавьте README с инструкциями по установке, запуску, тестам и сборке.'],
      GITIGNORE_MISSING: () => ['Нет .gitignore', 'Сгенерированные файлы, зависимости, сборки и локальные секреты могут случайно попасть в репозиторий.'],
      ENV_NOT_IGNORED: (p) => ['Файлы окружения могут не игнорироваться', `Найдены ${list(p.files)}, не исключённые в .gitignore. Содержимое не читалось. Добавьте правило (например ".env*" и "!.env.example") и смените секреты, если они уже были закоммичены.`],
      SENSITIVE_FILE: (p) => ['Возможный файл с ключом или секретом не игнорируется', `Имена похожи на ключи или учётные данные: ${list(p.files)}. Содержимое не читалось. Убедитесь, что они не попадут в репозиторий.`],
      NODE_MODULES_NOT_IGNORED: () => ['node_modules не игнорируется', 'Есть package.json, но .gitignore не исключает node_modules.'],
      BUILD_NOT_IGNORED: (p) => ['Результат сборки не игнорируется', `Папка ${list(p.dirs)} существует, но не исключена в .gitignore.`],
      LARGE_FILE: (p) => ['В проекте очень большие файлы', `Файлы больше ${p.limitMb} МБ: ${list(p.files)}. Подумайте о Git LFS или вынесите их из репозитория.`],
      PACKAGE_NAME_MISSING: () => ['Не указано имя пакета', 'Добавьте поле name, чтобы пакет было проще идентифицировать.'],
      SCRIPTS_MISSING: () => ['Нет npm-скриптов', 'Добавьте стандартные скрипты: dev, build, test (где применимо).'],
      TEST_SCRIPT_MISSING: () => ['Нет настоящего скрипта test', 'Скрипт "test" отсутствует или это заглушка npm. Добавьте его, чтобы CI и агенты могли проверять изменения.'],
      SCRIPT_DEPENDENCY_MISSING: (p) => [`Скрипту может не хватать ${p.bin}`, `Скрипт "${p.script}" вызывает ${p.bin}, но ${p.pkg} нет в dependencies и devDependencies.`],
      SCRIPT_FILE_MISSING: (p) => ['Скрипт ссылается на отсутствующий файл', `Скрипт "${p.script}" запускает ${p.target}, но такого файла нет.`],
      ENTRY_MISSING: (p) => [`Файл из поля ${p.field} отсутствует`, `Поле ${p.field} в package.json указывает на ${p.target}, но файла нет${p.built ? ' (возможно, его создаёт сборка)' : ''}.`],
      MULTIPLE_LOCKFILES: (p) => ['Несколько lock-файлов разных менеджеров', `Найдены: ${list(p.files)}. Оставьте lock-файл того менеджера, который используется в проекте.`],
      LOCKFILE_MISMATCH: (p) => ['packageManager не совпадает с lock-файлом', `В package.json указан ${p.manager}, но ${p.expected} не найден.`],
      LOCKFILE_MISSING: () => ['Нет lock-файла', 'У проекта есть зависимости, но нет lock-файла — установки невоспроизводимы.'],
      LOOSE_DEPENDENCY_VERSION: (p) => ['Незафиксированные версии зависимостей', `Используют "*", "latest" или пустой диапазон: ${list(p.names)}.`],
      DUPLICATE_DEPENDENCY: (p) => ['Зависимость объявлена дважды', `Есть и в dependencies, и в devDependencies: ${list(p.names)}.`],
      ENGINES_MISSING: () => ['Нет поля "engines"', 'Укажите поддерживаемую версию Node.js, чтобы разработчики и CI использовали подходящую среду.'],
      LICENSE_MISSING: () => ['Нет лицензии', 'Добавьте файл LICENSE или поле "license", если проект будут распространять.'],
      PY_MANIFEST_MISSING: () => ['Python-файлы без манифеста зависимостей', 'Добавьте requirements.txt или pyproject.toml, чтобы окружение можно было воссоздать.'],
      TSCONFIG_PARSE: () => ['tsconfig.json может быть некорректным', 'Простая JSON-проверка не прошла. В конфигах TypeScript допустимы комментарии и висячие запятые — проверьте компилятором.'],
      SCAN_TRUNCATED: (p) => ['Сканирование достигло лимита', `Проверены первые ${p.count} файлов. Увеличьте max_files (до ${p.hard}) для более полного списка.`],
      NO_COMMON_ISSUES: () => ['Типичных проблем конфигурации не найдено', 'Это лёгкая статическая проверка, а не полный аудит сборки, тестов, безопасности или качества кода.'],
    },
    fixes: {
      gitignore: ['Дополнить .gitignore', 'Создаёт или дополняет .gitignore правилами для зависимостей, сборок, окружения и бэкапов. Существующие строки сохраняются.'],
      readme: ['Создать README.md', 'Пишет короткий каркас README с разделами обзора, запуска и скриптов.'],
      license: ['Создать LICENSE', 'Пишет лицензию MIT, используя автора из package.json или имя папки.'],
      engines: ['Указать engines для Node.js', 'Добавляет "engines": { "node": ">=20" } в package.json.'],
      'test-script': ['Добавить скрипт test', 'Добавляет "test": "node --test", чтобы CI и агенты могли запускать тесты.'],
      'package-name': ['Задать имя пакета', 'Добавляет в package.json имя, производное от имени папки.'],
    },
  },
}

export function pickLanguage(value) {
  const v = String(value || '').toLowerCase()
  return v.startsWith('ru') ? 'ru' : 'en'
}

/** Localized [title, detail] of one fix id. */
export function fixText(language, id) {
  const catalog = MESSAGES[pickLanguage(language)].fixes[id]
  return catalog === undefined ? [id, ''] : catalog
}
