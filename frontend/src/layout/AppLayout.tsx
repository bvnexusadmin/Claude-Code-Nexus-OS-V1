import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MeResponse, TenantProvider } from "../lib/tenant";

const API_BASE = "http://localhost:4000";
const TENANT_STORAGE_KEY = "nexus_active_client_id";

async function safeReadJson(
  res: Response
): Promise<{ json: any | null; text: string }> {
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    return { json, text };
  } catch {
    return { json: null, text };
  }
}

const AppLayout: React.FC = () => {
  const navigate = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);

  // Persist tenant across reloads
  const [activeClientOverride, setActiveClientOverride] = useState<string | null>(
    () => {
      try {
        return localStorage.getItem(TENANT_STORAGE_KEY);
      } catch {
        return null;
      }
    }
  );

  const memberships = useMemo(() => me?.memberships ?? [], [me]);

  const activeClientId = me?.active?.client_id ?? null;
  const activeRole = me?.active?.role ?? null;

  const fetchMe = async (clientIdOverride: string | null) => {
    setLoadingMe(true);
    setMeError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${session.access_token}`,
      };

      if (clientIdOverride) {
        headers["x-nexus-client-id"] = clientIdOverride;
      }

      const res = await fetch(`${API_BASE}/internal/me`, { headers });
      const { json, text } = await safeReadJson(res);

      if (!res.ok) {
        const bodyPreview = (text ?? "").slice(0, 300);
        throw new Error(`HTTP ${res.status} ${res.statusText} — ${bodyPreview}`);
      }

      if (!json) {
        const bodyPreview = (text ?? "").slice(0, 300);
        throw new Error(`Non-JSON response from /internal/me — ${bodyPreview}`);
      }

      if (!json.ok) {
        throw new Error(json.error || "Failed to load /internal/me");
      }

      const typed = json as MeResponse;
      setMe(typed);

      // Clear invalid persisted tenant
      if (
        clientIdOverride &&
        !typed.memberships.some((m) => m.client_id === clientIdOverride)
      ) {
        setActiveClientOverride(null);
        try {
          localStorage.removeItem(TENANT_STORAGE_KEY);
        } catch {}
      }
    } catch (err: any) {
      setMe(null);
      setMeError(err?.message ?? String(err));
    } finally {
      setLoadingMe(false);
    }
  };

  useEffect(() => {
    fetchMe(activeClientOverride);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientOverride]);

  const refreshMe = () => fetchMe(activeClientOverride);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const switchTenant = (newClientId: string) => {
    setActiveClientOverride(newClientId);
    try {
      localStorage.setItem(TENANT_STORAGE_KEY, newClientId);
    } catch {}
  };

  const showAdminNav = activeRole === "bv_admin";

  return (
    <TenantProvider
      value={{
        me,
        loadingMe,
        meError,
        activeClientId,
        activeRole,
        memberships,
        switchTenant,
        refreshMe,
      }}
    >
      <div style={{ display: "flex", height: "100vh" }}>
        <aside
          style={{
            width: "260px",
            borderRight: "1px solid #e5e7eb",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <h3 style={{ margin: 0 }}>Nexus OS</h3>

            {loadingMe ? (
              <div style={{ fontSize: "12px", opacity: 0.8 }}>Loading…</div>
            ) : meError ? (
              <div
                style={{
                  fontSize: "12px",
                  color: "crimson",
                  whiteSpace: "pre-wrap",
                }}
              >
                Identity error: {meError}
              </div>
            ) : (
              <div style={{ fontSize: "12px", opacity: 0.9 }}>
                <div>
                  <strong>Client:</strong> {me?.active?.client?.name}
                </div>
                <div>
                  <strong>Role:</strong> {me?.active?.role}
                </div>
              </div>
            )}

            {!loadingMe && !meError && memberships.length > 1 && (
              <div style={{ marginTop: "8px" }}>
                <label
                  style={{
                    fontSize: "12px",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Switch tenant
                </label>
                <select
                  value={me?.active?.client_id ?? ""}
                  onChange={(e) => switchTenant(e.target.value)}
                  style={{ width: "100%", padding: "6px" }}
                >
                  {memberships.map((m) => (
                    <option key={m.client_id} value={m.client_id}>
                      {m.client?.name ?? m.client_id} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <nav
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              flex: 1,
            }}
          >
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/inbox">Inbox</NavLink>
            <NavLink to="/bookings">Bookings</NavLink>
            <NavLink to="/leads">Leads</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            {showAdminNav && <NavLink to="/admin">Admin</NavLink>}
          </nav>

          <button
            onClick={handleLogout}
            style={{
              marginTop: "16px",
              padding: "8px",
              cursor: "pointer",
            }}
          >
            Log Out
          </button>
        </aside>

        <main style={{ flex: 1, padding: "24px" }}>
          <Outlet />
        </main>
      </div>
    </TenantProvider>
  );
};

export default AppLayout;
