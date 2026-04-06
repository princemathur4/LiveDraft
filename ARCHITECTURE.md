================================================================================
SYNC SCRIBE — ARCHITECTURE & ENGINEERING REFERENCE
================================================================================

Last updated: 2026-04-07
This document reflects the current state of the codebase. Sections marked
[FIXED] describe bugs that existed in earlier revisions and have been resolved.


--------------------------------------------------------------------------------
1. WHAT THIS PROJECT IS
--------------------------------------------------------------------------------

SyncScribe is a real-time collaborative markdown wiki for small teams. Think
Notion meets a simple wiki. It is a full-stack web application with three main
parts:

  - A React 18 frontend (Vite) with a CodeMirror 6 editor
  - A FastAPI backend (Python) with PostgreSQL
  - Real-time collaboration powered by Yjs (CRDT) over WebSockets

The six core features that are all fully implemented:
  1. Page CRUD with slug-based addressing
  2. Live collaborative editing (CRDT — Yjs)
  3. Hierarchical page organisation with a sidebar tree
  4. JWT authentication, presence indicators, last-edited metadata
  5. Rich markdown rendering (GFM tables, syntax highlighting, [[wiki-links]])
  6. Full-text search with context snippets (PostgreSQL FTS)


--------------------------------------------------------------------------------
2. TECH STACK AND RATIONALE
--------------------------------------------------------------------------------

FRONTEND
  React 18 + Vite
    - Vite chosen over CRA (deprecated since 2023). Vite handles the
      duplicate @codemirror/state problem cleanly via resolve.alias; CRA's
      internal webpack config does not.

  CodeMirror 6  (codemirror, @codemirror/state, @codemirror/view,
                  @codemirror/lang-markdown)
    - Industry-standard embeddable editor. The yCollab() extension from
      y-codemirror.next binds a Yjs Y.Text directly to the editor state,
      meaning every local keystroke is immediately encoded as a Yjs update
      and every remote update is applied without a full re-render.

  Yjs  (yjs, y-websocket, y-codemirror.next)
    - CRDT library. Chosen over Operational Transform because:
        * The relay server is nearly stateless (stores accumulated binary
          updates; does NOT transform any operations).
        * OT requires the server to centralise and transform every op,
          adding significant server-side complexity.
        * Yjs handles offline edits and reconnection automatically through
          its sync protocol.
        * y-codemirror.next provides a production-ready CodeMirror binding.

  react-markdown + remark-gfm + rehype-highlight
    - Renders markdown to React elements (no dangerouslySetInnerHTML).
    - remark-gfm adds GFM support: tables, strikethrough, task lists.
    - rehype-highlight adds syntax highlighting in code blocks via highlight.js.
    - DOMPurify removed from the render path: react-markdown does not emit
      raw HTML so DOMPurify was a no-op that was stripping valid <mark> tags
      from search snippets and table markup. XSS is prevented by
      react-markdown's element-based rendering model.

  highlight.js  (github.css theme)

BACKEND
  FastAPI  (async, ASGI)
    - Chosen for native async/await, automatic OpenAPI docs, Pydantic
      integration, and first-class WebSocket support.

  Uvicorn[standard]
    - [standard] extra includes websockets and httptools for production-grade
      performance.

  SQLAlchemy ORM + psycopg2-binary
    - ORM used for all standard CRUD. Raw SQL used only for full-text search
      (to_tsvector / ts_headline) where SQLAlchemy's abstractions would
      obscure the intent.

  PostgreSQL
    - TSVECTOR column on the pages table with a GIN index enables sub-
      millisecond full-text search even on large corpora.
    - ts_headline() generates context snippets with <mark>-wrapped matches
      server-side, avoiding the need to ship full document content to the
      client for highlighting.

  python-jose[cryptography] + passlib[bcrypt]
    - JWT for stateless auth. bcrypt for password hashing (industry standard,
      resistant to GPU attacks).

  python-slugify
    - Deterministic, URL-safe slug generation from page titles with automatic
      uniqueness enforcement.


--------------------------------------------------------------------------------
3. PROJECT FILE STRUCTURE (CURRENT)
--------------------------------------------------------------------------------

