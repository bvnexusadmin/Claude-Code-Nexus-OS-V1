import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      navigate("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Network error — please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: "360px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#f0f4f8",
              letterSpacing: "-0.01em",
            }}
          >
            Nexus OS
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "#8899aa",
              marginTop: "4px",
            }}
          >
            Brautigam Ventures
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: "#111827",
            border: "1px solid #1e2d40",
            borderRadius: "12px",
            padding: "32px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <h2
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "#f0f4f8",
              marginBottom: "20px",
            }}
          >
            Sign in to your account
          </h2>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#8899aa",
                  marginBottom: "5px",
                }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "13.5px",
                  color: "#f0f4f8",
                  background: "#1a2235",
                  border: "1px solid #1e2d40",
                  borderRadius: "7px",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
                onFocus={(e) => (e.target.style.borderColor = "#0ea5e9")}
                onBlur={(e) => (e.target.style.borderColor = "#1e2d40")}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#8899aa",
                  marginBottom: "5px",
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: "13.5px",
                  color: "#f0f4f8",
                  background: "#1a2235",
                  border: "1px solid #1e2d40",
                  borderRadius: "7px",
                  outline: "none",
                  boxSizing: "border-box" as const,
                }}
                onFocus={(e) => (e.target.style.borderColor = "#0ea5e9")}
                onBlur={(e) => (e.target.style.borderColor = "#1e2d40")}
              />
            </div>

            {error && (
              <div
                style={{
                  fontSize: "12.5px",
                  color: "#ef4444",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "7px",
                  padding: "10px 14px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "6px",
                width: "100%",
                padding: "10px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#0a0e1a",
                background: loading ? "rgba(14,165,233,0.5)" : "#0ea5e9",
                border: "none",
                borderRadius: "7px",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
