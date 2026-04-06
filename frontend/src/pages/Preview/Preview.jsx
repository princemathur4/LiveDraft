import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
import "./Preview.scss";

// Convert [[Page Name]] wiki-link syntax into a standard markdown link using a
// special #wiki: anchor prefix that the custom link renderer below recognises.
// This runs as a string pre-pass before ReactMarkdown parses, so no remark
// plugin is needed.
function preprocessWikiLinks(content) {
  return content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_, title) => `[${title}](#wiki:${encodeURIComponent(title)})`
  );
}

function Preview({ content, onNavigate }) {
  const processed = preprocessWikiLinks(content);

  return (
    <div className="preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Intercept all links:
          //   #wiki:... → clickable span that calls onNavigate(pageTitle)
          //   anything else → normal anchor opening in a new tab
          a({ href, children, ...props }) {
            if (href?.startsWith("#wiki:")) {
              const title = decodeURIComponent(href.slice(6));
              return (
                <span
                  className="wiki-link"
                  role="link"
                  tabIndex={0}
                  title={`Navigate to: ${title}`}
                  onClick={() => onNavigate?.(title)}
                  onKeyDown={(e) => e.key === "Enter" && onNavigate?.(title)}
                >
                  {children}
                </span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}

export default Preview;
