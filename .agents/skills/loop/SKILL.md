---
name: loop
version: 0.1.0
description: >-
  Drive the Loop long-form book-translation CLI. Use this skill whenever the user
  wants to translate a book, document, or long text (fiction or nonfiction) with
  LLMs, manage a whole-book glossary, resume a translation run, or inspect
  translation state. Loop is an OpenAI-compatible, multi-stage pipeline with
  SQLite-backed terminology tracking.
---

# Loop CLI

Loop translates long-form content chapter by chapter while maintaining
whole-book consistency through an evolving glossary, rolling context, and
book-level synopsis.

## When to use

- The user asks to translate a book, novel, article collection, or long document.
- The user mentions terminology consistency, glossary, or resumable translation.
- The user wants to switch between `fiction` and `nonfiction` profiles.
- The user asks about translation status, output files, or how to continue a run.

## Requirements

Choose one way to run Loop:

1. **From source** (this repository):
   - Node.js >= 20
   - `npm install`
   - Run via `npx tsx src/cli.ts <command>` or after `npm run build` with
     `node dist/cli.js <command>`.

2. **Prebuilt binary** (no Node.js needed):
   - Download the matching asset from
     <https://github.com/vayxdev/Loop/releases/latest>.
   - macOS, Linux, Windows x64 binaries are available.
   - On macOS, remove the quarantine flag after download:
     ```bash
     xattr -dr com.apple.quarantine loop
     ```

In both cases you need an API key for the configured LLM provider. The default
config uses DeepSeek:

```bash
export DEEPSEEK_API_KEY=sk-...
```

## Core workflow

Run these commands in order. State is persisted, so `translate` is safe to
re-run if interrupted.

```bash
# 1. Create a default config.yaml (skip if one exists)
loop init

# 2. Parse the input and initialize translation state
loop prepare book.md

# 3. Run the translation pipeline
loop translate book.md

# 4. Optional: run a final review (use --fix to auto-apply fixes)
loop review book.md
loop review book.md --fix

# 5. Generate output files (also runs automatically at the end of translate)
loop assemble book.md

# 6. Check progress / token usage
loop status book.md
```

Loop writes output files to an `output/` directory next to the input file and
keeps state in `state/`.

## CLI commands

| Command | Description |
|---|---|
| `init` | Create `config.yaml` with defaults. |
| `prepare <input>` | Parse `.txt`, `.md`, or `.html` and initialize state. |
| `translate <input>` | Run analyze → translate → glossary → polish → review → assemble. |
| `review <input>` | Run final review; add `--fix` to apply suggestions. |
| `assemble <input>` | Generate target-language `.md`, `.html`, `.txt` from state. |
| `status <input>` | Show progress, token usage, and remaining batches. |

Use `--config <path>` to use a non-default config file.

## Profiles

Loop has two translation profiles:

- `fiction` (default): novels and narrative text; focuses on voice, character,
  and literary polish.
- `nonfiction`: technical, academic, popular science, history, and social
  science; focuses on terminology consistency, concept accuracy, and objective
  register.

Switch profiles via config (`profile: nonfiction`) or CLI:

```bash
loop translate book.md --profile nonfiction
```

A sample nonfiction config is provided at `config.nonfiction.yaml`.

## Configuration highlights

Edit `config.yaml` to set provider, models, and pipeline switches:

```yaml
language:
  source: auto
  target: zh

profile: fiction  # fiction | nonfiction

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

## Smoke-test without an API key

Use the included `fake` provider to verify the pipeline end to end:

```bash
loop translate sample.md --config config.fake.yaml
```

## Agent guidelines

- **Do not read the whole book into context.** Loop segments and processes the
  text itself; use CLI commands and inspect only small representative samples
  when asked.
- **Always set the API key before translating.** If translation fails with an
  auth or missing-key error, ask the user for the key rather than editing the
  config to embed it.
- **Use `--profile nonfiction`** for technical/academic/historical/social texts
  unless the user explicitly says fiction.
- **Resumability is automatic.** If a run stops, re-run the same `translate`
  command; do not delete `state/` unless the user asks to restart.
- **Do not hand-edit files under `state/` or the SQLite glossary.** Use the CLI.
- **For prebuilt binaries**, prefer the latest release. If the binary is
  downloaded on macOS and Gatekeeper blocks it, run the `xattr` command above.

## Common errors

- `Cannot find module '../output/writer.js'` or similar build errors: make sure
  the repository is built (`npm run build`) or use the prebuilt binary.
- Missing API key: the provider client will error; set the matching env var.
- `No segments found`: check that the input file exists and is a supported
  format (`.txt`, `.md`, `.html`).
