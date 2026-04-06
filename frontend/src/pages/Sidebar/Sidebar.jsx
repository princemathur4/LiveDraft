import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";

// Helper function to check if activeSlug is in this node's subtree
function hasActiveInSubtree(node, activeSlug) {
  if (node.slug === activeSlug) return true;
  if (node.children) {
    return node.children.some((child) => hasActiveInSubtree(child, activeSlug));
  }
  return false;
}

// ── Single page node in the tree ─────────────────────────────────────────────
// Renders the page title as a clickable item.
// If the page has children, shows a toggle arrow to expand/collapse them.
function PageNode({ node, activeSlug, onPageClick, onAddClick, depth = 0 }) {
  const hasActiveChild = hasActiveInSubtree(node, activeSlug);
  const [isOpen, setIsOpen] = useState(depth === 0 || hasActiveChild); // root pages and parents of active page open by default
  const hasChildren = node.children && node.children.length > 0;
  const isActive = node.slug === activeSlug;
  const [showAddButton, setShowAddButton] = useState(false);

  // Auto-expand when activeSlug changes and points to a descendant
  useEffect(() => {
    if (hasActiveChild && !isOpen) {
      setIsOpen(true);
    }
  }, [activeSlug, hasActiveChild]);

  return (
    <div>
      {/* Page row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          // Slightly tighter horizontal spacing for nested items.
          paddingLeft: `${depth * 0.75}rem`,
          paddingRight: "0.125rem",
          paddingTop: "4px",
          paddingBottom: "4px",
          borderRadius: "4px",
          cursor: "pointer",
          backgroundColor: isActive ? "#e8e8ff" : "transparent",
          color: isActive ? "#4f46e5" : "#333",
          fontWeight: isActive ? "600" : "normal",
          fontSize: "15px",
          userSelect: "none",
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = "#f0f0f0";
          setShowAddButton(true);
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
          setShowAddButton(false);
        }}
      >
        {/* Expand/collapse toggle - only shown if page has children */}
        {hasChildren &&
          <span
            onClick={(e) => {
              e.stopPropagation(); // do not trigger page open
              if (hasChildren) setIsOpen((prev) => !prev);
            }}
            style={{
              width: "16px",
              marginRight: "4px",
              fontSize: "16px",
              color: "#999",
              flexShrink: 0,
              visibility: hasChildren ? "visible" : "hidden",
            }}
          >
            {isOpen ? "▾" : "▸"}
          </span>
        }

        {/* Page icon + title */}
        <span
          onClick={() => onPageClick(node.slug)}
          style={{ display: "flex", alignItems: "center", gap: "5px", flex: 1, minWidth: 0, whiteSpace: "nowrap" }}
        >
          <span style={{ fontSize: "15px", flexShrink: 0 }}>
            {hasChildren ? "📂" : "📄"}
          </span>
          <span style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {node.title}
          </span>
        </span>

        {/* Add child page button - shown on hover */}
        {showAddButton && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddClick(node.id);
            }}
            title="Add child page"
            style={{
              flexShrink: 0,
              width: "20px",
              height: "20px",
              padding: "0",
              marginLeft: "4px",
              border: "none",
              borderRadius: "3px",
              backgroundColor: "#e5e7eb",
              color: "#4f46e5",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#d1d5db";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#e5e7eb";
            }}
          >
            +
          </button>
        )}
      </div>

      {/* Recursively render children if expanded */}
      {hasChildren && isOpen && (
        <div style={{ borderLeft: "1px solid #e5e5e5", marginLeft: `${0.75 + depth * 1}rem` }}>
          {node.children.map((child) => (
            <PageNode
              key={child.id}
              node={child}
              activeSlug={activeSlug}
              onPageClick={onPageClick}
              onAddClick={onAddClick}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}


// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ onPageClick, activeSlug, onPageCreated }) {
  const { authFetch } = useAuth();
  const [tree, setTree]         = useState([]);   // nested tree from API
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [creating, setCreating] = useState(false); // show new page input
  const [newTitle, setNewTitle] = useState("");
  const [newParentId, setNewParentId] = useState(null); // null = root page

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

      // Refresh the tree to show the new page
      await fetchTree();

      // Navigate to the new page
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
    <div style={{
      width: "260px",
      minHeight: "100vh",
      borderRight: "1px solid #e5e5e5",
      backgroundColor: "#fafafa",
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        padding: "1rem",
        borderBottom: "1px solid #e5e5e5",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontWeight: "bold", fontSize: "20px" }}>SyncScribe</span>
        <button
          onClick={() => { setNewParentId(null); setCreating((prev) => !prev); }}
          title="New root-level page"
          style={{
            border: "none",
            fontWeight: 700,
            background: "none",
            cursor: "pointer",
            fontSize: "20px",
            color: "#4f46e5",
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* New page form */}
      {creating && (
        <form
          onSubmit={handleCreatePage}
          style={{
            padding: "0.75rem 1rem",
            borderBottom: "1px solid #e5e5e5",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {newParentId && (
            <div style={{
              fontSize: "13px",
              color: "#666",
              padding: "4px 6px",
              backgroundColor: "#f0f0f0",
              borderRadius: "3px",
              borderLeft: "3px solid #4f46e5",
            }}>
              Creating child of: <strong>{flatPages.find(p => p.id === newParentId)?.title || 'Unknown'}</strong>
            </div>
          )}
          <input
            autoFocus
            placeholder="Page title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{
              padding: "5px 8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "15px",
            }}
          />

          {/* Parent page selector */}
          <select
            value={newParentId ?? ""}
            onChange={(e) => setNewParentId(e.target.value ? Number(e.target.value) : null)}
            style={{
              padding: "5px 8px",
              border: "1px solid #ccc",
              borderRadius: "4px",
              fontSize: "15px",
              color: "#555",
            }}
          >
            <option value="">No parent (root page)</option>
            {flatPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: "5px",
                backgroundColor: "#4f46e5",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "15px",
              }}
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setNewTitle(""); setNewParentId(null); }}
              style={{
                flex: 1,
                padding: "5px",
                backgroundColor: "#fff",
                border: "1px solid #ccc",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "15px",
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Tree content */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto", padding: "0.5rem" }}>
        {loading && (
          <p style={{ fontSize: "15px", color: "#999", padding: "0.5rem" }}>
            Loading...
          </p>
        )}

        {error && (
          <p style={{ fontSize: "15px", color: "red", padding: "0.5rem" }}>
            {error}
          </p>
        )}

        {!loading && !error && tree.length === 0 && (
          <p style={{ fontSize: "15px", color: "#999", padding: "0.5rem" }}>
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
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}

export default Sidebar;