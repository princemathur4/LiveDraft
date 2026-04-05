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
import "./CollaborativeEditor.css";

const WS_BASE_URL = "ws://localhost:8000/ws";

function CollaborativeEditor({ pageSlug, username }) {
  const editorContainerRef = useRef(null);
  const editorViewRef = useRef(null);
  const [connectedUsers, setConnectedUsers] = useState(0);
  const [status, setStatus] = useState("connecting");
  const [activeUsers, setActiveUsers] = useState([]);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [previewContent, setPreviewContent] = useState("");
  const [viewMode, setViewMode] = useState("split"); // "edit" | "split" | "preview"

  useEffect(() => {
        // Guard: do not mount if the ref is not ready

    if (!editorContainerRef.current) return;

    let isDestroyed = false;
    
    // 1. Yjs document
    const ydoc = new Y.Doc();

    // 2. Connect to FastAPI WebSocket relay
    const provider = new WebsocketProvider(WS_BASE_URL, pageSlug, ydoc);

    // 3. Set presence info for this user
    const generateColor = () => "#" + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, "0");
    provider.awareness.setLocalStateField("user", {
      name: username,
      color: generateColor(),
    });
    // Tell Yjs to consider a peer offline after 5 seconds of silence
    provider.awareness.outdatedTimeout = 5000; // ms

    // 4. Track connection status
    provider.on("status", (event) => setStatus(event.status));


    // 5. Track how many users are in the room
    provider.awareness.on("change", () => {
      const states = provider.awareness.getStates();
      const users = [];
      states.forEach((state, clientId) => {
        if (state.user) {
          users.push({ clientId, name: state.user.name, color: state.user.color });
        }
      });
      setActiveUsers(users);
      setConnectedUsers(states.size);
    });

    // 6. The shared text field inside the Yjs doc
    const ytext = ydoc.getText("codemirror");

    // Mirror ytext into previewContent state on every change
    const onYtextChange = () => {
      if (!isDestroyed) {
        setPreviewContent(ytext.toString());
      }
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveToBackend, 2000);
    };

    let saveTimeout = null;

    const saveToBackend = async () => {
      if (isDestroyed) return;
      setSaveStatus("saving");
      try {
        await fetch(`http://localhost:8000/api/pages/${pageSlug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: ytext.toString(), last_edited_by: username }),
        });
        setSaveStatus("saved");
      } catch (err) {
        console.error("Save failed:", err);
        setSaveStatus("error");
      }
    };

    const handleBeforeUnload = () => saveToBackend();

    ytext.observe(onYtextChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    // 7. Build CodeMirror editor
    const state = EditorState.create({
      extensions: [
        basicSetup,
        markdown(),
        yCollab(ytext, provider.awareness),
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

    // 8. Mount into the DOM
    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    editorViewRef.current = view;

    // 9. Cleanup on unmount
    return () => {
      isDestroyed = true;
      ytext.unobserve(onYtextChange);
      clearTimeout(saveTimeout);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      editorViewRef.current = null;
      view.destroy();
      provider.disconnect();
      provider.destroy();
      ydoc.destroy();
    };
  }, [pageSlug, username]);

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
              // border: viewMode === mode ? "1px solid white" : "1px solid #f5f5f5",
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
          ref={editorContainerRef}
          style={{
            flex: 1,
            display: viewMode === "preview" ? "none" : "block",
          }}
        />

        {/* Preview pane - hidden in edit mode */}
        {viewMode !== "edit" && (
          <div style={{ flex: 1, borderLeft: viewMode === "split" ? "2px solid #eee" : "none" }}>
            <Preview content={previewContent} />
          </div>
        )}
      </div>
    </div>
  );
}

export default CollaborativeEditor;
