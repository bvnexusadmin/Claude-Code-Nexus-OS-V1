import React from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../lib/useSession";

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-page)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "13px",
          color: "var(--text-muted)",
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default RequireAuth;
