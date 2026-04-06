import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../api/client";
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
      if (!res.ok) throw new Error(data.detail || "Registration failed");

      const loginRes = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: form.username, password: form.password }),
      });

      const loginData = await loginRes.json();
      login(data, loginData.access_token);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-page">
      <div className="register-page__card">
        <h2 className="register-page__title">Create your account</h2>

        {error && <div className="register-page__error">{error}</div>}

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
