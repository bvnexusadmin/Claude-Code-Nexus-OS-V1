import React from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../lib/useSession";

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => {
  const { session, loading } = useSession();

  if (loading) {
    return <div>Loading session…</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default RequireAuth;
