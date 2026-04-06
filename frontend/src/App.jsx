import { useCallback, useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import Sidebar from "./pages/Sidebar";
import CollaborativeEditor from "./pages/Editor";
import "./App.css";

// ── Search bar + results dropdown ────────────────────────────────────────────
function SearchBar({ onNavigateToSlug }) {
  const { authFetch } = useAuth();
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen]       = useState(false);
  const debounceRef           = useRef(null);
  const wrapperRef            = useRef(null);

  const search = useCallback(
    async (q) => {
      if (!q.trim()) { setResults([]); setOpen(false); return; }
      try {
        const res = await authFetch(`/api/pages/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setOpen(true);
        }
      } catch { /* ignore */ }
    },
    [authFetch]
  );

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 250);
  };

  const handleSelect = (slug) => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onNavigateToSlug(slug);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="search"
        placeholder="Search pages…"
        value={query}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        style={{
          width: "100%",
          padding: "8px 14px",
          border: "1px solid #ddd",
          borderRadius: "8px",
          fontSize: "15px",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && results.length > 0 && (
        <div className="search-dropdown">
          {results.map((r) => (
            <div
              key={r.slug}
              className="search-result"
              onMouseDown={() => handleSelect(r.slug)}
            >
              <div className="search-result__title">{r.title}</div>
              <div
                className="search-result__snippet"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(r.snippet, { ALLOWED_TAGS: ["mark"] }) }}
              />
            </div>
          ))}
        </div>
      )}
      {open && results.length === 0 && query.trim() && (
        <div className="search-dropdown">
          <div style={{ padding: "8px 12px", color: "#999", fontSize: "13px" }}>
            No results found
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main app shell ────────────────────────────────────────────────────────────
function AppContent() {
  const { user, logout, authFetch, isInitialized } = useAuth();
  const [currentSlug, setCurrentSlug] = useState(null);
  const [authScreen, setAuthScreen]   = useState("login");

  // Wiki-link navigation: [[Page Name]] → find slug by title, then open it
  const navigateByTitle = useCallback(
    async (title) => {
      try {
        const res = await authFetch(`/api/pages/search?q=${encodeURIComponent(title)}`);
        if (res.ok) {
          const results = await res.json();
          // Pick the first result whose title matches exactly (case-insensitive)
          const exact = results.find(
            (r) => r.title.toLowerCase() === title.toLowerCase()
          ) ?? results[0];
          if (exact) setCurrentSlug(exact.slug);
        }
      } catch { /* ignore */ }
    },
    [authFetch]
  );

  if (!isInitialized) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#999" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    if (authScreen === "login") {
      return <LoginPage onSwitch={() => setAuthScreen("register")} onSuccess={() => {}} />;
    }
    return <RegisterPage onSwitch={() => setAuthScreen("login")} onSuccess={() => {}} />;
  }

  return (
    <div className="app-layout">
      <Sidebar onPageClick={setCurrentSlug} activeSlug={currentSlug} />

      <div className="app-layout__main-column">
        <div className="app-layout__topbar">
          {/* left spacer — keeps search centred via the 1fr | auto | 1fr grid */}
          <div />
          <div className="app-layout__topbar-search">
            <SearchBar onNavigateToSlug={setCurrentSlug} />
          </div>
          <div className="app-layout__topbar-right">
            <span>Signed in as <strong>{user.username}</strong></span>
            <button type="button" className="app-layout__signout" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>

        <div className="app-layout__content">
          {currentSlug ? (
            <CollaborativeEditor
              pageSlug={currentSlug}
              username={user.username}
              onNavigate={navigateByTitle}
            />
          ) : (
            <div className="app-layout__placeholder">
              <h2>Welcome, {user.username}</h2>
              <p>Select a page from the sidebar or create a new one to get started.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
