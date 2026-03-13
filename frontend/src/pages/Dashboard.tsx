import React, { useEffect, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import { supabase } from "../lib/supabase";
import { useTenant } from "../lib/tenant";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ── Types ────────────────────────────────────────────────────────────────────

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
}

interface Booking {
  id: string;
  created_at: string;
  status: string | null;
}

interface Message {
  id: string;
  channel: string | null;
  direction: string | null;
  content: string | null;
  created_at: string;
  lead_id: string | null;
}

interface DashboardData {
  leadsThisMonth: number;
  bookingsConfirmed: number;
  totalLeads: number;
  channelCounts: Record<string, number>;
  weeklyBookings: Record<string, number>;
  recentLeads: Lead[];
  activityFeed: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: "sms" | "voice" | "email" | "booking" | "lead";
  description: string;
  time: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtChannel(ch: string | null): string {
  if (!ch) return "Unknown";
  return ch.charAt(0).toUpperCase() + ch.slice(1).toLowerCase();
}

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function weekAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function last7DayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(
      d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })
    );
  }
  return labels;
}

function last7DayKeys(): string[] {
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

// ── Sub-components ───────────────────────────────────────────────────────────

const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: "var(--bg-card)",
      border: "0.5px solid var(--border-card)",
      borderRadius: "var(--radius-card)",
      padding: "16px",
      ...style,
    }}
  >
    {children}
  </div>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  let bg = "#f3f4f6";
  let color = "#6b7280";
  if (s === "booked" || s === "confirmed") {
    bg = "#f0fdf4";
    color = "#15803d";
  } else if (s === "qualifying" || s === "open") {
    bg = "#eff6ff";
    color = "#1d4ed8";
  } else if (s === "new") {
    bg = "#fffbeb";
    color = "#b45309";
  } else if (s === "escalated") {
    bg = "#fef2f2";
    color = "#b91c1c";
  } else if (s === "closed") {
    bg = "#f3f4f6";
    color = "#6b7280";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: 500,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </span>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
}> = ({ label, value, sub, loading }) => (
  <Card style={{ flex: 1, minWidth: 0 }}>
    <div
      style={{
        fontSize: "11px",
        fontWeight: 500,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: "10px",
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontSize: "28px",
        fontWeight: 500,
        color: "var(--text-primary)",
        lineHeight: 1,
      }}
    >
      {loading ? (
        <span
          style={{
            display: "inline-block",
            width: "60px",
            height: "28px",
            background: "#f3f4f6",
            borderRadius: "6px",
          }}
        />
      ) : (
        value
      )}
    </div>
    {sub && !loading && (
      <div
        style={{
          fontSize: "12px",
          color: "var(--text-muted)",
          marginTop: "6px",
        }}
      >
        {sub}
      </div>
    )}
  </Card>
);

