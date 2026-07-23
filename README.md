# Loop

Loop is a long-form book translation pipeline powered by LLMs. It supports both fiction and nonfiction, with a focus on whole-book consistency, terminology tracking, and resumability.

## Features

- Multi-stage pipeline: analyze → translate → extract glossary → polish → review → assemble.
- Whole-book understanding via chapter digests and book synopsis.
- Rolling context for local coherence.
- Evolving glossary with SQLite persistence and conflict tracking.
- Strict segment alignment guarantee (N source → N target segments).
- Resumable: each batch is persisted; re-run `translate` to continue.
- Two profiles: `fiction` and `nonfiction`.
- Supports `.txt`, `.md`, `.html` input; outputs `.md`, `.html`, `.txt`.

## Installation

### From source

```bash
npm install
npm run build
```

### Prebuilt binaries

You can also download a standalone binary from the [releases page](https://github.com/vayxdev/Loop/releases). Replace `v0.1.3` with the latest tag:

```bash
# macOS Apple Silicon
curl -fsSL -o loop https://github.com/vayxdev/Loop/releases/download/v0.1.3/loop-macos-arm64
chmod +x loop
./loop --help

# macOS Intel
curl -fsSL -o loop https://github.com/vayxdev/Loop/releases/download/v0.1.3/loop-macos-x64
chmod +x loop
./loop --help

# Linux x64
curl -fsSL -o loop https://github.com/vayxdev/Loop/releases/download/v0.1.3/loop-linux-x64
chmod +x loop
./loop --help

# Windows
curl -fsSL -o loop.exe https://github.com/vayxdev/Loop/releases/download/v0.1.3/loop-windows-x64.exe
loop.exe --help
```

On macOS, if Gatekeeper warns that the binary cannot be verified, remove the quarantine flag:

```bash
xattr -dr com.apple.quarantine loop
```

## Quick start

```bash
# Create default config.yaml
npx tsx src/cli.ts init

# Set your API key (default provider: DeepSeek)
export DEEPSEEK_API_KEY=sk-...

# Translate a book
npx tsx src/cli.ts translate book.md

# Check progress
npx tsx src/cli.ts status book.md

# Assemble output files (also runs automatically after translate)
npx tsx src/cli.ts assemble book.md
```

### Test without an API key

A `fake` provider is included for smoke-testing the pipeline:

```bash
npx tsx src/cli.ts translate sample.md --config config.fake.yaml
```

Output files are written to an `output/` directory next to the input file.

## CLI Commands

| Command | Description |
|---|---|
| `init` | Create `config.yaml` with defaults. |
| `prepare <input>` | Parse input and initialize translation state. |
| `translate <input>` | Run the full translation pipeline. |
| `review <input>` | Run final review (use `--fix` to auto-fix). |
| `assemble <input>` | Generate output files from saved state. |
| `status <input>` | Show translation status and token usage. |

## Profiles

Loop supports two translation profiles:

- `fiction`（默认）：小说/叙事文学，注重角色、语气、文学性润色。
- `nonfiction`：技术/学术/科普/社科/历史，注重术语一致、概念准确、客观语域。

切换方式：

```bash
# 通过配置文件
npx tsx src/cli.ts translate book.md --config config.nonfiction.yaml

# 或通过命令行覆盖
npx tsx src/cli.ts translate book.md --profile nonfiction
```

非虚构配置示例见 `config.nonfiction.yaml`。

## Configuration

Edit `config.yaml` to change provider, model tiers, pipeline switches, and output options.

```yaml
language:
  source: auto
  target: zh

profile: fiction  # fiction | nonfiction

nonfiction:
  domain: 计算机科学
  audience: 技术从业者
  firstOccurrenceWithOriginal: true  # 术语首次出现保留原文括号

llm:
  provider: deepseek
  baseUrl: https://api.deepseek.com
  apiKeyEnv: DEEPSEEK_API_KEY
  tiers:
    strong:
      model: deepseek-v4-pro
    fast:
      model: deepseek-v4-flash

pipeline:
  review: false
  polish: true
  rollingContextSegments: 6
  bookUnderstanding: true
```

## Project Structure

```
src/
  agents/          Prompt templates and LLM agents
  config/          Configuration types and loader
  glossary/        SQLite glossary store
  ingest/          Document parsing and segmentation
  llm/             LLM client abstraction
  output/          Output assembly
  pipeline/        Orchestrator and state management
  cli.ts           CLI entry point
```

## Notes

- This is an MVP. EPUB input/output is not yet implemented.
- All providers are assumed to be OpenAI-compatible in this version.
