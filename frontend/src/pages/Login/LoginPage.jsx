import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../api/client";
import "./LoginPage.css";

function LoginPage({ onSwitch, onSuccess }) {
  const { login } = useAuth();
  const [form, setForm]     = useState({ username: "", password: "" });
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Login failed");

      const meRes = await apiFetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      const userData = await meRes.json();

      login(userData, data.access_token);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-page__card">
        <h2 className="login-page__title">Sign in to SyncScribe</h2>

        {error && <div className="login-page__error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className="login-page__label">Username</label>
          <input
            className="login-page__input"
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            autoFocus
          />

          <label className="login-page__label">Password</label>
          <input
            className="login-page__input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          <button className="login-page__submit" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="login-page__switch">
          No account?{" "}
          <span className="login-page__link" onClick={onSwitch}>
            Register here
          </span>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
