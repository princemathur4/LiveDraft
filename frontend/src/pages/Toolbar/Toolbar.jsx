import "./Toolbar.css";

function Toolbar({ editorViewRef }) {

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
    { label: "B",      title: "Bold",          action: () => wrapSelection("**", "**"),  modifier: "bold" },
    { label: "I",      title: "Italic",         action: () => wrapSelection("*", "*"),    modifier: "italic" },
    { label: "~~S~~",  title: "Strikethrough",  action: () => wrapSelection("~~", "~~"), modifier: null },
    { label: "H1",     title: "Heading 1",      action: () => insertLinePrefix("# "),     modifier: null },
    { label: "H2",     title: "Heading 2",      action: () => insertLinePrefix("## "),    modifier: null },
    { label: "H3",     title: "Heading 3",      action: () => insertLinePrefix("### "),   modifier: null },
    { label: "• List", title: "Bullet List",    action: () => insertLinePrefix("- "),     modifier: null },
    { label: "1. List",title: "Numbered List",  action: () => insertLinePrefix("1. "),   modifier: null },
    { label: "> Quote",title: "Blockquote",     action: () => insertLinePrefix("> "),     modifier: null },
    { label: "</>",    title: "Inline Code",    action: () => wrapSelection("`", "`"),    modifier: "mono" },
    { label: "```",    title: "Code Block",     action: () => wrapSelection("```\n", "\n```"), modifier: "mono" },
  ];

  return (
    <div className="toolbar">
      {buttons.map((btn) => (
        <button
          key={btn.title}
          type="button"
          title={btn.title}
          className={["toolbar__button", btn.modifier && `toolbar__button--${btn.modifier}`].filter(Boolean).join(" ")}
          onClick={btn.action}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

export default Toolbar;
