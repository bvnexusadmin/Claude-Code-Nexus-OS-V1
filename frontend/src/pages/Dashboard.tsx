import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type DateRange = "today" | "week" | "month";

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

interface FunnelData {
  new: number;
  contacted: number;
  qualified: number;
  converted: number;
}

interface DashboardData {
  leadsThisPeriod: number;
  bookingsConfirmed: number;
  totalLeads: number;
  channelCounts: Record<string, number>;
  weeklyBookings: Record<string, number>;
  recentLeads: Lead[];
  activityFeed: ActivityItem[];
  funnel: FunnelData;
}

interface ActivityItem {
  id: string;
  type: "sms" | "voice" | "email" | "booking" | "lead";
  description: string;
  time: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function getRangeStart(range: DateRange): string {
  const d = new Date();
  if (range === "today") {
    d.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
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

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: "#111827",
      border: "1px solid #1e2d40",
      borderRadius: "10px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4), 0 1px 3px rgba(0,0,0,0.3)",
      padding: "20px",
      ...style,
    }}
  >
    {children}
  </div>
);

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const s = status.toLowerCase();
  let bg = "rgba(74, 90, 107, 0.2)";
  let color = "#8899aa";
  if (s === "booked" || s === "confirmed" || s === "active") {
    bg = "rgba(16, 185, 129, 0.15)"; color = "#10b981";
  } else if (s === "qualifying" || s === "open" || s === "pending" || s === "follow-up") {
    bg = "rgba(245, 158, 11, 0.15)"; color = "#f59e0b";
  } else if (s === "new") {
    bg = "rgba(14, 165, 233, 0.15)"; color = "#0ea5e9";
  } else if (s === "escalated" || s === "lost" || s === "cancelled") {
    bg = "rgba(239, 68, 68, 0.15)"; color = "#ef4444";
  } else if (s === "closed") {
    bg = "rgba(74, 90, 107, 0.2)"; color = "#4a5a6b";
  } else if (s === "ai") {
    bg = "rgba(99, 102, 241, 0.15)"; color = "#6366f1";
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
    </span>
  );
};

const SourcePill: React.FC<{ source: string | null }> = ({ source }) => {
  const s = (source ?? "unknown").toLowerCase();
  let bg = "rgba(74, 90, 107, 0.2)";
  let color = "#8899aa";
  if (s === "sms") { bg = "rgba(14, 165, 233, 0.15)"; color = "#0ea5e9"; }
  else if (s === "voice" || s === "call") { bg = "rgba(16, 185, 129, 0.15)"; color = "#10b981"; }
  else if (s === "email") { bg = "rgba(99, 102, 241, 0.15)"; color = "#6366f1"; }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "20px",
        fontSize: "11px",
        fontWeight: 600,
        background: bg,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {fmtChannel(source)}
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
        fontWeight: 600,
        color: "#8899aa",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "12px",
      }}
    >
      {label}
    </div>
    <div style={{ fontSize: "36px", fontWeight: 700, color: "#f0f4f8", lineHeight: 1 }}>
      {loading ? (
        <span style={{ display: "inline-block", width: "60px", height: "36px", background: "#1a2235", borderRadius: "6px" }} />
      ) : (
        value
      )}
    </div>
    {sub && !loading && (
      <div style={{ fontSize: "13px", color: "#8899aa", marginTop: "6px" }}>{sub}</div>
    )}
  </Card>
);

