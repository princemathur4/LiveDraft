import { useState, useEffect } from "react";
import "./PageNode.scss";

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
function PageNode({ node, activeSlug, onPageClick, onAddClick, onDelete, onRename, depth = 0 }) {
  const hasActiveChild = hasActiveInSubtree(node, activeSlug);
  const [isOpen, setIsOpen] = useState(depth === 0 || hasActiveChild);
  const hasChildren = node.children && node.children.length > 0;
  const isActive = node.slug === activeSlug;
  const [showAddButton, setShowAddButton] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);

  // Auto-expand when activeSlug changes and points to a descendant
  useEffect(() => {
    if (hasActiveChild && !isOpen) {
      setIsOpen(true);
    }
  }, [activeSlug, hasActiveChild]);

  // Close context menu when clicking anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [contextMenu]);

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleDelete = async () => {
    if (onDelete) {
      await onDelete(node.slug, node.title);
    }
    setContextMenu(null);
  };

  const handleRename = () => {
    if (onRename) {
      onRename(node.slug, node.title);
    }
    setContextMenu(null);
  };

  return (
    <div className="page-node__wrapper">
      {/* Page row */}
      <div
        className={`page-node__row ${isActive ? "page-node__row--active" : ""}`}
        style={{ paddingLeft: `${depth * 0.75}rem` }}
        onContextMenu={handleContextMenu}
        onMouseEnter={(e) => {
          // if (!isActive) e.currentTarget.style.backgroundColor = "#f0f0f0";
          setShowAddButton(true);
        }}
        onMouseLeave={(e) => {
          // if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
          setShowAddButton(false);
        }}
      >
        {/* Expand/collapse toggle - only shown if page has children */}
        {hasChildren && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) setIsOpen((prev) => !prev);
            }}
            className="page-node__toggle"
          >
            {isOpen ? "▾" : "▸"}
          </span>
        )}

        {/* Page icon + title */}
        <span
          onClick={() => onPageClick(node.slug)}
          className="page-node__content"
        >
          <span className="page-node__icon">
            {hasChildren ? "📂" : "📄"}
          </span>
          <span className="page-node__title">
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
            className="page-node__add-btn"
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
        <div className="page-node__children" style={{ marginLeft: `${0.75 + depth * 1}rem` }}>
          {node.children.map((child) => (
            <PageNode
              key={child.id}
              node={child}
              activeSlug={activeSlug}
              onPageClick={onPageClick}
              onAddClick={onAddClick}
              onDelete={onDelete}
              onRename={onRename}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="page-node__context-menu"
          style={{
            position: "fixed",
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {onRename && (
            <button
              className="page-node__context-menu-item"
              onClick={handleRename}
            >
              ✏️ Rename
            </button>
          )}
          {onDelete && (
            <button
              className="page-node__context-menu-item page-node__context-menu-item--delete"
              onClick={handleDelete}
            >
              🗑️ Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PageNode;