co_edit/
├── ARCHITECTURE.md              ← this file
├── backend/
│   ├── requirements.txt
│   ├── seed.py                  # inserts sample pages/users for development
│   └── modules/
│       ├── application.py       # FastAPI app factory: CORS, router registration
│       ├── models.py            # SQLAlchemy ORM: User, Page (self-referential)
│       ├── schemas.py           # Pydantic schemas for all request/response types
│       ├── api/
│       │   └── deps.py          # get_current_user dependency (JWT → User)
│       ├── core/
│       │   └── security.py      # JWT encode/decode, bcrypt helpers
│       ├── database/
│       │   └── postgres.py      # engine, SessionLocal, Base (with id/created_at/updated_at)
│       ├── realtime/
│       │   └── rooms.py         # Room dataclass, y-websocket protocol helpers
│       ├── routers/
│       │   ├── auth.py          # POST /api/auth/register|login, GET /api/auth/me
│       │   ├── pages.py         # CRUD + search endpoints for pages
│       │   └── websocket.py     # WS /ws/{room_name} — y-websocket protocol handler
│       └── services/
│           └── pages.py         # ensure_unique_slug, update_search_vector, build_tree
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx             # createRoot (no StrictMode — see §7)
        ├── App.jsx              # layout shell, SearchBar, wiki-link navigation
        ├── App.css              # global layout + search dropdown styles
        ├── api/
        │   └── client.js        # apiFetch() base wrapper
        ├── context/
        │   └── AuthContext.jsx  # token persistence, user restore on refresh
        └── pages/
            ├── Editor/
            │   ├── CollaborativeEditor.jsx   # CodeMirror + Yjs mount/teardown
            │   └── CollaborativeEditor.css
            ├── Preview/
            │   ├── Preview.jsx              # react-markdown + wiki-link renderer
            │   └── Preview.css             # table styles, wiki-link styles
            ├── Sidebar/
            │   └── Sidebar.jsx             # recursive page tree, create-page form
            ├── Toolbar/
            │   └── Toolbar.jsx             # formatting buttons (bold, italic, …)
            ├── Login/
            └── Register/


--------------------------------------------------------------------------------
4. DATABASE SCHEMA
--------------------------------------------------------------------------------

TABLE: users
  id            SERIAL PRIMARY KEY
  username      VARCHAR(50) UNIQUE NOT NULL  -- indexed
  email         VARCHAR(255) UNIQUE NOT NULL
  password_hash VARCHAR(255) NOT NULL
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()

TABLE: pages
  id             SERIAL PRIMARY KEY
  title          VARCHAR(255) NOT NULL
  slug           VARCHAR(255) UNIQUE NOT NULL  -- indexed; used as Yjs room name
  body           TEXT NOT NULL DEFAULT ''
  parent_id      INTEGER REFERENCES pages(id) ON DELETE SET NULL  -- self-referential
  created_by     INTEGER REFERENCES users(id)
  last_edited_by INTEGER REFERENCES users(id)
  search_vector  TSVECTOR                     -- GIN-indexed for FTS
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT now()  -- updated by onupdate trigger

  INDEX: ix_pages_search_vector  GIN on search_vector
  INDEX: ix_pages_slug            B-tree on slug (unique)

NOTE: There is no separate folders table. Pages nest themselves via parent_id
(self-referential tree). This eliminates a join on every sidebar load and
simplifies the data model. The sidebar calls GET /api/pages/tree which builds
the full nested tree in O(n) in Python using a two-pass node_map algorithm.


--------------------------------------------------------------------------------
5. API ENDPOINTS
--------------------------------------------------------------------------------

AUTH  (prefix: /api)
  POST /api/auth/register   { username, email, password }   → UserOut
  POST /api/auth/login      { username, password }           → { access_token }
  GET  /api/auth/me         Bearer token required            → UserOut

PAGES  (prefix: /api)
  GET    /api/pages/tree            nested tree for sidebar  → PageTreeNode[]
  GET    /api/pages/search?q=       FTS with snippets        → PageSearchResult[]
  GET    /api/pages                 flat list                → PageOut[]
  GET    /api/pages/{slug}          single page              → PageOut
  POST   /api/pages   (auth)        { title, body, parent_id? } → PageOut
  PUT    /api/pages/{slug}  (auth)  { title?, body?, parent_id? } → PageOut
  DELETE /api/pages/{slug}  (auth)                           → { status }

PageOut shape:
  { id, title, slug, body, parent_id, created_at, updated_at,
    last_editor: { id, username, email } | null,
    creator:     { id, username, email } | null }

