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

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Successful login → move user into the app
    navigate("/dashboard");
  };

  return (
    <div style={{ maxWidth: "360px" }}>
      <h2>Login</h2>

      <form onSubmit={handleLogin}>
        <div>
          <label>Email</label>
          <br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div style={{ marginTop: "12px" }}>
          <label>Password</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button
          style={{ marginTop: "16px" }}
          type="submit"
          disabled={loading}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>

        {error && (
          <p style={{ color: "red", marginTop: "12px" }}>{error}</p>
        )}
      </form>
    </div>
  );
};

export default Login;
