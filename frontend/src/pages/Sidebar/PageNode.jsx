import { useState, useEffect } from "react";
import "./PageNode.css";

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
  const [isOpen, setIsOpen] = useState(depth === 0 || hasActiveChild);
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
        className={`page-node__row ${isActive ? "page-node__row--active" : ""}`}
        style={{ paddingLeft: `${depth * 0.75}rem` }}
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PageNode;