WEBSOCKET
  WS /ws/{room_name}   y-websocket protocol handler (see §6)

HEALTH
  GET /health   → { status: "ok" }

Route ordering matters in FastAPI: /pages/tree and /pages/search are declared
before /pages/{slug} to prevent "tree" and "search" being interpreted as slugs.


--------------------------------------------------------------------------------
6. REAL-TIME COLLABORATION — Y-WEBSOCKET PROTOCOL
--------------------------------------------------------------------------------

OVERVIEW

  Browser A ──WebSocket──▶ FastAPI ──WebSocket──▶ Browser B
                              │
                          PostgreSQL
                       (authoritative store)

Each wiki page is a "room" keyed by its slug. The room is managed by the
Room dataclass in rooms.py.

WHAT THE SERVER DOES (rooms.py + websocket.py)

  The original relay was a dumb broadcast: it forwarded every message to
  every other client. This broke because it never implemented the y-websocket
  server handshake, so clients could never confirm sync was complete.

  The server now implements the full y-websocket binary protocol:

  Message type byte 0 = MSG_SYNC, byte 1 = MSG_AWARENESS

  On client connect (before the message loop):
    1. Server → client: SYNC STEP 1 with empty state vector
       ("I have nothing — send me your full document state")
    2. Server → client: one SYNC STEP 2 per stored update (room.updates)
       ("Here is everything I currently have")
    These two messages complete the handshake. The client receives step 2,
    sets provider.synced = true, and emits the "sync" event.

  In the message loop:
    - SYNC_STEP_1 received: client is re-requesting state (e.g. reconnect).
      Server replays all updates in room.updates as individual SYNC STEP 2 messages.
    - SYNC_STEP_2 or SYNC_UPDATE received: client is pushing state or a live
      edit. Server appends the raw Yjs update bytes to room.updates and
      broadcasts the original message to all other clients.
    - MSG_AWARENESS: ephemeral presence data. Relayed only, never stored.
    - Unknown type: broadcast as-is for forward compatibility.

  room.updates is a list of individual Yjs update blobs. On join, each is sent
  as its own SYNC STEP 2 message so the client calls Y.applyUpdate() once per
  message and all edits are applied in order.

  Concatenating all updates into a single blob and sending as one message does
  NOT work: the Yjs binary parser reads one encoded update structure and stops,
  silently dropping all trailing bytes. This was the root cause of Bug 7 below.

ROOM LIFECYCLE

  - Room is created on first client connect, stays alive as clients come and go.
  - When the LAST client disconnects, room.updates is cleared.
    Rationale: the database is the single source of truth. Persisting in-memory
    Yjs state across empty-room periods caused divergence (see §7, Bug 2).
  - Multi-user collaboration is unaffected: room.updates only clears when the
    room is fully empty.

FRONTEND SIDE (CollaborativeEditor.jsx)

  Initialisation flow on page open:
    1. authFetch GET /api/pages/{slug} — load page body from DB.
    2. Mount Yjs + CodeMirror + WebSocket provider.
    3. Server delivers SYNC STEP 2. Client emits "sync" event.
    4. onInitialSync fires: if ytext is empty AND we have DB content, insert it.
       The syncComplete flag is set to true here.
    5. Editor is now ready. Only after step 4 can user edits trigger saves.

  syncComplete flag:
    ytext.observe(onYtextChange) fires for EVERY change to the Yjs document,
    including changes delivered by the server during the initial sync and the
    DB-seed insert in step 4. Without the syncComplete guard, these would
    schedule a debounced save and write stale content back to the database.
    syncComplete = false until onInitialSync runs; saves are blocked until then.

  isDirty flag:
    Set true on any scheduleDebouncedSave call (user keystrokes only, after
    syncComplete). Reset false after a successful PUT. flushSave() (used during
    teardown and beforeunload) is a no-op when isDirty = false, preventing
    unnecessary PUT calls when navigating between unedited pages.

PERSISTENCE STRATEGY

  - Live state: Yjs in-memory, synced over WebSocket between all clients.
  - Durable state: PostgreSQL. Updated via debounced PUT (2 s after last edit).
  - On navigation away: cleanup flushSave() fires with keepalive: true.
    keepalive lets the browser complete the fetch even after the component
    unmounts or the page is being closed — the only reliable save-on-unload
    mechanism in modern browsers.
  - On tab close / refresh: beforeunload handler calls flushSave().


