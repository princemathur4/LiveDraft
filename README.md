# SyncScribe

A real-time collaborative markdown editor for small teams. Multiple users can edit the same page simultaneously, with changes syncing instantly via Yjs CRDTs.

---

## Quick Start

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) with Compose

```bash
docker-compose up --build
```

App runs at `http://localhost:3000`.

The database is seeded automatically with sample pages and two demo accounts:

| Username | Password    |
|----------|-------------|
| alice    | password123 |
| bob      | password123 |

---

## Features

### ✅ Implemented Features

- **Real-time collaboration** — multiple users edit the same page simultaneously using Yjs CRDTs. Cursor positions and presence are visible live.
- **Markdown editor** — CodeMirror 6 with syntax highlighting, code block support, and tables (GFM).
- **Live preview toggle** — switch between editor and preview modes; preview supports full GitHub-flavored markdown rendering.
- **Nested page tree** — pages organized hierarchically; sidebar shows a collapsible tree with expand/collapse per node.
- **Page creation** — create new pages from the sidebar with an optional parent; URL slug is generated automatically.
- **Full-text search** — PostgreSQL `tsvector` search with highlighted snippets and context, debounced as you type.
- **Wiki-links** — click `[[Page Name]]` links in the preview to navigate directly to that page.
- **Last edited metadata** — each page tracks the user who last edited it and the timestamp.
- **JWT authentication** — register/login flow; all write operations require a valid token.
- **Editor toolbar** — quick formatting buttons for bold, italic, headers, code blocks, and lists.
- **Desktop UI** — works on desktop browsers with a collapsible sidebar and clean layout.
- **Database persistence** — all pages and user data persist in PostgreSQL; collaborative state fully recovers on reconnect.
- **Real-time cursor indicators** — see which users are currently editing and their cursor positions.

### 📋 Planned Features

- **Alembic migrations** — replace simple `create_all` with proper versioned schema migrations for safer production deployments.
- **Distributed WebSocket relay** — add Redis pub/sub support to enable multi-process backend scaling and Yjs state sharing.
- **Version history & page rollback** — restore previous versions of pages with diff view and full revision history.
- **Page-level permissions** — granular sharing controls (view-only, edit, admin) for specific pages or folders.
- **File and image uploads** — embed images and attachments directly within pages.
- **Comments and annotations** — inline comments on pages with threaded discussions.
- **Page templates** — create reusable page templates for consistent documentation.
- **Dark mode** — theme toggle for editor and UI.
- **Export to PDF** — download pages as formatted PDFs.

---

## Manual Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL running locally

### Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then fill in your values
```

Seed the database, then start the server:

```bash
python -m modules.seed   # creates tables + seeds demo data
uvicorn app:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App runs at `http://localhost:3000`.

---

## Architecture

```
Browser (React + CodeMirror 6 + Yjs)
        |
        |── REST (auth, pages CRUD, search)  →  FastAPI  →  PostgreSQL
        |
        └── WebSocket (/ws/{slug})           →  FastAPI Yjs relay (in-memory)
```

- **Frontend:** React + Vite. CodeMirror 6 handles editing. Yjs manages shared document state across all connected clients. `y-websocket` handles the sync protocol.
- **Backend:** FastAPI. REST routes handle auth and page persistence. A separate WebSocket route acts as a Yjs relay, broadcasting binary updates to all clients in the same room.
- **Database:** PostgreSQL via SQLAlchemy. Stores users, pages (with nested parent/child relationships), and `tsvector` columns for full-text search.

---

## API Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register a new user |
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | ✓ | Current user info |
| GET | `/api/pages/tree` | — | Full page tree (nested) |
| GET | `/api/pages/search?q=` | — | Full-text search with snippets |
| GET | `/api/pages` | — | Flat list of all pages |
| GET | `/api/pages/{slug}` | — | Get a single page |
| POST | `/api/pages` | ✓ | Create a page |
| PUT | `/api/pages/{slug}` | ✓ | Update a page |
| DELETE | `/api/pages/{slug}` | ✓ | Delete a page |
| WS | `/ws/{slug}` | — | Yjs real-time sync room |

