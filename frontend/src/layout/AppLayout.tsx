import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MeResponse, TenantProvider } from "../lib/tenant";

const API_BASE = "";
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

// ── Icons ───────────────────────────────────────────────────────────────────

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d={d} />
  </svg>
);

const Icons = {
  dashboard: "M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z",
  inbox:
    "M2 4h12v8H2V4zm0 0l6 4 6-4",
  leads:
    "M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm4-2a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 14c0-2.5 1.8-4 4-4h4c2.2 0 4 1.5 4 4",
  bookings:
    "M3 3h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM6 1v4M10 1v4M2 7h12",
  conversations:
    "M2 2h12v8H8.5L5 13v-3H2V2z",
  analytics:
    "M2 12h3V8H2zM6.5 12h3V5h-3zM11 12h3V2h-3z",
  settings:
    "M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm4.7-2a4.7 4.7 0 0 0 0-1l1.3-1-1-1.7-1.5.5a5 5 0 0 0-.9-.5L10.3 3h-2l-.3 1.3a5 5 0 0 0-.9.5L5.6 4.3 4.7 6l1.3 1a4.7 4.7 0 0 0 0 1L4.7 9l1 1.7 1.5-.5c.3.2.6.4.9.5L8.3 12h2l.3-1.3c.3-.1.6-.3.9-.5l1.5.5 1-1.7-1.3-1z",
};

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: Icons.dashboard, end: true },
  { to: "/inbox", label: "Inbox", icon: Icons.inbox, end: true },
  { to: "/leads", label: "Leads", icon: Icons.leads, end: true },
  { to: "/bookings", label: "Bookings", icon: Icons.bookings, end: true },
  { to: "/conversations", label: "Conversations", icon: Icons.conversations, end: true },
  { to: "/analytics", label: "Analytics", icon: Icons.analytics, end: true },
  { to: "/settings", label: "Settings", icon: Icons.settings, end: true },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/inbox": "Inbox",
  "/leads": "Leads",
  "/bookings": "Bookings",
  "/conversations": "Conversations",
  "/analytics": "Analytics",
  "/settings": "Settings",
  "/admin": "Admin",
};

function getPageTitle(pathname: string): string {
  // exact match
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // prefix match for nested routes
  const prefix = Object.keys(PAGE_TITLES).find(
    (k) => k !== "/" && pathname.startsWith(k + "/")
  );
  return prefix ? PAGE_TITLES[prefix] : "Nexus OS";
}

// ── Component ────────────────────────────────────────────────────────────────

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadingMe, setLoadingMe] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);
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

      if (!session?.access_token) throw new Error("Not authenticated");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${session.access_token}`,
      };
      if (clientIdOverride) headers["x-nexus-client-id"] = clientIdOverride;

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
      if (!json.ok) throw new Error(json.error || "Failed to load /internal/me");

      const typed = json as MeResponse;
      setMe(typed);

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

  const pageTitle = getPageTitle(location.pathname);
  const userEmail = me?.user?.email ?? "";
  const userInitial = userEmail ? userEmail.charAt(0).toUpperCase() : "U";
  const clientName = me?.active?.client?.name ?? (loadingMe ? "…" : "—");

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
      <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0a0e1a" }}>

        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside
          style={{
            width: "220px",
            flexShrink: 0,
            background: "#0a0e1a",
            borderRight: "1px solid #1e2d40",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {/* Logo */}
          <div style={{ padding: "20px 16px 16px" }}>
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#f0f4f8",
                letterSpacing: "-0.01em",
              }}
            >
              Nexus OS
            </div>
            <div
              style={{
                fontSize: "12px",
                color: "#8899aa",
                marginTop: "3px",
              }}
            >
              Brautigam Ventures
            </div>
          </div>

          <div
            style={{
              height: "1px",
              background: "#1e2d40",
              margin: "0",
            }}
          />

          {/* Navigation */}
          <nav
            style={{
              flex: 1,
              padding: "8px 0",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 16px",
                  margin: "2px 8px",
                  borderRadius: "7px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: isActive ? "#0ea5e9" : "#8899aa",
                  background: isActive ? "rgba(14, 165, 233, 0.12)" : "transparent",
                  borderLeft: isActive ? "2px solid #0ea5e9" : "2px solid transparent",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textDecoration: "none",
                })}
              >
                <Icon d={item.icon} size={15} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div
            style={{
              height: "1px",
              background: "#1e2d40",
            }}
          />

          {/* Client / User info */}
          <div style={{ padding: "16px" }}>
            {loadingMe ? (
              <div style={{ fontSize: "12px", color: "#4a5a6b" }}>
                Loading…
              </div>
            ) : meError ? (
              <div
                style={{
                  fontSize: "11px",
                  color: "#ef4444",
                  whiteSpace: "pre-wrap",
                }}
              >
                {meError}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <div
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#f0f4f8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {clientName}
                </div>
                <div style={{ fontSize: "12px", color: "#8899aa" }}>
                  {activeRole ?? "—"}
                </div>
              </div>
            )}

            {/* Tenant switcher */}
            {!loadingMe && !meError && memberships.length > 1 && (
              <select
                value={me?.active?.client_id ?? ""}
                onChange={(e) => switchTenant(e.target.value)}
                style={{
                  marginTop: "8px",
                  width: "100%",
                  padding: "6px 8px",
                  fontSize: "12px",
                  border: "1px solid #1e2d40",
                  borderRadius: "6px",
                  background: "#111827",
                  color: "#8899aa",
                  cursor: "pointer",
                }}
              >
                {memberships.map((m) => (
                  <option key={m.client_id} value={m.client_id}>
                    {m.client?.name ?? m.client_id} ({m.role})
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={handleLogout}
              style={{
                marginTop: "10px",
                width: "100%",
                padding: "8px 12px",
                fontSize: "12px",
                fontWeight: 500,
                color: "#8899aa",
                background: "transparent",
                border: "1px solid #1e2d40",
                borderRadius: "6px",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* ── Main area ───────────────────────────────────────────────── */}
        <div
          style={{
            marginLeft: "220px",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            overflow: "hidden",
            background: "#0a0e1a",
          }}
        >
          {/* Top bar */}
          <header
            style={{
              height: "56px",
              flexShrink: 0,
              background: "#111827",
              borderBottom: "1px solid #1e2d40",
              padding: "0 28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h1
              style={{
                fontSize: "16px",
                fontWeight: 600,
                color: "#f0f4f8",
              }}
            >
              {pageTitle}
            </h1>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* System status */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "#10b981",
                    display: "inline-block",
                  }}
                />
                Online
              </span>

              {/* Avatar */}
              <div
                title={userEmail}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  background: "#0ea5e9",
                  color: "#0a0e1a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "13px",
                  fontWeight: 700,
                  flexShrink: 0,
                  cursor: "default",
                }}
              >
                {userInitial}
              </div>
            </div>
          </header>

          {/* Page content */}
          <main
            style={{
              flex: 1,
              overflow: "auto",
              background: "#0a0e1a",
            }}
          >
            <Outlet />
          </main>
        </div>
      </div>
    </TenantProvider>
  );
};

export default AppLayout;
