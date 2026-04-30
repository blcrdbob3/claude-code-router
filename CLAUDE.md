# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Code Router is a tool that routes Claude Code requests to different LLM providers. Monorepo with five packages:

- **cli** (`@CCR/cli`): Command-line tool providing the `ccr` command
- **core** (`@musistudio/llms`): Routing logic, transformers, token calculation (external dep)
- **server** (`@CCR/server`): Core server handling API routing and transformations
- **shared** (`@CCR/shared`): Shared constants, utilities, and preset management
- **ui** (`@CCR/ui`): Web management interface (React + Vite)

## Build Commands

### Build all packages
```bash
pnpm build
```

### Build individual packages
```bash
pnpm build:shared    # Uses build-shared.js (esbuild)
pnpm build:core      # Builds @musistudio/llms external dep
pnpm build:server    # esbuild server
pnpm build:cli       # esbuild CLI
pnpm build:ui        # tsc -b && vite build
```

### Development mode
```bash
pnpm dev:cli        # ts-node CLI dev
pnpm dev:server      # ts-node Server dev
pnpm dev:ui          # Vite UI dev
```

### Lint
```bash
pnpm lint           # Root + all packages
pnpm lint:packages   # Packages only
```

## TypeScript

- Root tsconfig.json extends tsconfig.base.json (ES2022, CommonJS, strict)
- Each package has its own tsconfig.json for its specific settings
- UI package uses ESM (vite.config.ts + tsconfig.json with module: ESNext)
- Type definitions for external @musistudio/llms in `packages/server/src/types.d.ts`

## Testing

No test framework configured. Manual verification via:
```bash
pnpm build && pnpm dev:server   # Test server
ccr start && ccr status          # Verify CLI
```

## Core Architecture

### Routing Logic

Determines which model handles a request:

1. **Custom router** (`CUSTOM_ROUTER_PATH`) — custom JS function
2. **Project-level** — `~/.claude/projects/<project-id>/claude-code-router.json`
3. **Built-in scenarios**: `background`, `think` (Plan Mode/thinking), `longContext` (exceeds threshold), `webSearch`

Token estimation: `tiktoken` (cl100k_base) to count request tokens.

### Transformer System (`@musistudio/llms`)

Adapts request/response for different provider APIs. Chained via `transformer.use` config:

- `anthropic`, `deepseek`, `gemini`, `openrouter`, `groq` — provider adapters
- `maxtoken`, `tooluse`, `reasoning`, `enhancetool`, `cleancache`, `sampling` — modifiers
- Custom transformers: load via `transformers[]` in config.json

### Agent System (`packages/server/src/agents/`)

Pluggable modules intercept requests/responses:

- `shouldHandle` — detect if agent should act
- `reqHandler` — modify request before sending
- `tools` — add custom tool definitions

Flow: preHandler hook → add tools → onSend intercept → execute → stream back.

### SSE Stream Processing

Custom Transform streams handle Server-Sent Events:
- `SSEParserTransform` — parse SSE text → event objects
- `SSESerializerTransform` — event objects → SSE text
- `rewriteStream` — intercept/modify stream data

### Configuration

`~/.claude-code-router/config.json` (JSON5, supports comments):

```json
{
  "Providers": [...],      // API providers + models
  "Router": {...},          // default, background, think, longContext
  "transformers": [...],    // custom transformer plugins
  "CUSTOM_ROUTER_PATH": "..." // custom routing JS
}
```

- Environment variable interpolation: `$VAR_NAME` or `${VAR_NAME}`
- API keys use env vars: `"api_key": "$OPENAI_API_KEY"`
- Hot reload: `ccr restart` (NOT `ccr stop` then start)

### Logging

Two separate logs:
- **Server logs** (pino): `~/.claude-code-router/logs/ccr-*.log` — HTTP requests, API calls, events
- **App logs**: `~/.claude-code-router/claude-code-router.log` — routing decisions, business logic

Set via `LOG_LEVEL` env var: `fatal`, `error`, `warn`, `info`, `debug`, `trace`.

## CLI Commands

**Important**: Never use `ccr stop`. Always use `ccr restart` to reload after changes.

