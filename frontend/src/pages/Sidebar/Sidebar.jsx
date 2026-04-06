import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import PageNode from "./PageNode";
import "./Sidebar.scss";

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ onPageClick, activeSlug, onPageCreated }) {
  const { authFetch } = useAuth();
  const [tree, setTree]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newParentId, setNewParentId] = useState(null);

  const fetchTree = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch("/api/pages/tree");
      if (!res.ok) throw new Error("Failed to load pages");
      const data = await res.json();
      setTree(data);
    } catch (err) {
      setError("Could not load pages.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const handleAddPage = (parentId) => {
    setNewParentId(parentId);
    setNewTitle("");
    setCreating(true);
  };

  const handleDeletePage = async (slug, title) => {
    if (!window.confirm(`Delete "${title}"? All subpages will be deleted. This cannot be undone.`)) {
      return;
    }

    try {
      const res = await authFetch(`/api/pages/${slug}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete page");
      await fetchTree();
    } catch (err) {
      console.error(err);
      alert("Failed to delete page.");
    }
  };

  const handleRenamePage = async (slug, currentTitle) => {
    const newTitle = window.prompt("New page title:", currentTitle);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === currentTitle) {
      return;
    }

    try {
      const res = await authFetch(`/api/pages/${slug}`, {
        method: "PUT",
        body: JSON.stringify({ title: newTitle.trim() }),
      });

      if (!res.ok) throw new Error("Failed to rename page");
      await fetchTree();
    } catch (err) {
      console.error(err);
      alert("Failed to rename page.");
    }
  };

  const handleCreatePage = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await authFetch("/api/pages", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          body: "",
          parent_id: newParentId,
        }),
      });

      if (!res.ok) throw new Error("Failed to create page");
      const newPage = await res.json();

      setNewTitle("");
      setCreating(false);
      setNewParentId(null);

      await fetchTree();
      onPageClick(newPage.slug);
      if (onPageCreated) onPageCreated(newPage);
    } catch (err) {
      console.error(err);
      alert("Failed to create page. Make sure you are logged in.");
    }
  };

  // Flatten the tree to build a simple list for the parent selector dropdown
  const flattenTree = (nodes, result = []) => {
    for (const node of nodes) {
      result.push({ id: node.id, title: node.title });
      if (node.children?.length) flattenTree(node.children, result);
    }
    return result;
  };
  const flatPages = flattenTree(tree);

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar__header">
        <h1 className="sidebar__brand">SyncScribe</h1>
        <button
          onClick={() => { setNewParentId(null); setCreating((prev) => !prev); }}
          className="sidebar__new-page-btn"
          title="Create a new page"
        >
          + New Page
        </button>
      </div>

      {/* New page form */}
      {creating && (
        <form
          onSubmit={handleCreatePage}
          className="sidebar__form"
        >
          {newParentId && (
            <div className="sidebar__form-info">
              Creating child of: <strong>{flatPages.find(p => p.id === newParentId)?.title || 'Unknown'}</strong>
            </div>
          )}
          <input
            autoFocus
            placeholder="Page title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="sidebar__input"
          />

          {/* Parent page selector */}
          <select
            value={newParentId ?? ""}
            onChange={(e) => setNewParentId(e.target.value ? Number(e.target.value) : null)}
            className="sidebar__select"
          >
            <option value="">No parent (root page)</option>
            {flatPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <div className="sidebar__form-buttons">
            <button
              type="submit"
              className="sidebar__btn-primary"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewTitle(""); setNewParentId(null); }}
              className="sidebar__btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Tree content */}
      <div className="sidebar__tree">
        {loading && (
          <p className="sidebar__status">
            Loading...
          </p>
        )}

        {error && (
          <p className="sidebar__error">
            {error}
          </p>
        )}

        {!loading && !error && tree.length === 0 && (
          <p className="sidebar__status">
            No pages yet. Click + to create one.
          </p>
        )}

        {!loading && tree.map((node) => (
          <PageNode
            key={node.id}
            node={node}
            activeSlug={activeSlug}
            onPageClick={onPageClick}
            onAddClick={handleAddPage}
            onDelete={handleDeletePage}
            onRename={handleRenamePage}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

export default Sidebar;
