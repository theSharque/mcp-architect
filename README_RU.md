# MCP Architector

[![npm version](https://img.shields.io/npm/v/mcp-architector.svg)](https://www.npmjs.com/package/mcp-architector)
[![GitHub](https://img.shields.io/github/license/theSharque/mcp-architect)](https://github.com/theSharque/mcp-architect)

> MCP-сервер для архитектуры и системного проектирования

**Local-first MCP сервер** — хранит и управляет архитектурой проекта. Все данные хранятся локально в `~/.mcp-architector` для максимальной конфиденциальности.

📦 **Установка**: `npm install -g mcp-architector` или через npx
🌐 **npm**: https://www.npmjs.com/package/mcp-architector
🔗 **GitHub**: https://github.com/theSharque/mcp-architect
📜 **Changelog**: [CHANGELOG.md](CHANGELOG.md)

## Как подключить к Claude Desktop / IDE

Добавьте сервер в конфиг MCP. Пример для **claude_desktop_config.json**:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

Для **Cursor IDE**: Settings → Features → Model Context Protocol → Edit Config, затем добавьте тот же блок в `mcpServers`. Подробнее в разделе [Интеграция](#интеграция).

## Cursor rule (рекомендуется)

Для **Cursor IDE** и **Cursor Cloud Agents** используйте пошаговое правило onboarding — чтобы агент не пытался перенести весь репозиторий в architector одним ответом.

1. Скопируйте [`.cursor/rules/architector-onboarding.mdc`](.cursor/rules/architector-onboarding.mdc) в **ваш проект** (репозиторий, который документируете):

   ```bash
   mkdir -p /path/to/your-app/.cursor/rules
   cp /path/to/mcp-architector/.cursor/rules/architector-onboarding.mdc /path/to/your-app/.cursor/rules/
   ```

2. Убедитесь, что MCP Architector подключён. Агент должен вызвать `list-projects` и передавать `projectId` в каждый write — не опускать параметр.

3. В чате, например: *«Onboard this repo into architector — phase 0 plan first»* или *«Импортируй архитектуру в architector по модулям»*.

Правило с **`alwaysApply: false`** — Cursor подключает его, когда задача про import/onboarding архитектуры. Оно задаёт порядок: структура → один модуль за шаг → `validate` после каждого шага → только компактные tools.

Если вы разрабатываете **этот** репозиторий сервера, файл уже лежит здесь — contributors и Cloud Agents используют тот же workflow при обновлении `~/.mcp-architector/_qs_mcp-architector/`.

## Обзор

Хранение и управление архитектурой проекта, модулями, скриптами, потоками данных и примерами использования — всё локально с полной приватностью.

## Возможности

- **Локальное хранение**: Все данные в `~/.mcp-architector` (приватность)
- **Архитектура проекта**: Сохранение и получение общей архитектуры
- **Детали модулей**: Подробная информация о каждом модуле
- **Ресурсы**: Доступ к данным архитектуры через ресурсы

## Структура хранения

```
~/.mcp-architector/
└── {projectId}/
    ├── architecture.json      # Модули + dataFlow (вертикальная структура)
    ├── modules/
    │   ├── {moduleId}.json
    │   └── ...
    ├── entries/
    │   ├── index.json         # Каталог без дублирования тел
    │   └── {entryId}.json     # Канонические факты (API, домен, flows, …)
    ├── slices/
    │   └── {sliceId}.json     # Только фильтры (без items)
```

## Модель данных

| Слой | Назначение | Инструменты |
|------|------------|-------------|
| **Модули** | Вертикальная структура: компоненты, dataFlow | `set-project-architecture`, `set-module-details`, `set-module-data-flow`, `rebuild-data-flow`, `validate-architecture` |
| **Entries** | Единственный источник фактов (один факт = один файл) | `set-entry`, `set-entries`, `get-entry`, `list-entries` |
| **Slices** | Представления над entries (встроенные или свои фильтры) | `list-slices`, `get-slice` |

**Анти-паттерны:** не копировать `module.description` в `entry.summary`; связь через `refs.moduleName`. Срезы не хранят копии items.

**Не редактируйте `~/.mcp-architector` напрямую** — используйте MCP tools, чтобы сохранялись timestamps, merge-семантика и синхронизация inverse для dataFlow.

## Сценарий для агента

1. `list-projects` — найти `projectId` этого workspace (query по имени папки). Передавать его в каждый другой tool. Не опускать. Не использовать `default-project`.
2. Структура → `get-project-architecture` / `set-project-architecture`.
3. **Каждый модуль** → `set-module-details` с `files` + **`facts[]`** (API, entity, glossary) в одном вызове, или `set-entries` / `set-entry` с `refs.moduleName`.
4. Граф одного модуля → `set-module-data-flow`.
5. Массовый пересчёт flow → `rebuild-data-flow`.
6. После правок → `validate` (краткий отчёт и `issues[]`, без загрузки всего проекта).
7. Категория (все API, домен) → `list-slices` → `get-slice`; при `hasMore` — `offset`.
8. Поиск по имени → `search-entries` → `get-entry`.
9. **После рефакторинга кода (модули те же)** → `refactor-architecture`: `scan` → dryRun preview → apply с `confirm=true`.

| Сценарий | Tool |
|----------|------|
| Модуль + его факты | `set-module-details` с `facts[]` |
| Массовые факты | `set-entries` с `moduleName` |
| Patch dataFlow одного модуля | `set-module-data-flow` |
| Пересчитать все рёбра | `rebuild-data-flow` |
| Проверка после правок | `validate` |
| Повреждённый JSON каталога | `fix-data` |
| Синхронизация путей/имён после рефакторинга | `refactor-architecture` (dryRun, затем confirm) |
| Рассинхрон index | `rebuild-entry-index` |
| Проект с нуля | `set-project-architecture` с `replaceModules: true` |
| Onboarding свежего git clone (по фазам) | Скопировать [`.cursor/rules/architector-onboarding.mdc`](.cursor/rules/architector-onboarding.mdc) → попросить агента onboard по шагам |

**Полная картина проекта:** одних модулей недостаточно для slices — без entries с `http-endpoint` срез `api` пуст. Новый модуль → `facts` или entries в том же шаге.

## Быстрый старт

### Для пользователей (через npm)

```bash
# Установка не требуется — используйте прямо в Cursor/Claude Desktop
# Настройте по инструкции в разделе Интеграция ниже
```

### Для разработчиков

1. Клонируйте репозиторий:
```bash
git clone https://github.com/theSharque/mcp-architect.git
cd mcp-architect
```

2. Установите зависимости:
```bash
npm install
```

3. Соберите проект:
```bash
npm run build
```

## Использование

### Режим разработки

С hot reload:
```bash
npm run dev
```

### Production

```bash
npm start
```

### MCP Inspector

Отладка и тестирование:
```bash
npm run inspector
```

## Интеграция

### Cursor IDE

1. Откройте Cursor Settings → Features → Model Context Protocol
2. Нажмите "Edit Config"
3. Добавьте одну из конфигураций ниже

#### Вариант 1: Через npm (рекомендуется)

Устанавливается из npm автоматически:

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

#### Вариант 2: Через npm link (для разработки)

Для локальной разработки с живыми изменениями:

```json
{
  "mcpServers": {
    "architector": {
      "command": "mcp-architector",
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

Требуется: `cd /путь/к/mcp-architector && npm link -g`

#### Вариант 3: Прямой путь

```json
{
  "mcpServers": {
    "architector": {
      "command": "node",
      "args": ["/путь/к/mcp-architector/dist/index.js"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

### Claude Desktop

Редактировать `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

### Continue.dev

Редактировать `.continue/config.json`:

```json
{
  "mcpServers": {
    "architector": {
      "command": "npx",
      "args": ["-y", "mcp-architector"],
      "env": {
        "MCP_PROJECT_ID": "${workspaceFolder}"
      }
    }
  }
}
```

### Project ID

`projectId` **обязателен** для всех tools кроме `list-projects`. Общего dump-проекта нет.

1. **Сначала `list-projects`** (опционально `query` = имя папки workspace)
2. **Передайте найденный `projectId`** в каждый другой tool
3. Если совпадения нет — создайте проект через `set-project-architecture` со стабильным id из пути workspace (например `_qs_my-app`)

`MCP_PROJECT_ID` — только подсказка (`isCurrent` / `suggestedProjectId`), не молчаливый target записи. `default-project` и неподставленный `${workspaceFolder}` запрещены.

## Инструменты

### set-project-architecture

Создаёт или обновляет общую архитектуру проекта. **По умолчанию merge** modules и dataFlow по имени; omit `dataFlow` сохраняет существующий flow. `dependsOn` — канон; `providesTo` пересчитывается при сохранении.

**Вход:**
- `projectId` (обяз.): ID проекта из `list-projects`. Не опускать. `default-project` запрещён.
- `description`: Описание проекта
- `modules`: Массив модулей с полями `name`, `description`, `inputs`, `outputs`
- `dataFlow` (опц.): Поток данных между модулями (omit — сохранить существующий)
- `replaceModules` (опц.): Полная замена списка модулей (default `false` = merge)
- `replaceDataFlow` (опц.): Полная замена dataFlow (default `false` = merge)

**Выход:** ID проекта и сообщение об успехе

### get-project-architecture

Получает архитектуру проекта.

### list-projects

Список всех проектов в локальном хранилище (`~/.mcp-architector`). **Вызывать первым.** Сопоставить workspace по имени папки, затем передавать `projectId` в каждый другой tool.

**Вход:**
- `query` (опц.): Фильтр по подстроке в projectId или description (без учёта регистра)

**Выход:**
- `projects[]`: `projectId`, `description`, `moduleCount`, `updatedAt`, `isCurrent` (подсказка из `MCP_PROJECT_ID`), `forbidden` (`default-project` и неподставленный workspaceFolder)
- `suggestedProjectId`: текущий `MCP_PROJECT_ID`, если это валидный id, иначе `null`
- `reminder`: всегда передавать `projectId`; не использовать `default-project`

### Entries и slices

| Tool | Назначение |
|------|------------|
| `set-entry` | Upsert факта; в ответе `reminder`, если нет модулей или нет `refs.moduleName` |
| `set-entries` | Массовый upsert (до 200); `moduleName` проставляет `refs.moduleName` |
| `get-entry` | Полная entry по `id` |
| `delete-entry` | Удаление |
| `list-entries` | Каталог без payload |
| `search-entries` | Поиск по тексту |
| `list-slices` | Встроенные и custom срезы |
| `get-slice` | Срез: `sliceId`, `format`, `query`, `limit`, `offset`, `hasMore` |
| `set-slice` / `delete-slice` | Custom фильтр (без items) |
| `rebuild-entry-index` | Пересборка `entries/index.json` |
| `fix-data` | Починка битого JSON каталога; пересборка index |

**Встроенные sliceId:** `api`, `persistence`, `events`, `domain`, `flows`, `integrations`, `config`, `runtime`, `decisions`, `scripts`.

Команды: `set-entry` с `kind=script` или `get-slice sliceId=scripts`. При первом обращении к entries старая папка `scripts/` мигрируется и удаляется.

### set-module-details

Создаёт или обновляет детали модуля. Срезы читают **entries**, не текст модуля — передавайте `facts[]` для API/домена в том же вызове. При `dependencies` синхронизирует `dataFlow.dependsOn`.

### set-module-data-flow

Patch `dataFlow` одного модуля: `moduleName`, `dependsOn`, `dataTransformation`, `syncInverse`.

### rebuild-data-flow

Пересборка `dataFlow` для всех модулей из `dependencies` в module files или из `dependsOn`. Замена массовой правки `architecture.json`.

**Вход:** `source` (`module-dependencies` | `dataFlow-dependsOn`), `syncInverse`, `pruneOrphans`.

**Выход:** `edgesAdded`, `edgesRemoved`, `modulesUpdated`.

### validate

**Главная проверка после правок.** Read-only отчёт для агента: `summary`, `stats`, `issuesByKind`, `issues[]` — не нужно тянуть весь проект.

**Проверяет:** dataFlow, связь модуль↔entry, файлы модулей, рассинхрон index, пустые срезы api/domain/persistence.

**Выход:** `valid`, `issueCount`, `summary`, `coverage`, `checksRun`.

### fix-data

Запускать, если JSON каталога повреждён (`list-modules` / `validate` падают с extra data after JSON). Обрезает хвост после первого валидного объекта в `architecture.json`, `modules/`, `entries/`, `slices/`; удаляет `.tmp`; пересобирает index. Факты не удаляет. Запись каталога идёт через temp+rename, чтобы хвост больше не появлялся.

**Вход:** `projectId`, `dryRun` (опц., по умолчанию `false`)

**Выход:** `summary`, `scanned`, `repaired`, `unreadable`, `tmpRemoved`, `indexItemCount`, `files[]`

### refactor-architecture

Preview или apply синхронизации architector после рефакторинга кода, когда границы модулей не меняются. Источник правды — только агент; доступа к workspace и git нет. По умолчанию `dryRun=true`.

**Workflow:** (1) `scan` с `file` или `text` → компактные hits, (2) собрать mutation ops, (3) dryRun preview, (4) apply с `dryRun=false` и `confirm=true`.

**Операции (max 10 за вызов):** `scan`, `move-file`, `replace-path-prefix`, `rename-text`, `patch-entry`, `merge-files`, `remove-file-ref`.

**Scope (опц.):** `moduleName`, `kinds`, `tags` — ограничивает, какие entries/modules затрагиваются.

Orphan entries с пустым `refs.files` и без `refs.entryIds` удаляются после file-операций.

**Вход:** `projectId`, `operations[]`, `scope`, `dryRun` (default `true`), `confirm` (обязателен при apply), `limit`, `offset`

**Выход:** `summary`, `stats`, `hits` (scan) или paginated `changes`, `warnings`, `hasMore`

### validate-architecture

То же, что `validate` (алиас). Предпочтительно вызывать `validate`.

### get-module-details

Получает детали модуля.

### list-modules

Список всех модулей проекта.

### delete-module

Удаляет модуль из архитектуры.

## Ресурсы

### architecture

Доступ к архитектуре проекта. URI: `arch://{projectId}`

### module

Доступ к деталям модуля. URI: `module://{projectId}/{moduleId}`

## Разработка

### Структура проекта

```
mcp-architector/
├── src/
│   ├── index.ts
│   ├── types.ts
│   └── storage.ts
├── dist/
├── package.json
├── tsconfig.json
└── README.md
```

### Project ID

Данные лежат в `~/.mcp-architector/{projectId}/`. `projectId` нужно передавать явно в каждый tool кроме `list-projects`.

- Сначала `list-projects` (`query` = имя папки workspace)
- `MCP_PROJECT_ID` — только подсказка в listing (`isCurrent` / `suggestedProjectId`), не молчаливый target записи
- `default-project` и неподставленный `${workspaceFolder}` запрещены

Новый проект: передайте стабильный id из пути workspace (например `_qs_my-app`) в `set-project-architecture`.

## Лицензия

MIT
