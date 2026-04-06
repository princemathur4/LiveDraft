import "./Toolbar.css";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code2,
  CodeSquare,
} from "lucide-react";

function Toolbar({ editorViewRef, pageTitle }) {

  // Wraps the currently selected text with a prefix and suffix
  // e.g. prefix="**" suffix="**" turns "hello" into "**hello**"
  const wrapSelection = (prefix, suffix) => {
    const view = editorViewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: {
        from,
        to,
        insert: `${prefix}${selectedText}${suffix}`,
      },
      // Move cursor to end of inserted text
      selection: { anchor: from + prefix.length + selectedText.length + suffix.length },
    });

    view.focus();
  };

  // Inserts a prefix at the start of the current line
  const insertLinePrefix = (prefix) => {
    const view = editorViewRef.current;
    if (!view) return;

    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);

    view.dispatch({
      changes: {
        from: line.from,
        to: line.from,
        insert: prefix,
      },
    });

    view.focus();
  };

  const buttons = [
    { icon: Bold,       title: "Bold",          action: () => wrapSelection("**", "**"),  modifier: "bold" },
    { icon: Italic,     title: "Italic",        action: () => wrapSelection("*", "*"),    modifier: "italic" },
    { icon: Strikethrough, title: "Strikethrough", action: () => wrapSelection("~~", "~~"), modifier: null },
    { icon: Heading1,   title: "Heading 1",     action: () => insertLinePrefix("# "),     modifier: null },
    { icon: Heading2,   title: "Heading 2",     action: () => insertLinePrefix("## "),    modifier: null },
    { icon: Heading3,   title: "Heading 3",     action: () => insertLinePrefix("### "),   modifier: null },
    { icon: List,       title: "Bullet List",   action: () => insertLinePrefix("- "),     modifier: null },
    { icon: ListOrdered, title: "Numbered List", action: () => insertLinePrefix("1. "),   modifier: null },
    { icon: Quote,      title: "Blockquote",    action: () => insertLinePrefix("> "),     modifier: null },
    { icon: Code2,      title: "Inline Code",   action: () => wrapSelection("`", "`"),    modifier: "mono" },
    { icon: CodeSquare, title: "Code Block",    action: () => wrapSelection("```\n", "\n```"), modifier: "mono" },
  ];

  return (
    <div className="toolbar">
      {pageTitle && (
        <div className="toolbar__title">
          {pageTitle}
        </div>
      )}
      <div className="toolbar__buttons">
        {buttons.map((btn) => {
          const IconComponent = btn.icon;
          return (
            <button
              key={btn.title}
              type="button"
              title={btn.title}
              className={["toolbar__button", btn.modifier && `toolbar__button--${btn.modifier}`].filter(Boolean).join(" ")}
              onClick={btn.action}
            >
              <IconComponent size={18} strokeWidth={2} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Toolbar;
