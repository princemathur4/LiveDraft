import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../api/client";
import { parseApiError, formatErrorMessage } from "../../api/errors";
import "./RegisterPage.css";

function RegisterPage({ onSwitch, onSuccess }) {
  const { login } = useAuth();
  const [form, setForm]       = useState({ username: "", email: "", password: "" });
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        // Handle validation errors (422) and other errors
        if (Array.isArray(data.detail)) {
          // Pydantic validation error format
          const errorsByField = parseApiError(data);
          const formattedError = formatErrorMessage(errorsByField);
          throw new Error(formattedError);
        } else if (typeof data.detail === "string") {
          // Simple error message
          throw new Error(data.detail);
        } else {
          throw new Error("Registration failed");
        }
      }

      const signupRes = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: form.username, password: form.password }),
      });

      const signupData = await signupRes.json();
      login(data, signupData.access_token);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <h1 className="register-page__title">SyncScribe</h1>
      <div className="register-page__card">
        <h2 className="register-page__cardtitle">Create your account</h2>

        {error && (
          <div className="register-page__error">
            {error.split('\n').map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="register-page__label">Username</label>
          <input
            className="register-page__input"
            type="text"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
            autoFocus
          />

          <label className="register-page__label">Email</label>
          <input
            className="register-page__input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />

          <label className="register-page__label">Password</label>
          <input
            className="register-page__input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
          />

          <button className="register-page__submit" type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="register-page__switch">
          Already have an account?{" "}
          <span className="register-page__link" onClick={onSwitch}>
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
}

export default RegisterPage;
