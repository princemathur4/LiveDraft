import { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import DOMPurify from "dompurify";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import Sidebar from "./pages/Sidebar";
import CollaborativeEditor from "./pages/Editor";
import "./App.scss";

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
        className="search-input"
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
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const urlSlug = location.pathname.match(/^\/page\/(.+)/)?.[1] ?? null;
  const [currentSlug, setCurrentSlug] = useState(urlSlug || null);
  const [sidebarKey, setSidebarKey]   = useState(0);

  // Update URL when slug changes
  useEffect(() => {
    if (!urlSlug && currentSlug) {
      navigate(`/page/${currentSlug}`, { replace: true });
    }
  }, [currentSlug, urlSlug, navigate]);

  // Update currentSlug when URL changes
  useEffect(() => {
    if (urlSlug) {
      setCurrentSlug(urlSlug);
    }
  }, [urlSlug]);

  // Handle navigation to a page by slug
  const handleNavigateToSlug = useCallback((slug) => {
    setCurrentSlug(slug);
    navigate(`/page/${slug}`);
  }, [navigate]);

  // Wiki-link navigation: [[Page Name]] → find slug by title, then open it
  const navigateByTitle = useCallback(
    async (title) => {
      try {
        const res = await authFetch(`/api/pages/search?q=${encodeURIComponent(title)}`);
        if (res.ok) {
          const results = await res.json();
          const exact = results.find(
            (r) => r.title.toLowerCase() === title.toLowerCase()
          ) ?? results[0];
          if (exact) handleNavigateToSlug(exact.slug);
        }
      } catch { /* ignore */ }
    },
    [authFetch, handleNavigateToSlug]
  );

  if (!isInitialized) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#999" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage onSwitch={() => navigate("/register")} onSuccess={() => navigate("/")} />} />
        <Route path="/register" element={<RegisterPage onSwitch={() => navigate("/login")} onSuccess={() => navigate("/")} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar key={sidebarKey} onPageClick={handleNavigateToSlug} activeSlug={currentSlug} />

      <div className="app-layout__main-column">
        <div className="app-layout__topbar">
          {/* left spacer — keeps search centred via the 1fr | auto | 1fr grid */}
          <div />
          <div className="app-layout__topbar-search">
            <SearchBar onNavigateToSlug={handleNavigateToSlug} />
          </div>
          <div className="app-layout__topbar-right">
            <button
              type="button"
              className="app-layout__theme-toggle"
              onClick={toggleTheme}
              title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
            <span>Signed in as <strong>{user.username}</strong></span>
            <button type="button" className="app-layout__signout" onClick={() => {
              setCurrentSlug(null);
              logout();
              navigate("/login");
            }}>
              Sign out
            </button>
          </div>
        </div>

        <div className="app-layout__content">
          <Routes>
            <Route
              path="/page/:slug"
              element={
                currentSlug ? (
                  <CollaborativeEditor
                    pageSlug={currentSlug}
                    username={user.username}
                    onNavigate={navigateByTitle}
                    onPageRenamed={(newSlug) => {
                      setSidebarKey((k) => k + 1);
                      handleNavigateToSlug(newSlug);
                    }}
                    onPageDeleted={() => {
                      setSidebarKey((k) => k + 1);
                      setCurrentSlug(null);
                      navigate("/");
                    }}
                  />
                ) : (
                  <div className="app-layout__placeholder">
                    <h2>Loading…</h2>
                  </div>
                )
              }
            />
            <Route
              path="/"
              element={
                <div className="app-layout__placeholder">
                  <h2>Welcome, {user.username}</h2>
                  <p>Select a page from the sidebar or create a new one to get started.</p>
                </div>
              }
            />
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