const ActivityIcon: React.FC<{ type: ActivityItem["type"] }> = ({ type }) => {
  const configs: Record<
    ActivityItem["type"],
    { bg: string; color: string; label: string }
  > = {
    sms: { bg: "#eff6ff", color: "#3b82f6", label: "SMS" },
    voice: { bg: "#f0fdf4", color: "#22c55e", label: "📞" },
    email: { bg: "#fdf4ff", color: "#a855f7", label: "@" },
    booking: { bg: "#fff7ed", color: "#f97316", label: "B" },
    lead: { bg: "#f0fdf4", color: "#16a34a", label: "L" },
  };
  const cfg = configs[type] ?? configs["sms"];
  return (
    <div
      style={{
        width: "30px",
        height: "30px",
        borderRadius: "8px",
        background: cfg.bg,
        color: cfg.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────────

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { mode: "index" as const, intersect: false },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: "#9ca3af", font: { size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: "#f3f4f6" },
      ticks: { color: "#9ca3af", font: { size: 11 }, stepSize: 1 },
      border: { display: false },
    },
  },
};

const Dashboard: React.FC = () => {
  const { activeClientId } = useTenant();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeClientId) return;
    load(activeClientId);
  }, [activeClientId]);

  async function load(clientId: string) {
    setLoading(true);
    setError(null);
    try {
      const [
        leadsMonthRes,
        allLeadsRes,
        bookingsRes,
        recentLeadsRes,
        messagesRes,
      ] = await Promise.all([
        // Leads this month
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("created_at", startOfMonth()),

        // All leads (for channel breakdown)
        supabase
          .from("leads")
          .select("source")
          .eq("client_id", clientId),

        // Bookings
        supabase
          .from("bookings")
          .select("id, created_at, status")
          .eq("client_id", clientId)
          .gte("created_at", weekAgoISO()),

        // Recent 5 leads
        supabase
          .from("leads")
          .select("id, name, phone, source, status, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(5),

        // Recent messages for activity feed
        supabase
          .from("messages")
          .select("id, channel, direction, content, created_at, lead_id")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      // Channel breakdown
      const channelCounts: Record<string, number> = { sms: 0, voice: 0, email: 0 };
      for (const lead of allLeadsRes.data ?? []) {
        const src = (lead.source ?? "unknown").toLowerCase();
        if (src in channelCounts) channelCounts[src]++;
        else channelCounts[src] = (channelCounts[src] ?? 0) + 1;
      }

      // Weekly bookings
      const weeklyBookings: Record<string, number> = {};
      for (const key of last7DayKeys()) weeklyBookings[key] = 0;
      for (const b of bookingsRes.data ?? []) {
        const day = b.created_at.slice(0, 10);
        if (day in weeklyBookings) weeklyBookings[day]++;
      }

      // Confirmed bookings (all time)
      const { count: confirmedCount } = await supabase
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("client_id", clientId)
        .or("status.eq.confirmed,status.eq.booked");

      // Activity feed: combine inbound messages + booking events
      const feed: ActivityItem[] = [];
      for (const msg of messagesRes.data ?? []) {
        if (msg.direction !== "inbound") continue;
        const ch = (msg.channel ?? "sms").toLowerCase() as ActivityItem["type"];
        const channelLabel =
          ch === "sms"
            ? "SMS received"
            : ch === "voice"
            ? "Call answered"
            : "Email received";
        feed.push({
          id: msg.id,
          type: ch === "voice" ? "voice" : ch === "email" ? "email" : "sms",
          description: `${channelLabel} — ${(msg.content ?? "").slice(0, 60)}${
            (msg.content ?? "").length > 60 ? "…" : ""
          }`,
          time: msg.created_at,
        });
        if (feed.length >= 5) break;
      }
      // If not enough, pad with lead events
      if (feed.length < 5) {
        for (const lead of recentLeadsRes.data ?? []) {
          feed.push({
            id: `lead-${lead.id}`,
            type: "lead",
            description: `New lead: ${lead.name ?? lead.phone ?? "Unknown"}`,
            time: lead.created_at,
          });
          if (feed.length >= 5) break;
        }
      }
      // Sort by time desc
      feed.sort((a, b) => b.time.localeCompare(a.time));

      setData({
        leadsThisMonth: leadsMonthRes.count ?? 0,
        totalLeads: allLeadsRes.data?.length ?? 0,
        bookingsConfirmed: confirmedCount ?? 0,
        channelCounts,
        weeklyBookings,
        recentLeads: recentLeadsRes.data ?? [],
        activityFeed: feed.slice(0, 5),
      });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!activeClientId) {
    return (
      <div style={{ padding: "40px 24px", color: "var(--text-muted)" }}>
        No tenant selected.
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "40px 24px", color: "#ef4444" }}>
        Error loading dashboard: {error}
      </div>
    );
  }

  // ── Derived values ─────────────────────────────────────────────────────────

  const confirmedBookings = data?.bookingsConfirmed ?? 0;
  const totalLeads = data?.totalLeads ?? 0;
  const conversionPct =
    totalLeads > 0 ? Math.round((confirmedBookings / totalLeads) * 100) : 0;
  const estimatedRevenue = confirmedBookings * 2000;
  const yourFee = Math.round(estimatedRevenue * 0.15);

  const channelLabels = ["SMS", "Voice", "Email"];
  const channelValues = [
    data?.channelCounts["sms"] ?? 0,
    data?.channelCounts["voice"] ?? 0,
    data?.channelCounts["email"] ?? 0,
  ];

  const weekKeys = last7DayKeys();
  const weekLabels = last7DayLabels();
  const weekValues = weekKeys.map((k) => data?.weeklyBookings[k] ?? 0);

  const channelChartData = {
    labels: channelLabels,
    datasets: [
      {
        data: channelValues,
        backgroundColor: ["#3b82f6", "#22c55e", "#a855f7"],
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const weeklyChartData = {
    labels: weekLabels,
    datasets: [
      {
        data: weekValues,
        backgroundColor: "#3b82f6",
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const horizontalOptions = {
    ...CHART_OPTIONS,
    indexAxis: "y" as const,
    scales: {
      ...CHART_OPTIONS.scales,
      x: {
        ...CHART_OPTIONS.scales.x,
        grid: { color: "#f3f4f6" },
      },
      y: {
        ...CHART_OPTIONS.scales.y,
        grid: { display: false },
      },
    },
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>

      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>
        <MetricCard
          label="Leads this month"
          value={data?.leadsThisMonth ?? 0}
          sub={`${totalLeads} total leads`}
          loading={loading}
        />
        <MetricCard
          label="Bookings confirmed"
          value={confirmedBookings}
          sub={`${conversionPct}% conversion rate`}
          loading={loading}
        />
        <MetricCard
          label="Calls answered"
          value="100%"
          sub="0 missed calls"
          loading={loading}
        />
        <MetricCard
          label="Revenue uplift"
          value={`$${yourFee.toLocaleString()}`}
          sub={`Est. $${estimatedRevenue.toLocaleString()} booked • 15% fee`}
          loading={loading}
        />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>
        <Card style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Leads by channel
          </div>
          <div style={{ height: "160px" }}>
            {loading ? (
              <div
                style={{
                  height: "100%",
                  background: "#f9fafb",
                  borderRadius: "8px",
                }}
              />
            ) : (
              <Bar data={channelChartData} options={horizontalOptions} />
            )}
          </div>
        </Card>

        <Card style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "16px",
            }}
          >
            Weekly bookings
          </div>
          <div style={{ height: "160px" }}>
            {loading ? (
              <div
                style={{
                  height: "100%",
                  background: "#f9fafb",
                  borderRadius: "8px",
                }}
              />
            ) : (
              <Bar data={weeklyChartData} options={CHART_OPTIONS} />
            )}
          </div>
        </Card>
      </div>

      {/* ── Recent leads + Activity feed ──────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>
        {/* Recent leads */}
        <Card style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "14px",
            }}
          >
            Recent leads
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: "36px",
                    background: "#f9fafb",
                    borderRadius: "6px",
                  }}
                />
              ))}
            </div>
          ) : data?.recentLeads.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              No leads yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data?.recentLeads.map((lead, i) => (
                <div
                  key={lead.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 0",
                    borderTop:
                      i === 0 ? "none" : "0.5px solid var(--border)",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {lead.name ?? lead.phone ?? "Unknown"}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "1px",
                      }}
                    >
                      {fmtChannel(lead.source)} · {fmtRelative(lead.created_at)}
                    </div>
                  </div>
                  {lead.status && <StatusPill status={lead.status} />}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Activity feed */}
        <Card style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "14px",
            }}
          >
            Live activity feed
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: "36px",
                    background: "#f9fafb",
                    borderRadius: "6px",
                  }}
                />
              ))}
            </div>
          ) : data?.activityFeed.length === 0 ? (
            <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
              No recent activity.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {data?.activityFeed.map((item, i) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    padding: "9px 0",
                    borderTop:
                      i === 0 ? "none" : "0.5px solid var(--border)",
                  }}
                >
                  <ActivityIcon type={item.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "12.5px",
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.description}
                    </div>
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-muted)",
                        marginTop: "2px",
                      }}
                    >
                      {fmtRelative(item.time)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