```bash
ccr start      # Start server
ccr restart    # Restart server (ALWAYS use instead of stop + start)
ccr status     # Show status
ccr code       # Execute claude command
ccr model      # Interactive model selection and configuration
ccr preset     # Manage presets (export, install, list, info, delete)
ccr activate   # Output shell environment variables (for integration)
ccr ui         # Open Web UI
ccr statusline # Integrated statusline (reads JSON from stdin)
```

### Local Installation

```bash
ln -s /PATH/TO/claude-code-router/packages/cli/dist/cli.js ~/.local/bin/ccr
```

### Preset Commands

```bash
ccr preset export <name>      # Export current configuration as a preset
ccr preset install <source>   # Install a preset from file, URL, or name
ccr preset list               # List all installed presets
ccr preset info <name>        # Show preset information
ccr preset delete <name>      # Delete a preset
```

## Subagent Routing

Use special tags in subagent prompts to specify models:
```
<CCR-SUBAGENT-MODEL>provider,model</CCR-SUBAGENT-MODEL>
Please help me analyze this code...
```

## Preset System

The preset system allows users to save, share, and reuse configurations easily.

### Preset Structure

Presets are stored in `~/.claude-code-router/presets/<preset-name>/manifest.json`

Each preset contains:
- **Metadata**: name, version, description, author, keywords, etc.
- **Configuration**: Providers, Router, transformers, and other settings
- **Dynamic Schema** (optional): Input fields for collecting required information during installation
- **Required Inputs** (optional): Fields that need to be filled during installation (e.g., API keys)

### Core Functions

Located in `packages/shared/src/preset/`:

- **export.ts**: Export current configuration as a preset directory
  - `exportPreset(presetName, config, options)`: Creates preset directory with manifest.json
  - Automatically sanitizes sensitive data (api_key fields become `{{field}}` placeholders)

- **install.ts**: Install and manage presets
  - `installPreset(preset, config, options)`: Install preset to config
  - `loadPreset(source)`: Load preset from directory
  - `listPresets()`: List all installed presets
  - `isPresetInstalled(presetName)`: Check if preset is installed
  - `validatePreset(preset)`: Validate preset structure

- **merge.ts**: Merge preset configuration with existing config
  - Handles conflicts using different strategies (ask, overwrite, merge, skip)

- **sensitiveFields.ts**: Identify and sanitize sensitive fields
  - Detects api_key, password, secret fields automatically
  - Replaces sensitive values with environment variable placeholders

### Preset File Format

**manifest.json** (in preset directory):
```json
{
  "name": "my-preset",
  "version": "1.0.0",
  "description": "My configuration",
  "author": "Author Name",
  "keywords": ["openai", "production"],
  "Providers": [...],
  "Router": {...},
  "schema": [
    {
      "id": "apiKey",
      "type": "password",
      "label": "OpenAI API Key",
      "prompt": "Enter your OpenAI API key"
    }
  ]
}
```

### CLI Integration

The CLI layer (`packages/cli/src/utils/preset/`) handles:
- User interaction and prompts
- File operations
- Display formatting

Key files:
- `commands.ts`: Command handlers for `ccr preset` subcommands
- `export.ts`: CLI wrapper for export functionality
- `install.ts`: CLI wrapper for install functionality

## Dependencies

```
cli → server → core (@musistudio/llms)
server → shared
ui (standalone frontend)
```

## Development Notes

1. **Node.js version**: Requires >= 20.0.0
2. **Package manager**: Uses pnpm (monorepo depends on workspace protocol)
3. **TypeScript**: All packages use TypeScript, but UI package is ESM module
4. **Build tools**:
   - cli/server/shared: esbuild
   - ui: Vite + TypeScript
5. **@musistudio/llms**: This is an external dependency package providing the core server framework and transformer functionality, type definitions in `packages/server/src/types.d.ts`
6. **Code comments**: All comments in code MUST be written in English
7. **Documentation**: When implementing new features, add documentation to the docs project instead of creating standalone md files

## Configuration Example Locations

- Main configuration example: Complete example in README.md
- Custom router example: `custom-router.example.js`
