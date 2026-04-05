import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import DOMPurify from "dompurify";
import "highlight.js/styles/github.css";

function Preview({ content }) {
  const sanitized = DOMPurify.sanitize(content);

  return (
    <div style={{
      padding: "1rem",
      border: "1px solid #ccc",
      borderRadius: "0 0 4px 4px",
      height: "66vh",
      overflowY: "auto",
      fontSize: "14px",
      lineHeight: "1.6",
      fontFamily: "sans-serif",
      backgroundColor: "#fafafa",
    }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {sanitized}
      </ReactMarkdown>
    </div>
  );
}

export default Preview;