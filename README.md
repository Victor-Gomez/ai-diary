# AI Diary — a local-first, private AI journal

A polished, desktop-style journaling app. Your diary lives **only on your machine**,
in an **encrypted** SQLite database. AI features (analysis, chat over your entries)
run behind a provider interface, so the inference backend is swappable — and can be
fully on-device.

## Features

- 🔒 **Local-first & Encrypted:** SQLite with SQLCipher (AES-256) encryption at rest — your journal never leaves your machine.
- ✍️ **Desktop Journaling Experience:** Markdown editor with live preview, word counts, and automatic saving.
- 🤖 **Private AI Assistant & Insights:** Swappable AI backend (offline mock, local LLM via Ollama/llama.cpp, or OpenAI-compatible remote endpoints). AI analysis is strictly segregated and never alters original entries.
- 🧠 **Memory & RAG Pipeline:** Long-term memory extraction and contextual retrieval over past journal entries.
- 🔍 **Full-Text Search (FTS5):** Fast search across encrypted entries and conversations.
- 💾 **Data Portability:** Complete export, import, and backup management.

## Quick start

### Prerequisites

- Node.js >= 22
- pnpm >= 9

### Installation & Run

```bash
pnpm install
pnpm dev
```

Open [http://localhost:4321](http://localhost:4321) in your browser.

### Production build

```bash
pnpm build
pnpm start      # runs the Node server from ./dist
```

## Principles

- **Local-first & private.** No accounts, no cloud database, no mandatory external API.
- **Encrypted at rest.** SQLite via SQLCipher (AES-256) — including the search index.
- **AI is abstracted.** Everything depends on the `AIProvider` / `DiaryRetriever`
  interfaces, never on a specific model. The default provider is fully offline.
- **Your text is sacred.** AI analysis is stored separately and never modifies an entry.

## Tech stack

- **Astro** (SSR via `@astrojs/node`) + **TypeScript** (strict), no heavy UI framework dependencies.
- **Tailwind CSS v4**.
- **SQLite** through `better-sqlite3-multiple-ciphers` (SQLCipher). Ships prebuilt
  N-API binaries — no native compilation required. Uses Node's crypto for key generation.
- **FTS5** full-text search inside the encrypted database.

> **Why not Drizzle?** The data model is small and the encrypted binding is
> synchronous; hand-written, typed repository modules (`src/lib/**`) keep the DB
> layer simple and dependency-light, as the brief allowed.

## Master password & encryption

The database is encrypted at rest using **SQLCipher (AES-256)**:

1. **Master Password Vault (`data/vault.json`):**
   - On first run, you are prompted to set a Master Password.
   - Your password derives a Key Encryption Key (KEK) using **PBKDF2** (100,000 iterations, SHA-256).
   - The 256-bit database encryption key is encrypted with **AES-256-GCM** inside `data/vault.json`.
   - The app locks automatically after inactivity or on demand via the **Lock** button in the sidebar.
2. **Environment Variable Override:**
   - You can also supply `DIARY_DB_KEY` directly via environment to bypass the prompt for automated workflows.

> **Important:** Keep your master password safe. There is no recovery backdoor — without your master password, your encrypted diary cannot be opened.

### Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `DIARY_DB_PATH` | Path to the SQLite database file | `./data/diary.db` |
| `DIARY_VAULT_PATH` | Path to the encrypted master key vault file | `./data/vault.json` |
| `DIARY_DB_KEY` | Optional encryption passphrase override | *(none)* |
| `DIARY_AI_KEY` | Bearer token / API key for remote AI endpoint | *(none)* |

See [.env.example](.env.example) for reference.

## Project structure

```
src/
├── components/          Presentational Astro components
│   ├── diary/           Editor, calendar, analysis panel, mood meter
│   ├── layout/          Sidebar, navigation
│   └── ui/              Icons and core UI elements
├── layouts/             App shell (sidebar, search palette, toasts)
├── pages/               Routes & API endpoints
│   ├── api/
│   │   ├── chat/        Conversations & message handling
│   │   ├── data/        Export, import, backup, delete-all
│   │   ├── entries/     CRUD & AI analysis for diary entries
│   │   ├── memory.ts    Derived long-term memory
│   │   ├── search.ts    FTS full-text search
│   │   └── settings.ts  App settings
│   ├── chat/            Chat interface
│   ├── diary/           Diary views (new, edit, list)
│   └── settings/        Settings page
├── lib/
│   ├── ai/              AIProvider interface, mock & OpenAI-compatible providers
│   ├── chat/            Conversation store & RAG pipeline
│   ├── client/          Browser-side helpers (shell, toast, API)
│   ├── data/            Export / import / wipe managers
│   ├── db/              Encrypted SQLite client, schema, key management
│   ├── diary/           Entry & analysis repositories, insights, prompts
│   ├── memory/          Long-term memory persistence
│   ├── search/          FTS & DiaryRetriever abstraction (vector-ready)
│   ├── settings/        App settings repository
│   └── utils/           Date, text, markdown, and ID utilities
└── types/               Shared TypeScript domain types
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl + N` | New entry |
| `Ctrl + K` | Search palette |
| `Ctrl + S` | Save entry now |
| `Enter` / `Ctrl + Enter` | Send chat message |
| `Shift + Enter` | Newline in chat |
| `Esc` | Close palette / dialogs |

## Roadmap (architected for, not yet wired)

- **Vector search:** `embedding` BLOB columns already exist on `entries`/`memories`;
  add a `VectorRetriever implements DiaryRetriever` and select it in `createRetriever`.
- **Real local LLM:** select "Local model" in Settings and point it at Ollama /
  llama.cpp (OpenAI-compatible). Streaming is already implemented end to end.
- **Tauri 2:** the app is SSR with all persistence isolated in `src/lib/db`; package
  with Tauri and repoint `DIARY_DB_PATH` + key storage to the OS.

## License & Attribution

- **Icons:** [Lucide](https://lucide.dev) — Licensed under the [ISC License](https://github.com/lucide-icons/lucide/blob/main/LICENSE).
  - Copyright (c) 2026 Lucide Icons and Contributors
  - Portions Copyright (c) 2013-present Cole Bemis (Feather Icons, MIT)


