import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { MeResponse, TenantProvider } from "../lib/tenant";

const API_BASE = "";
const TENANT_STORAGE_KEY = "nexus_active_client_id";
const SIDEBAR_COLLAPSED_KEY = "nexus_sidebar_collapsed";

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

// ── Icons (lucide-style, 24×24 viewBox) ──────────────────────────────────────

const Icon: React.FC<{ d: string | string[]; size?: number }> = ({ d, size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, minWidth: size }}
  >
    {Array.isArray(d)
      ? d.map((path, i) => <path key={i} d={path} />)
      : <path d={d} />}
  </svg>
);

const Icons = {
  dashboard:  "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  leads:      [
    "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M23 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  clients:    [
    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    "M9 22V12h6v10",
  ],
  communication: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  calendar:   [
    "M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M16 2v4M8 2v4M2 10h20",
  ],
  analytics:  "M3 3v18h18M7 16v-5M12 16V8M17 16v-3",
  settings:   [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  ],
  sparkles:   [
    "M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z",
    "M5.5 16l.75 2.25 2.25.75-2.25.75L5.5 22l-.75-2.25L2.5 19l2.25-.75z",
    "M18.5 3l.75 2.25 2.25.75-2.25.75L18.5 9l-.75-2.25L15.5 6l2.25-.75z",
  ],
  chevronLeft:  "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
};

// ── Nav items (exact order per spec) ─────────────────────────────────────────

const NAV_ITEMS = [
  { to: "/dashboard",     label: "Dashboard",     icon: Icons.dashboard,     end: true  },
  { to: "/leads",         label: "Leads",          icon: Icons.leads,         end: false },
  { to: "/clients",       label: "Clients",        icon: Icons.clients,       end: false },
  { to: "/communication", label: "Communication",  icon: Icons.communication, end: false },
  { to: "/calendar",      label: "Calendar",       icon: Icons.calendar,      end: false },
  { to: "/analytics",     label: "Analytics",      icon: Icons.analytics,     end: false },
  { to: "/settings",      label: "Settings",       icon: Icons.settings,      end: false },
];

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":     "Dashboard",
  "/leads":         "Leads",
  "/clients":       "Clients",
  "/communication": "Communication",
  "/calendar":      "Calendar",
  "/analytics":     "Analytics",
  "/settings":      "Settings",
  "/inbox":         "Inbox",
  "/bookings":      "Bookings",
};

function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const prefix = Object.keys(PAGE_TITLES).find(
    (k) => k !== "/" && pathname.startsWith(k + "/")
  );
  return prefix ? PAGE_TITLES[prefix] : "Nexus OS";
}

// ── Component ────────────────────────────────────────────────────────────────

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ── Sidebar collapse state (persisted) ──────────────────────────────────
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {}
  };

  const sidebarWidth = collapsed ? "60px" : "220px";

  // ── Tenant / auth state ──────────────────────────────────────────────────
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

  // ── Render ───────────────────────────────────────────────────────────────

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

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside
          className={collapsed ? "sidebar-collapsed" : undefined}
          style={{
            width: sidebarWidth,
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
            transition: "width 0.2s ease",
          }}
        >

          {/* ── Logo area ───────────────────────────────────────────────── */}
          <div
            style={{
              padding: "16px",
              display: "flex",
              alignItems: "center",
              gap: collapsed ? 0 : "10px",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div className="bv-avatar">BV</div>
            {!collapsed && (
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text-primary)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
                  Nexus OS
                </div>
                <div style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginTop: "1px", whiteSpace: "nowrap" }}>
                  Brautigam Ventures
                </div>
              </div>
            )}
          </div>

          <div style={{ height: "1px", background: "#1e2d40", flexShrink: 0 }} />

          {/* ── Navigation ──────────────────────────────────────────────── */}
          <nav
            style={{
              flex: 1,
              padding: "8px 0",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              overflowX: "hidden",
            }}
          >
            {NAV_ITEMS.map((item) => (
              <div key={item.label} className="nav-wrapper">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
                >
                  <Icon d={item.icon} size={17} />
                  {!collapsed && <span className="nav-label">{item.label}</span>}
                </NavLink>
                {collapsed && <span className="nav-tooltip">{item.label}</span>}
              </div>
            ))}

            {/* Flex spacer */}
            <div style={{ flex: 1 }} />

            {/* Ask Nexus */}
            <div className="nav-wrapper" style={{ marginTop: "8px" }}>
              <div className="nav-item-ask">
                <Icon d={Icons.sparkles} size={17} />
                {!collapsed && <span className="nav-label">Ask Nexus</span>}
              </div>
              {collapsed && <span className="nav-tooltip">Ask Nexus</span>}
            </div>

            {/* Collapse toggle */}
            <button
              className="sidebar-toggle"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{ marginTop: "8px" }}
            >
              <Icon d={collapsed ? Icons.chevronRight : Icons.chevronLeft} size={15} />
            </button>
          </nav>

          <div style={{ height: "1px", background: "#1e2d40", flexShrink: 0 }} />

          {/* ── User info (bottom) ──────────────────────────────────────── */}
          <div
            style={{
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: collapsed ? 0 : "10px",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div className="user-avatar" title={userEmail}>{userInitial}</div>

            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                {loadingMe ? (
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Loading…</div>
                ) : meError ? (
                  <div style={{ fontSize: "11px", color: "var(--color-danger)", whiteSpace: "pre-wrap" }}>
                    {meError}
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {clientName}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "1px" }}>
                      {activeRole ?? "—"}
                    </div>
                  </>
                )}

                {/* Tenant switcher */}
                {!loadingMe && !meError && memberships.length > 1 && (
                  <select
                    value={me?.active?.client_id ?? ""}
                    onChange={(e) => switchTenant(e.target.value)}
                    style={{
                      marginTop: "8px",
                      width: "100%",
                      padding: "5px 8px",
                      fontSize: "11px",
                      border: "1px solid var(--color-bg-border)",
                      borderRadius: "6px",
                      background: "var(--color-bg-surface)",
                      color: "var(--color-text-secondary)",
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

                <button className="sign-out-btn" onClick={handleLogout}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main area ─────────────────────────────────────────────────── */}
        <div
          style={{
            marginLeft: sidebarWidth,
            flex: 1,
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            overflow: "hidden",
            background: "#0a0e1a",
            transition: "margin-left 0.2s ease",
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
            <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {pageTitle}
            </h1>

            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {/* System status */}
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  background: "var(--color-success-bg)",
                  color: "var(--color-success)",
                  fontSize: "11px",
                  fontWeight: 600,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border: "1px solid var(--color-success-border)",
                }}
              >
                <span
                  style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: "var(--color-success)",
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
                  background: "var(--color-accent)",
                  color: "var(--color-bg-base)",
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
          <main style={{ flex: 1, overflow: "auto", background: "#0a0e1a" }}>
            <Outlet />
          </main>
        </div>
      </div>
    </TenantProvider>
  );
};

export default AppLayout;