---

## Technical Decisions

### Real-Time Sync: Yjs (CRDT)

The central design question was how to handle concurrent edits from multiple users.

**Options considered:**
- **OT (Operational Transform)** — requires the server to understand, transform, and sequence every operation. Correct implementation is notoriously complex, especially around edge cases with concurrent deletions. Rejected due to complexity and the stateful server requirement.
- **Last-write-wins** — simple but loses data silently when two users edit simultaneously. Unacceptable for a collaborative editor.
- **Yjs (CRDT)** — chosen. Each client holds a full local copy of the document. Edits produce compact binary updates that are mathematically guaranteed to converge regardless of arrival order. The server relay is document-agnostic; it does not parse or transform any message.

**Tradeoffs accepted:**
- The in-memory Yjs state is not persisted to the database on every keystroke — a debounced REST save runs every ~2 seconds. If the server restarts mid-session, clients resync from the last snapshot, so up to 2 seconds of in-flight edits can be lost.
- Each room's accumulated Yjs state lives only in the relay process. A multi-process or multi-node deployment would require a shared state layer (e.g. Redis pub/sub).

### WebSocket Lifecycle

`y-websocket`'s `WebsocketProvider` handles reconnection automatically with exponential backoff. On reconnect, it re-executes the sync handshake (step 1 → step 2) so the client catches up on any updates it missed while offline.

On the server, when the last client leaves a room the in-memory Yjs state is cleared. The next client to join re-seeds from the database via the `onInitialSync` callback, keeping the in-memory state consistent with PostgreSQL as the source of truth.

### Database Schema

Pages use a self-referential adjacency list (`parent_id → pages.id`) for the hierarchy. This keeps queries simple and the tree is assembled in a single O(n) pass in Python rather than requiring recursive SQL.

Schema is managed via `SQLAlchemy`'s `Base.metadata.create_all` on startup (not Alembic migrations). This was a deliberate simplification — see Known Limitations.

### Security

- Search result snippets rendered via `dangerouslySetInnerHTML` are passed through **DOMPurify** (allowlist: `<mark>` only) before being injected into the DOM.
- Markdown preview uses **ReactMarkdown**, which renders to React components rather than raw HTML, avoiding innerHTML injection entirely.
- All secrets (`DATABASE_URL`, `SECRET_KEY`) are read from environment variables. No secrets are hardcoded.
- Write endpoints require a valid JWT. Pydantic schemas enforce field length and format constraints on all inputs.

---

## Known Limitations

- **No Alembic migrations** — schema is created via `create_all`. Adding a column in production requires a manual `ALTER TABLE` or a full re-seed.
- **Single-process WebSocket relay** — Yjs room state is in-memory. Scaling to multiple backend processes requires a shared pub/sub layer (e.g. Redis).
- **No version history** — pages are overwritten in place; there is no diff or rollback.
- **No page-level permissions** — all authenticated users can edit all pages.
- **No file or image uploads.**

---

## AI Usage

AI tooling (Claude) was used throughout this project as a development accelerator:

- **Boilerplate and scaffolding** — initial FastAPI router structure, SQLAlchemy model definitions, and Vite/React project setup were drafted with AI assistance and then reviewed and adjusted.
- **Yjs protocol implementation** — the binary message framing for the y-websocket sync handshake (`build_sync_step1`, `make_sync_step2`, `extract_update` in `rooms.py`) was developed with AI help, then verified against the y-websocket source protocol spec.
- **Debugging** — AI was used to diagnose the `passlib`/`bcrypt` 4.x version incompatibility and the Docker `sys.path` module resolution issue.
- **Documentation** — this README was drafted with AI assistance based on the actual implemented code.

All generated code was read, understood, and validated before being kept. The core architectural decisions (Yjs over OT, adjacency list hierarchy, debounced REST saves) were made independently.