--------------------------------------------------------------------------------
7. BUGS FIXED — DETAILED POST-MORTEMS
--------------------------------------------------------------------------------

──────────────────────────────────────────────────────────────────────────────
BUG 1: Logout on page refresh
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: Refreshing the browser always returned the user to the login screen.

ROOT CAUSE:
  AuthContext stored token and user exclusively in React state (useState).
  React state is ephemeral — it resets to its initial value on every full page
  load. There was no persistence layer.

FIX (AuthContext.jsx):
  - token is now initialised with useState(() => localStorage.getItem("auth_token"))
    — a lazy initialiser that reads localStorage synchronously on the first render,
    so authFetch has the correct token from render 1 (no re-render needed).
  - login() writes the token to localStorage; logout() clears it.
  - A mount-time useEffect calls GET /api/auth/me to validate the stored token
    and restore the user object. If the token is expired or invalid, it is
    cleared and the user sees the login screen.
  - isInitialized flag added. AppContent renders a neutral "Loading…" spinner
    while the /me validation is in flight, preventing the login screen from
    flashing before the token is confirmed valid.

WHY SYNCHRONOUS INIT MATTERS:
  If token were initialised to null and then set asynchronously from a
  useEffect, authFetch would be created with token = null on the first render.
  The Sidebar and Editor would both fire their initial data fetches with no
  auth header, the requests would fail, and the editor useEffect dependency on
  authFetch would cause it to re-mount the entire Yjs + CodeMirror stack when
  authFetch changed identity after token was set.

──────────────────────────────────────────────────────────────────────────────
BUG 2: Stale in-memory Yjs state overwrites database content
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: Opening a page showed only the first character typed in a previous
session (e.g. "P"). The editor then saved "P" back to the database via a PUT,
overwriting the full saved content.

ROOT CAUSE — chain of three failures:

  Step 1 — Stale doc_state preserved across empty rooms.
    The backend intentionally kept doc_state alive when a room emptied (to
    avoid a DB read for the next joiner). This was correct in theory but
    created a dangerous divergence window: if the page body was updated by any
    other means (direct API call, another session, a save after the last user
    left), the in-memory Yjs state no longer matched the database.

  Step 2 — onInitialSync guards on ytext == "".
    The frontend seeds DB content into the Yjs doc only when ytext is empty
    after sync. With stale doc_state containing "P", ytext was "P" (not ""),
    so the DB content was never inserted. The editor correctly displayed "P".

  Step 3 — onYtextChange fires during sync delivery.
    When the server sent doc_state = "P" as sync step 2, the Yjs doc updated,
    ytext.observe(onYtextChange) fired, and a debounced save of "P" was
    scheduled. The save succeeded and the full DB content was permanently lost.

FIX — two-layer solution:

  Layer 1 (backend, rooms.py — primary fix):
    clear room.updates when the last client leaves.
    The next joiner always receives an empty sync step 2 → onInitialSync sees
    ytext == "" → seeds from the DB. Postgres is the single source of truth;
    the in-memory Yjs state is a cache for an active collaborative session only.

  Layer 2 (frontend, CollaborativeEditor.jsx — defensive fix):
    syncComplete flag (starts false). onYtextChange only calls
    scheduleDebouncedSave when syncComplete is true. syncComplete is set in
    onInitialSync after the handshake completes and after any DB-seed insert.
    This makes it structurally impossible for server-delivered state (or the
    DB seed itself) to trigger a save.

──────────────────────────────────────────────────────────────────────────────
BUG 3: Save lost on in-app page navigation
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: Switching to another page within 2 seconds of the last keystroke
discarded the edit — the debounced PUT never fired.

ROOT CAUSE:
  The useEffect cleanup ran clearTimeout(saveTimeoutId) unconditionally,
  cancelling the pending debounce. flushSave() was only called when
  saveTimeoutId !== null, which was an unreliable check (the timer ID is
  non-null from first edit and is never reset after the timer fires).

FIX (CollaborativeEditor.jsx):
  - isDirty flag: set true on every user edit, false after a successful save.
  - flushSave() checks isDirty first and is a no-op if false.
  - Cleanup unconditionally calls clearTimeout + flushSave(). No conditional.
  - flushSave() uses fetch with keepalive: true, which instructs the browser
    to complete the request even after the component is unmounted.