const ActivityIcon: React.FC<{ type: ActivityItem["type"] }> = ({ type }) => {
  const configs: Record<ActivityItem["type"], { bg: string; color: string; label: string }> = {
    sms:     { bg: "rgba(14, 165, 233, 0.12)", color: "#0ea5e9", label: "SMS" },
    voice:   { bg: "rgba(16, 185, 129, 0.12)", color: "#10b981", label: "📞" },
    email:   { bg: "rgba(99, 102, 241, 0.12)", color: "#6366f1", label: "@" },
    booking: { bg: "rgba(245, 158, 11, 0.12)",  color: "#f59e0b", label: "B" },
    lead:    { bg: "rgba(16, 185, 129, 0.12)", color: "#10b981", label: "L" },
  };
  const cfg = configs[type] ?? configs["sms"];
  return (
    <div
      style={{
        width: "30px",
        height: "30px",
        minWidth: "30px",
        borderRadius: "8px",
        background: cfg.bg,
        color: cfg.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "11px",
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </div>
  );
};

// ── Lead Funnel ───────────────────────────────────────────────────────────────

const LeadFunnel: React.FC<{ funnel: FunnelData; loading: boolean }> = ({ funnel, loading }) => {
  const stages = [
    { label: "New Leads",  count: funnel.new,       color: "#0ea5e9", bg: "rgba(14,165,233,0.1)",  border: "rgba(14,165,233,0.25)" },
    { label: "Contacted",  count: funnel.contacted, color: "#6366f1", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.25)" },
    { label: "Qualified",  count: funnel.qualified, color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.25)" },
    { label: "Converted",  count: funnel.converted, color: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.25)" },
  ];

  return (
    <Card style={{ flex: "0 0 55%" }}>
      <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8", marginBottom: "20px" }}>
        Lead Funnel
      </div>

      {loading ? (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ flex: 1, height: "72px", background: "#1a2235", borderRadius: "8px" }} />
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {stages.map((stage, i) => (
            <React.Fragment key={stage.label}>
              <div
                style={{
                  flex: 1,
                  background: stage.bg,
                  border: `1px solid ${stage.border}`,
                  borderRadius: "8px",
                  padding: "12px 14px",
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "26px", fontWeight: 700, color: stage.color, lineHeight: 1 }}>
                  {stage.count}
                </div>
                <div style={{ fontSize: "11px", color: "#8899aa", marginTop: "5px", fontWeight: 500 }}>
                  {stage.label}
                </div>
              </div>

              {i < stages.length - 1 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: "10px", color: "#4a5a6b", marginBottom: "2px", fontWeight: 600 }}>
                    {pct(stages[i + 1].count, stage.count)}
                  </div>
                  <div style={{ color: "#1e2d40", fontSize: "18px", lineHeight: 1 }}>→</div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Stage bar — visual proportion */}
      {!loading && (
        <div style={{ marginTop: "14px", display: "flex", height: "4px", borderRadius: "2px", overflow: "hidden", gap: "2px" }}>
          {stages.map((stage) => {
            const total = funnel.new || 1;
            const w = Math.round((stage.count / total) * 100);
            return (
              <div
                key={stage.label}
                style={{ width: `${w}%`, background: stage.color, borderRadius: "2px", minWidth: stage.count > 0 ? "4px" : "0" }}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
};

// ── Nexus Insights ────────────────────────────────────────────────────────────

const NexusInsights: React.FC<{ data: DashboardData | null; loading: boolean }> = ({ data, loading }) => {
  const insights = useMemo(() => {
    if (!data) return [];
    const items: { id: string; color: string; bgColor: string; label: string; text: string; route: string }[] = [];

    if (data.funnel.new > 0) {
      items.push({ id: "new", color: "#0ea5e9", bgColor: "rgba(14,165,233,0.12)", label: "NEW", text: `${data.funnel.new} new leads awaiting first contact`, route: "/leads" });
    }
    if (data.funnel.qualified > 0) {
      items.push({ id: "qual", color: "#f59e0b", bgColor: "rgba(245,158,11,0.12)", label: "HOT", text: `${data.funnel.qualified} leads qualified and ready to book`, route: "/leads" });
    }
    const convPct = data.totalLeads > 0 ? Math.round((data.funnel.converted / data.totalLeads) * 100) : 0;
    items.push({ id: "conv", color: "#10b981", bgColor: "rgba(16,185,129,0.12)", label: "RATE", text: `${convPct}% overall conversion — ${data.funnel.converted} leads converted`, route: "/leads" });

    const topEntry = Object.entries(data.channelCounts).sort(([, a], [, b]) => b - a)[0];
    if (topEntry && topEntry[1] > 0) {
      items.push({ id: "chan", color: "#6366f1", bgColor: "rgba(99,102,241,0.12)", label: "TOP", text: `${topEntry[0].toUpperCase()} is your top source with ${topEntry[1]} leads`, route: "/analytics" });
    }
    if (data.bookingsConfirmed > 0) {
      items.push({ id: "book", color: "#10b981", bgColor: "rgba(16,185,129,0.12)", label: "CAL", text: `${data.bookingsConfirmed} bookings confirmed this period`, route: "/bookings" });
    }

    return items.slice(0, 5);
  }, [data]);

  return (
    <Card style={{ flex: "0 0 calc(45% - 16px)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <div style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px" }}>
          ✦
        </div>
        <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8" }}>Nexus Insights</div>
        <div style={{ fontSize: "11px", color: "#6366f1", fontWeight: 600, background: "rgba(99,102,241,0.12)", padding: "2px 7px", borderRadius: "20px", marginLeft: "auto" }}>AI</div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ height: "38px", background: "#1a2235", borderRadius: "6px" }} />
          ))}
        </div>
      ) : insights.length === 0 ? (
        <div style={{ fontSize: "13px", color: "#4a5a6b" }}>No insights available yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          {insights.map((item) => (
            <Link
              key={item.id}
              to={item.route}
              style={{ textDecoration: "none" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "9px 10px",
                  borderRadius: "7px",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#1a2235"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <div
                  style={{
                    width: "34px",
                    height: "22px",
                    borderRadius: "4px",
                    background: item.bgColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: item.color,
                    letterSpacing: "0.04em",
                    flexShrink: 0,
                  }}
                >
                  {item.label}
                </div>
                <div style={{ flex: 1, fontSize: "12.5px", color: "#f0f4f8" }}>{item.text}</div>
                <div style={{ fontSize: "14px", color: "#4a5a6b", flexShrink: 0 }}>›</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
};

// ── Chart options (unchanged) ─────────────────────────────────────────────────

const CHART_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: { mode: "index" as const, intersect: false },
  },
  scales: {
    x: {
      grid: { color: "#1a2235", display: true },
      ticks: { color: "#8899aa", font: { size: 11 } },
      border: { display: false },
    },
    y: {
      grid: { color: "#1a2235" },
      ticks: { color: "#8899aa", font: { size: 11 }, stepSize: 1 },
      border: { display: false },
    },
  },
};

// ── Main component ────────────────────────────────────────────────────────────

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  today: "Today",
  week:  "This Week",
  month: "This Month",
};

const Dashboard: React.FC = () => {
  const { activeClientId } = useTenant();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>("month");

  useEffect(() => {
    if (!activeClientId) return;
    load(activeClientId, dateRange);
  }, [activeClientId, dateRange]);

  async function load(clientId: string, range: DateRange) {
    setLoading(true);
    setError(null);
    try {
      const rangeStart = getRangeStart(range);

      const [
        leadsPeriodRes,
        allLeadsRes,
        bookingsRes,
        recentLeadsRes,
        messagesRes,
      ] = await Promise.all([
        // Leads this period
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("client_id", clientId)
          .gte("created_at", rangeStart),

        // All leads — source + status for funnel
        supabase
          .from("leads")
          .select("source, status")
          .eq("client_id", clientId),

        // Bookings for chart
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

      // Lead funnel from status
      const funnel: FunnelData = { new: 0, contacted: 0, qualified: 0, converted: 0 };
      for (const lead of allLeadsRes.data ?? []) {
        const s = (lead.status ?? "new").toLowerCase();
        if (s === "new") funnel.new++;
        else if (s === "qualifying" || s === "open") funnel.contacted++;
        else if (s === "qualified") funnel.qualified++;
        else if (s === "booked" || s === "confirmed" || s === "closed") funnel.converted++;
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

      // Activity feed
      const feed: ActivityItem[] = [];
      for (const msg of messagesRes.data ?? []) {
        if (msg.direction !== "inbound") continue;
        const ch = (msg.channel ?? "sms").toLowerCase() as ActivityItem["type"];
        const channelLabel = ch === "sms" ? "SMS received" : ch === "voice" ? "Call answered" : "Email received";
        feed.push({
          id: msg.id,
          type: ch === "voice" ? "voice" : ch === "email" ? "email" : "sms",
          description: `${channelLabel} — ${(msg.content ?? "").slice(0, 60)}${(msg.content ?? "").length > 60 ? "…" : ""}`,
          time: msg.created_at,
        });
        if (feed.length >= 8) break;
      }
      if (feed.length < 5) {
        for (const lead of recentLeadsRes.data ?? []) {
          feed.push({
            id: `lead-${lead.id}`,
            type: "lead",
            description: `New lead: ${lead.name ?? lead.phone ?? "Unknown"}`,
            time: lead.created_at,
          });
          if (feed.length >= 8) break;
        }
      }
      feed.sort((a, b) => b.time.localeCompare(a.time));

      setData({
        leadsThisPeriod: leadsPeriodRes.count ?? 0,
        totalLeads: allLeadsRes.data?.length ?? 0,
        bookingsConfirmed: confirmedCount ?? 0,
        channelCounts,
        weeklyBookings,
        recentLeads: recentLeadsRes.data ?? [],
        activityFeed: feed.slice(0, 8),
        funnel,
      });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!activeClientId) {
    return <div style={{ padding: "40px 24px", color: "#4a5a6b" }}>No tenant selected.</div>;
  }
  if (error) {
    return <div style={{ padding: "40px 24px", color: "#ef4444" }}>Error loading dashboard: {error}</div>;
  }

  // ── Derived values ──────────────────────────────────────────────────────────

  const confirmedBookings = data?.bookingsConfirmed ?? 0;
  const totalLeads = data?.totalLeads ?? 0;
  const conversionPct = totalLeads > 0 ? Math.round((confirmedBookings / totalLeads) * 100) : 0;
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
    datasets: [{ data: channelValues, backgroundColor: ["#0ea5e9", "#10b981", "#6366f1"], borderRadius: 6, borderSkipped: false }],
  };

  const weeklyChartData = {
    labels: weekLabels,
    datasets: [{ data: weekValues, backgroundColor: "#0ea5e9", borderRadius: 6, borderSkipped: false }],
  };

  const horizontalOptions = {
    ...CHART_OPTIONS,
    indexAxis: "y" as const,
    scales: {
      x: { grid: { color: "#1a2235" }, ticks: { color: "#8899aa", font: { size: 11 } }, border: { display: false } },
      y: { grid: { display: false }, ticks: { color: "#8899aa", font: { size: 11 } }, border: { display: false } },
    },
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "32px", display: "flex", flexDirection: "column", gap: "24px" }}>

      {/* ── Page sub-header — date range ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "13px", color: "#8899aa" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          style={{
            background: "#1a2235",
            border: "1px solid #1e2d40",
            color: "#f0f4f8",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 500,
            cursor: "pointer",
            outline: "none",
            fontFamily: "inherit",
          }}
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* ── Metric cards ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>
        <MetricCard
          label={`Leads — ${DATE_RANGE_LABELS[dateRange]}`}
          value={data?.leadsThisPeriod ?? 0}
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

      {/* ── Lead Funnel + Nexus Insights ──────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>
        <LeadFunnel funnel={data?.funnel ?? { new: 0, contacted: 0, qualified: 0, converted: 0 }} loading={loading} />
        <NexusInsights data={data} loading={loading} />
      </div>

      {/* ── Charts row ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>
        <Card style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8", marginBottom: "16px" }}>
            Leads by channel
          </div>
          <div style={{ height: "160px" }}>
            {loading ? (
              <div style={{ height: "100%", background: "#1a2235", borderRadius: "8px" }} />
            ) : (
              <Bar data={channelChartData} options={horizontalOptions} />
            )}
          </div>
        </Card>

        <Card style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8", marginBottom: "16px" }}>
            Weekly bookings
          </div>
          <div style={{ height: "160px" }}>
            {loading ? (
              <div style={{ height: "100%", background: "#1a2235", borderRadius: "8px" }} />
            ) : (
              <Bar data={weeklyChartData} options={CHART_OPTIONS} />
            )}
          </div>
        </Card>
      </div>

      {/* ── Recent leads + Activity feed ──────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px" }}>

        {/* Recent leads — table style */}
        <Card style={{ flex: 1, minWidth: 0, padding: 0, overflow: "hidden" }}>
          {/* Card header */}
          <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8" }}>Recent leads</div>
          </div>

          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 90px",
              padding: "8px 20px",
              marginTop: "12px",
              background: "#1a2235",
              borderTop: "1px solid #1e2d40",
              borderBottom: "1px solid #1e2d40",
            }}
          >
            {["Name", "Source", "Status"].map((h) => (
              <div key={h} style={{ fontSize: "11px", fontWeight: 600, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton" style={{ height: "36px" }} />
              ))}
            </div>
          ) : data?.recentLeads.length === 0 ? (
            <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#4a5a6b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8" }}>No leads yet</div>
              <div style={{ fontSize: "12px", color: "#8899aa", maxWidth: "240px" }}>Leads will appear here once captured via SMS, email, or voice</div>
            </div>
          ) : (
            data?.recentLeads.map((lead) => (
              <div
                key={lead.id}
                className="dashboard-lead-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px 90px",
                  padding: "10px 20px",
                  borderBottom: "1px solid #1e2d40",
                  alignItems: "center",
                  cursor: "default",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#1a2235"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 500, color: "#f0f4f8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lead.name ?? lead.phone ?? "Unknown"}
                  </div>
                  <div style={{ fontSize: "11px", color: "#4a5a6b", marginTop: "1px" }}>
                    {fmtRelative(lead.created_at)}
                  </div>
                </div>
                <div><SourcePill source={lead.source} /></div>
                <div>{lead.status && <StatusPill status={lead.status} />}</div>
              </div>
            ))
          )}

          {/* Footer */}
          <div style={{ padding: "12px 20px", textAlign: "right" }}>
            <Link to="/leads" style={{ fontSize: "12px", color: "#0ea5e9", fontWeight: 500 }}>
              View All Leads →
            </Link>
          </div>
        </Card>

        {/* Activity feed */}
        <Card style={{ flex: 1, minWidth: 0, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#f0f4f8" }}>Live activity feed</div>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
          </div>

          <div
            style={{
              maxHeight: "300px",
              overflowY: "auto",
            }}
          >
            {loading ? (
              <div style={{ padding: "12px 20px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: "40px" }} />
                ))}
              </div>
            ) : data?.activityFeed.length === 0 ? (
              <div style={{ padding: "32px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4a5a6b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "#f0f4f8" }}>No activity yet</div>
                <div style={{ fontSize: "12px", color: "#8899aa" }}>Messages and calls will appear here</div>
              </div>
            ) : (
              data?.activityFeed.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 20px",
                    borderBottom: "1px solid #1e2d40",
                  }}
                >
                  <ActivityIcon type={item.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "12.5px", color: "#f0f4f8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.description}
                    </div>
                  </div>
                  <div style={{ fontSize: "11px", color: "#4a5a6b", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {fmtRelative(item.time)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

      </div>
    </div>
  );
};

export default Dashboard;
