import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { yCollab } from "y-codemirror.next";
import Toolbar from "../Toolbar";
import Preview from "../Preview";
import { useAuth } from "../../context/AuthContext";
import "./CollaborativeEditor.css";

const WS_BASE_URL = "ws://localhost:8000/ws";
const AWARENESS_OUTDATED_MS = 3000;
const SAVE_DEBOUNCE_MS = 2000;

function formatRelativeTime(dateString) {
  if (!dateString) return "";
  const diffMs = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

// Random hex color for this client's cursor / presence badge
function randomCollaboratorColor() {
  return "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
}

// Maps awareness client states to the user list shown in the UI.
function usersFromAwarenessStates(states) {
  const users = [];
  states.forEach((state, clientId) => {
    if (state.user) {
      users.push({
        clientId,
        name: state.user.name,
        color: state.user.color,
      });
    }
  });
  return { users, connectedCount: states.size };
}

// 7. Build CodeMirror editor state (markdown + Yjs collaboration + theme).
function createMirrorEditorState(ytext, awareness) {
  return EditorState.create({
    extensions: [
      basicSetup,
      markdown(),
      yCollab(ytext, awareness),
      EditorView.theme({
        "&": {
          height: "70vh",
          fontSize: "14px",
          border: "1px solid #ccc",
          borderRadius: "0 0 4px 4px",
        },
        ".cm-scroller": { overflow: "auto" },
      }),
    ],
  });
}

function mountCollaborativeEditor({
  parent,
  pageSlug,
  username,
  initialContent,
  authFetch,
  editorViewRef,
  setStatus,
  setActiveUsers,
  setConnectedUsers,
  setPreviewContent,
  setSaveStatus,
}) {
  let destroyed = false;
  let saveTimeoutId = null;
  // Explicit dirty flag — set true on any user edit, false after a successful
  // save. Used in cleanup to decide whether a flush is needed regardless of
  // whether the debounce timer is still pending.
  let isDirty = false;
  // Tracks whether the initial Yjs sync has completed. While false, ytext
  // changes come from the server (not the user) and must not trigger a save.
  let syncComplete = false;

  // 1. Yjs document
  const ydoc = new Y.Doc();

  // 2. Connect to FastAPI WebSocket relay
  const provider = new WebsocketProvider(WS_BASE_URL, pageSlug, ydoc);

  // 3. Set presence info for this user (name + color for awareness UI)
  provider.awareness.setLocalStateField("user", {
    name: username,
    color: randomCollaboratorColor(),
  });
  // Tell Yjs to consider a peer offline after this many ms of silence
  provider.awareness.outdatedTimeout = AWARENESS_OUTDATED_MS;

  const syncPresenceFromAwareness = () => {
    const { users, connectedCount } = usersFromAwarenessStates(
      provider.awareness.getStates()
    );
    setActiveUsers(users);
    setConnectedUsers(connectedCount);
  };

  // 4. Track WebSocket connection status
  const onProviderStatus = (event) => setStatus(event.status);

  // 6. The shared text field inside the Yjs doc (same field CodeMirror binds to)
  const ytext = ydoc.getText("codemirror");

  // PUT the current markdown to the backend (debounced path).
  const saveToBackend = async () => {
    if (destroyed) return;
    setSaveStatus("saving");
    try {
      await authFetch(`/api/pages/${pageSlug}`, {
        method: "PUT",
        body: JSON.stringify({
          body: ytext.toString(),
          last_edited_by: username,
        }),
      });
      isDirty = false;
      if (!destroyed) setSaveStatus("saved");
    } catch (err) {
      console.error("Save failed:", err);
      if (!destroyed) setSaveStatus("error");
    }
  };

  // Best-effort save used during teardown (page navigation, tab close).
  // keepalive: true lets the browser complete the fetch even after the page/
  // component is gone, which is the only reliable way to save on unload.
  const flushSave = () => {
    if (!isDirty) return;
    isDirty = false;
    authFetch(`/api/pages/${pageSlug}`, {
      method: "PUT",
      keepalive: true,
      body: JSON.stringify({
        body: ytext.toString(),
        last_edited_by: username,
      }),
    }).catch(() => {});
  };

  const scheduleDebouncedSave = () => {
    isDirty = true;
    clearTimeout(saveTimeoutId);
    saveTimeoutId = setTimeout(saveToBackend, SAVE_DEBOUNCE_MS);
  };

  // Seed the Yjs doc from the API response only when we are the first user in
  // the room (ytext is still empty after the server's sync-step-2 arrives).
  // The server now implements the y-websocket protocol, so this event fires
  // reliably once the initial handshake completes.
  const onInitialSync = (isSynced) => {
    if (!isSynced || destroyed) return;
    if (ytext.toString() === "" && initialContent) {
      ydoc.transact(() => ytext.insert(0, initialContent));
    }
    // Allow saves only after this point — changes before here are server-
    // delivered state, not user edits.
    syncComplete = true;
    provider.off("sync", onInitialSync);
  };
  provider.on("sync", onInitialSync);

  // Mirror ytext into React state for the preview; debounce saves to the API.
  // Guard on syncComplete so that the server's initial sync payload (or the
  // DB seed insert above) never triggers a spurious save back to the DB.
  const onYtextChange = () => {
    if (!destroyed) setPreviewContent(ytext.toString());
    if (syncComplete) scheduleDebouncedSave();
  };

  // On tab close / page refresh: cancel the pending debounce and flush
  // immediately via a keepalive fetch so the save actually completes.
  const handleBeforeUnload = () => {
    clearTimeout(saveTimeoutId);
    flushSave();
  };

  provider.on("status", onProviderStatus);
  // 5. Track how many users are in the room (awareness changes)
  provider.awareness.on("change", syncPresenceFromAwareness);
  ytext.observe(onYtextChange);
  window.addEventListener("beforeunload", handleBeforeUnload);

  // 8. Mount CodeMirror into the DOM
  const view = new EditorView({
    state: createMirrorEditorState(ytext, provider.awareness),
    parent,
  });
  editorViewRef.current = view;

  // 9. Cleanup on unmount (triggered by page navigation or slug/username change)
  return () => {
    // Cancel any pending debounce and flush if there are unsaved edits.
    // This is the path that fires when the user switches to another page.
    clearTimeout(saveTimeoutId);
    flushSave();

    destroyed = true;
    ytext.unobserve(onYtextChange);
    window.removeEventListener("beforeunload", handleBeforeUnload);
    provider.off("status", onProviderStatus);
    provider.off("sync", onInitialSync);
    provider.awareness.off("change", syncPresenceFromAwareness);
    editorViewRef.current = null;
    view.destroy();
    provider.disconnect();
    provider.destroy();
    ydoc.destroy();
  };
}

function CollaborativeEditor({ pageSlug, username, onNavigate }) {
  const { authFetch } = useAuth();
  const editorContainerRef = useRef(null);
  // Ref to the mounted EditorView (Toolbar uses this to apply formatting)
  const editorViewRef = useRef(null);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [status, setStatus] = useState("connecting");
  const [activeUsers, setActiveUsers] = useState([]);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [previewContent, setPreviewContent] = useState("");
  const [viewMode, setViewMode] = useState("split"); // "edit" | "split" | "preview"
  const [pageLoading, setPageLoading] = useState(true);
  const [pageInfo, setPageInfo] = useState(null); // { last_editor, updated_at }

  useEffect(() => {
    if (!editorContainerRef.current) return;

    // cancelled is set to true by the cleanup function if pageSlug/username
    // changes while the initial fetch is still in flight. It prevents the
    // editor from mounting in a zombie state after the effect is superseded.
    let cancelled = false;
    let teardown = null;

    setPageLoading(true);

    const initEditor = async () => {
      let initialContent = "";
      try {
        const res = await authFetch(`/api/pages/${pageSlug}`);
        if (res.ok) {
          const page = await res.json();
          initialContent = page.body ?? "";
          if (!cancelled) {
            setPreviewContent(initialContent);
            setPageInfo({
              lastEditor: page.last_editor?.username ?? null,
              updatedAt: page.updated_at ?? null,
            });
          }
        }
      } catch (err) {
        console.error("Failed to load page content:", err);
      } finally {
        if (!cancelled) setPageLoading(false);
      }

      // If the effect was cleaned up while the fetch was in flight, bail out.
      if (cancelled || !editorContainerRef.current) return;

      teardown = mountCollaborativeEditor({
        parent: editorContainerRef.current,
        pageSlug,
        username,
        initialContent,
        authFetch,
        editorViewRef,
        setStatus,
        setActiveUsers,
        setConnectedUsers,
        setPreviewContent,
        setSaveStatus,
      });
    };

    initEditor();

    return () => {
      cancelled = true;
      // teardown may be null if the fetch hadn't returned yet — in that case
      // the cancelled flag above prevents the editor from ever mounting.
      teardown?.();
    };
  }, [pageSlug, username, authFetch]);

  return (
    <div>
      {/* Status bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        marginBottom: "0.5rem",
        fontSize: "13px",
        color: "#555",
      }}>
        <span>
          Status:{" "}
          <strong style={{ color: status === "connected" ? "green" : "orange" }}>
            {status}
          </strong>
        </span>
        <span>Users editing: <strong>{connectedUsers}</strong></span>
        {pageInfo?.lastEditor && (
          <span style={{ color: "#999" }}>
            Last edited by <strong>{pageInfo.lastEditor}</strong>
            {pageInfo.updatedAt && <> · {formatRelativeTime(pageInfo.updatedAt)}</>}
          </span>
        )}
        <span style={{
          marginLeft: "auto",
          color: saveStatus === "saved" ? "green" : saveStatus === "error" ? "red" : "#999",
        }}>
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed"}
        </span>
      </div>

      {/* Active user pills */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        {activeUsers.map((user) => (
          <div 
            key={user.clientId} 
            style={{
              backgroundColor: user.color,
              color: "#fff",
              padding: "2px 10px",
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: "bold",
            }}
          >
            {user.name}
          </div>
        ))}
      </div>

      {/* View mode toggle */}
      <div style={{ display: "flex", justifyContent: "center", gap: "4px", marginBottom: "0" }}>
        {["edit", "split", "preview"].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            style={{
              padding: "4px 12px",
              fontSize: "15px",
              cursor: "pointer",
              border: "1px solid #ccc",
              borderBottom: viewMode === mode ? "1px solid white" : "1px solid #f5f5f5",
              borderRadius: "4px 4px 0 0",
              backgroundColor: viewMode === mode ? "#f5f5f5" : "#fff",
              fontWeight: viewMode === mode ? "bold" : "normal",
              textTransform: "capitalize",
            }}
          >
            {mode}
          </button>
        ))}
      </div>

      {/* Toolbar - always visible */}
      <Toolbar editorViewRef={editorViewRef} />

      {/* Editor and/or Preview panes */}
      <div style={{ display: "flex", gap: "0" }}>

        {/* Editor pane - hidden in preview mode */}
        <div
          style={{
            flex: 1,
            display: viewMode === "preview" ? "none" : "block",
          }}
        >
          {pageLoading && (
            <div style={{ padding: "1rem", color: "#999", fontSize: "13px" }}>
              Loading page…
            </div>
          )}
          <div ref={editorContainerRef} />
        </div>

        {/* Preview pane - hidden in edit mode */}
        {viewMode !== "edit" && (
          <div style={{ flex: 1, borderLeft: viewMode === "split" ? "2px solid #eee" : "none" }}>
            <Preview content={previewContent} onNavigate={onNavigate} />
          </div>
        )}
      </div>
    </div>
  );
}

export default CollaborativeEditor;