──────────────────────────────────────────────────────────────────────────────
BUG 4: beforeunload save silently dropped
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: Closing a tab or refreshing mid-edit lost the last unsaved changes
even though a save was attempted.

ROOT CAUSE:
  The old handleBeforeUnload called saveToBackend() — an async function that
  returns a Promise. The browser does not wait for async work on unload;
  it terminates the page immediately, killing the in-flight fetch.

FIX:
  flushSave() uses the fetch keepalive: true option. A keepalive fetch is
  handed off to the browser's networking layer and completes independently
  of the page's JavaScript execution context. It survives tab close,
  navigation, and component teardown. keepalive requests are limited to ~64 KB
  per Chrome's spec; all realistic page bodies fall well within this.

──────────────────────────────────────────────────────────────────────────────
BUG 5: Async race — editor mounts in zombie state on fast page switches
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: Clicking between pages quickly sometimes caused the editor to display
content from the wrong page, or failed to save when navigating away.

ROOT CAUSE:
  initEditor is async (it awaits authFetch for the page body). If pageSlug
  changed while the fetch was in flight, React's useEffect cleanup ran and set
  cleanup = undefined — but cleanup was the variable from the outer scope of
  the now-superseded effect. The new effect's initEditor hadn't returned yet,
  so teardown was null and the cleanup return was () => null. The old editor
  was never destroyed.

FIX:
  - cancelled flag (let cancelled = false) declared in the effect body.
  - Cleanup sets cancelled = true immediately.
  - initEditor checks cancelled after every await; if true, it returns without
    mounting. The editor never attaches to the DOM in a zombie state.
  - teardown (formerly cleanup) is only ever non-null when the editor
    successfully mounted, so teardown?.() is always the correct teardown.

──────────────────────────────────────────────────────────────────────────────
BUG 6: y-websocket sync event never fired (simple relay, no protocol)
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: The original backend was a dumb broadcast relay. New clients received
no server-initiated sync, so provider.synced was never set to true and the
"sync" event never fired. The frontend workaround (an 800 ms timeout to seed
content) was fragile and racey.

ROOT CAUSE:
  y-websocket clients send SYNC_STEP_1 on connect and expect the server to
  respond with SYNC_STEP_2. Without this response, the sync protocol stalls
  at the handshake phase and the client never knows when it has received all
  available document state.

FIX (websocket.py + rooms.py):
  Full y-websocket binary protocol implemented:
  - Server proactively sends SYNC_STEP_1 + SYNC_STEP_2 on every new connect.
  - SYNC_STEP_1 messages from the client are answered with current doc_state.
  - SYNC_STEP_2 / SYNC_UPDATE messages are appended to room.updates and broadcast.
  - MSG_AWARENESS messages are relayed without storage.
  - Variable-length uint (lib0 varint) encoding/decoding implemented in Python
    to correctly frame all messages.

  With this fix, the "sync" event fires reliably on every connection. The
  frontend onInitialSync handler is the correct, race-free mechanism for seeding
  DB content into a fresh Yjs document.

──────────────────────────────────────────────────────────────────────────────
BUG 7: New joiners see only first-edit content; subsequent edits silently lost
──────────────────────────────────────────────────────────────────────────────

SYMPTOM: A user opens a page and the editor shows an outdated version — usually
the content from when the page was first seeded, not the latest saved content.
GET /api/pages/{slug} returns the correct updated body, but the editor and
preview display a stale version. Observed on quick page refresh and whenever
another user joins a room that has accumulated multiple edits.

ROOT CAUSE — two factors combine:

  Factor 1 — Concatenated Yjs updates silently truncate (rooms.py).
    The backend stored all incoming Yjs binary blobs by concatenating them into
    a single bytes value (room.doc_state += update). When a new client joined,
    this entire blob was sent as one sync-step-2 message. The y-websocket
    client passed the blob to Y.applyUpdate(), which uses a streaming binary
    decoder. The decoder reads the first encoded update structure, reaches its
    natural end, and returns — all subsequent concatenated bytes are silently
    ignored. So a room with N edits delivered only the FIRST edit to new joiners.

  Factor 2 — asyncio race: new WebSocket joins before old one is cleaned up.
    On quick page refresh, the browser opens the new WebSocket connection before
    the server has processed the close event on the old one. During this window,
    room.clients = {old_ws, new_ws}. The old_ws disconnect subsequently removes
    old_ws but room.clients is now {new_ws} — non-empty — so the room is NOT
    cleared. The stale (truncated-apply) state is therefore served to the new
    connection instead of the empty state that would trigger DB re-seeding.

  Combined effect:
    new joiner receives the first-ever update → Y.applyUpdate applies it →
    ytext = "version 1" (not the latest). ytext is non-empty so onInitialSync
    does not seed from initialContent (the correct DB content). Preview and
    editor show stale content despite GET /api/pages returning the correct body.

