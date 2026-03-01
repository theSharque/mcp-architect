# MCP Architector

[![npm version](https://img.shields.io/npm/v/mcp-architector.svg)](https://www.npmjs.com/package/mcp-architector)
[![GitHub](https://img.shields.io/github/license/theSharque/mcp-architect)](https://github.com/theSharque/mcp-architect)

> MCP-сервер для архитектуры и системного проектирования

**Local-first MCP сервер** — хранит и управляет архитектурой проекта. Все данные хранятся локально в `~/.mcp-architector` для максимальной конфиденциальности.

📦 **Установка**: `npm install -g mcp-architector` или через npx
🌐 **npm**: https://www.npmjs.com/package/mcp-architector
🔗 **GitHub**: https://github.com/theSharque/mcp-architect

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
    ├── architecture.json      # Общая архитектура
    ├── modules/
    │   ├── {moduleId}.json    # Детали модуля
    │   └── ...
    └── scripts/
        ├── {scriptId}.json    # Документация скрипта
        └── ...
```

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

При вызове инструментов можно:

1. **Автоматический project ID** (из `${workspaceFolder}`): Просто опустите параметр `projectId`
2. **Переопределить при вызове**: Передайте `projectId` явно
3. **По умолчанию**: Если не указано — используется "default-project"

## Инструменты

### set-project-architecture

Создаёт или обновляет общую архитектуру проекта.

**Вход:**
- `projectId` (опц.): ID проекта (по умолчанию "default-project")
- `description`: Описание проекта
- `modules`: Массив модулей с полями `name`, `description`, `inputs`, `outputs`
- `dataFlow` (опц.): Поток данных между модулями

**Выход:** ID проекта и сообщение об успехе

### get-project-architecture

Получает архитектуру проекта.

### set-module-details

Создаёт или обновляет детали модуля.

### get-module-details

Получает детали модуля.

### list-modules

Список всех модулей проекта.

### delete-module

Удаляет модуль из архитектуры.

### set-script-documentation

Документация скрипта или команды.

### get-script-documentation

Получает документацию скрипта.

### list-scripts

Список всех задокументированных скриптов.

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

Приоритет определения project ID:

1. Явно переданный в параметрах (высший)
2. Переменная окружения `MCP_PROJECT_ID`
3. "default-project" (по умолчанию)

## Лицензия

MIT