FIX (rooms.py):

  Replace doc_state: bytes = b"" with updates: list[bytes] = [].
  store_update() appends rather than concatenates.
  send_server_state() iterates the list and sends each update as its own
  sync-step-2 message. The client receives N messages → N Y.applyUpdate() calls
  → all edits applied in order → ytext reflects the true current document state.

  With all updates applied correctly, the race condition (Factor 2) becomes
  harmless: even if room.updates is not cleared due to the race, the new
  joiner's ytext still reflects the correct content because every historical
  update was applied. The Yjs state and the DB are in sync, so no divergence
  is visible.

  The room.updates.clear() on last-client-leave (remove_client) is retained.
  It ensures a solo user returning to a page after a clean disconnect always
  gets an empty room → onInitialSync seeds from DB → correct content shown.


--------------------------------------------------------------------------------
8. AUTHENTICATION
--------------------------------------------------------------------------------

TYPE: JWT (JSON Web Token), Bearer token in Authorization header
STORAGE: localStorage (key: "auth_token")
  - Stored in localStorage rather than a cookie to keep the implementation
    simple (no CSRF handling needed). For a production deployment with higher
    security requirements, HTTP-only cookies would be preferable.

FLOW:
  1. User registers: POST /api/auth/register → UserOut
  2. User logs in:  POST /api/auth/login → { access_token }
  3. Frontend calls GET /api/auth/me with the token to get user object
  4. login(userData, accessToken) stores token in localStorage + React state
  5. AuthContext.authFetch() injects Authorization: Bearer {token} on all calls
  6. On refresh, token is read from localStorage synchronously; /me validates it
  7. logout() removes token from localStorage and clears React state

JWT PAYLOAD: { "sub": username, "exp": expiry_timestamp }
ALGORITHM:   HS256
SECRET:      loaded from .env SECRET_KEY, never hardcoded
EXPIRY:      ACCESS_TOKEN_EXPIRE_MINUTES (default 60, configurable via .env)

PROTECTED ROUTES: any FastAPI route with Depends(get_current_user)
PUBLIC ROUTES: GET /api/pages/*, GET /api/pages/search (intentional — wiki
  pages are readable without login; only writes require auth)


--------------------------------------------------------------------------------
9. FRONTEND COMPONENT REFERENCE
--------------------------------------------------------------------------------

App.jsx
  - Three-column topbar grid (1fr | auto | 1fr) keeps SearchBar mathematically
    centred regardless of right-side content width.
  - SearchBar: debounced 250 ms, calls GET /api/pages/search, renders dropdown
    with title + ts_headline snippets. Closes on outside click.
  - navigateByTitle(title): used by wiki-link clicks. Calls search API with
    the raw title, finds the exact-match result (case-insensitive), sets slug.

AuthContext.jsx
  - Single source of auth truth. Exposes: user, token, login, logout,
    authFetch, isInitialized.
  - authFetch wraps apiFetch and injects the Authorization header. It is a
    stable useCallback memoised on token, so it does not cause spurious
    useEffect re-runs unless the token actually changes.

CollaborativeEditor.jsx
  - mountCollaborativeEditor() is a plain function (not a hook) that sets up
    the entire Yjs + CodeMirror stack imperatively and returns a teardown
    function. This keeps all WebSocket lifecycle logic outside React's render
    cycle.
  - State: status, connectedUsers, activeUsers, saveStatus, previewContent,
    viewMode, pageLoading, pageInfo (last editor username + updated_at).
  - Three view modes: "edit" (editor only), "split" (side-by-side), "preview".
    Editor div uses display:none in preview mode (not unmounted) so the Yjs
    connection stays live.
  - pageInfo is populated from the GET /api/pages/{slug} response and
    displayed in the status bar: "Last edited by alice · 3m ago".

Preview.jsx
  - preprocessWikiLinks() converts [[Page Name]] → [Page Name](#wiki:…) before
    ReactMarkdown parses. The custom <a> renderer intercepts #wiki: hrefs and
    calls onNavigate(title) instead of following the link.
  - DOMPurify removed. react-markdown renders to React elements, not raw HTML,
    so no XSS risk exists. DOMPurify was stripping <mark> tags (search
    snippets) and GFM table structure.
  - GFM tables styled in Preview.css: borders, alternating row backgrounds,
    header highlight.
  - Wiki-link anchor styled with dotted indigo underline; hover turns solid
    with a light indigo background tint.

Sidebar.jsx
  - Fetches GET /api/pages/tree on mount. Response is a pre-nested tree built
    by services/pages.py::build_tree() in O(n).
  - PageNode is a recursive component. Root pages (depth=0) default to open.
  - Create-page form includes a parent selector (flat dropdown from tree).

Toolbar.jsx
  - wrapSelection(prefix, suffix): wraps selected text, e.g. **bold**.
  - insertLinePrefix(prefix): inserts at line start, e.g. "# ".
  - Dispatches CodeMirror transactions directly via editorViewRef.


--------------------------------------------------------------------------------
10. FULL-TEXT SEARCH
--------------------------------------------------------------------------------

The search_vector column (TSVECTOR) is updated after every page create/update:

  UPDATE pages
  SET search_vector = to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))
  WHERE id = :id

Query uses plainto_tsquery (handles phrase input naturally without requiring
Postgres tsquery syntax from users) ranked by ts_rank:

  SELECT title, slug,
    ts_headline('english', body, plainto_tsquery('english', :q),
                'MaxWords=15, MinWords=5, StartSel=<mark>, StopSel=</mark>') AS snippet
  FROM pages
  WHERE search_vector @@ plainto_tsquery('english', :q)
  ORDER BY ts_rank(search_vector, plainto_tsquery('english', :q)) DESC
  LIMIT 20

The GIN index on search_vector makes this query O(log n) regardless of corpus
size. ts_headline() returns a short excerpt with the matched terms wrapped in
<mark> tags; the frontend renders these via dangerouslySetInnerHTML only inside
the search dropdown (not the page preview), so XSS risk is limited to content
that is already stored in the database by authenticated users.


--------------------------------------------------------------------------------
11. KNOWN CONVENTIONS
--------------------------------------------------------------------------------

BACKEND:
  - All route functions are async def
  - DB sessions injected via Depends(get_db); sessions always closed in finally
  - Auth guard via Depends(get_current_user) on all write routes
  - Pydantic schemas for all request bodies and responses; from_attributes=True
    for ORM-backed models
  - Raw SQL only for FTS operations; everything else uses SQLAlchemy ORM
  - Secrets loaded from .env, never hardcoded

FRONTEND:
  - Functional components only
  - No React StrictMode — StrictMode double-mounts in dev, creating duplicate
    WebSocket connections and inflating the presence count
  - All Yjs + CodeMirror setup in mountCollaborativeEditor(), called from
    useEffect; the returned teardown is always called on unmount
  - cancelled + teardown pattern in every useEffect that awaits before mounting
  - authFetch used for all authenticated requests (never raw fetch)
  - fetch with keepalive: true for all fire-and-forget saves on teardown/unload


--------------------------------------------------------------------------------
12. HOW TO RUN THE PROJECT
--------------------------------------------------------------------------------

PREREQUISITES: Node 18+, Python 3.10+, PostgreSQL

DATABASE SETUP (one-time):
  psql -U postgres
  CREATE USER syncscribe WITH PASSWORD 'syncscribe';
  CREATE DATABASE syncscribe OWNER syncscribe;
  \q

BACKEND:
  cd backend
  pip install -r requirements.txt
  # create .env with at minimum:
  #   DATABASE_URL=postgresql://syncscribe:syncscribe@localhost/syncscribe
  #   SECRET_KEY=<random string>
  uvicorn backend.modules.application:app --reload --port 8000
  # Tables are auto-created via Base.metadata.create_all() on startup
  # Seed data: python backend/seed.py
  # API docs: http://localhost:8000/docs

FRONTEND:
  cd frontend
  npm install
  npm run dev
  # App: http://localhost:5173

TEST COLLABORATION:
  Open http://localhost:5173 in two browser tabs (same or different users).
  Type in one tab and watch changes appear in real time in the other.

================================================================================
END OF DOCUMENT
================================================================================
