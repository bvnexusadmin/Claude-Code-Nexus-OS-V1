import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { supabase } from "../lib/supabase";
import { apiGet, apiPost } from "../lib/api";
import { useTenant } from "../lib/tenant";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Lead = {
  id: string;
  status: string;
  source: string | null;
  created_at: string;
  qualification_status: string | null;
};

type Message = {
  id: string;
  direction: string;
  channel: string | null;
  created_at: string;
};

type Booking = {
  id: string;
  status: string;
  start_time: string;
  lead_id: string | null;
  service_type: string | null;
};

type RuleType =
  | "followup"
  | "reminder"
  | "reengagement"
  | "thankyou"
  | "promo"
  | "review";

type AutomationRule = {
  rule_type: RuleType;
  enabled: boolean;
  use_ai_timing: boolean;
  use_ai_message: boolean;
  channel: "sms" | "email" | "both";
  delay_hours: number;
  custom_message: string;
};

type ActivityEntry = {
  id: string;
  lead_id: string | null;
  rule_type: string;
  channel: string;
  message_preview: string;
  status: string;
  created_at: string;
};

type AdvisorType =
  | "health_score"
  | "predictions"
  | "actions"
  | "growth"
  | "trend";

type TabId = "leads" | "communication" | "bookings" | "clients" | "advisor";

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_META: Record<
  RuleType,
  { label: string; description: string; defaultDelay: number; color: string }
> = {
  followup: {
    label: "Follow-Up Sequence",
    description: "Send follow-up to new leads with no response after X hours",
    defaultDelay: 24,
    color: "#0ea5e9",
  },
  reminder: {
    label: "Appointment Reminder",
    description: "Remind leads of upcoming appointments X hours before",
    defaultDelay: 24,
    color: "#6366f1",
  },
  reengagement: {
    label: "Re-engagement",
    description: "Reach out to stalled leads after X hours of no activity",
    defaultDelay: 72,
    color: "#a855f7",
  },
  thankyou: {
    label: "Thank You",
    description: "Send thanks automatically after a completed booking",
    defaultDelay: 2,
    color: "#10b981",
  },
  promo: {
    label: "Promotional Outreach",
    description: "Send promotional messages to inactive leads after X hours",
    defaultDelay: 168,
    color: "#f59e0b",
  },
  review: {
    label: "Review Request",
    description: "Request a review X hours after a completed appointment",
    defaultDelay: 48,
    color: "#ec4899",
  },
};

const ALL_RULE_TYPES: RuleType[] = [
  "followup",
  "reminder",
  "reengagement",
  "thankyou",
  "promo",
  "review",
];

function defaultRule(type: RuleType): AutomationRule {
  return {
    rule_type: type,
    enabled: false,
    use_ai_timing: false,
    use_ai_message: false,
    channel: "sms",
    delay_hours: RULE_META[type].defaultDelay,
    custom_message: "",
  };
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function getLast30Days(): { iso: string; label: string }[] {
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return {
      iso: d.toISOString().slice(0, 10),
      label: `${d.getMonth() + 1}/${d.getDate()}`,
    };
  });
}

function groupByDay(
  items: { created_at?: string; start_time?: string }[],
  days: { iso: string }[],
  field: "created_at" | "start_time" = "created_at"
): number[] {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const val = item[field];
    if (val) counts[val.slice(0, 10)] = (counts[val.slice(0, 10)] ?? 0) + 1;
  }
  return days.map((d) => counts[d.iso] ?? 0);
}

const CHART_COLORS = {
  blue: "#0ea5e9",
  indigo: "#6366f1",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#a855f7",
  pink: "#ec4899",
  blueAlpha: "rgba(14,165,233,0.18)",
  indigoAlpha: "rgba(99,102,241,0.18)",
  greenAlpha: "rgba(16,185,129,0.18)",
};

function baseBarOpts(
  stacked = false,
  horizontal = false
): Record<string, unknown> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? ("y" as const) : ("x" as const),
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1a2235",
        titleColor: "#f0f4f8",
        bodyColor: "#8899aa",
        borderColor: "#1e2d40",
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        stacked,
        ticks: { color: "#8899aa", font: { size: 11 } },
        grid: { color: "#1e2d40" },
      },
      y: {
        stacked,
        ticks: { color: "#8899aa", font: { size: 11 } },
        grid: { color: "#1e2d40" },
      },
    },
  };
}

function baseLineOpts(): Record<string, unknown> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1a2235",
        titleColor: "#f0f4f8",
        bodyColor: "#8899aa",
        borderColor: "#1e2d40",
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: "#8899aa", font: { size: 11 } },
        grid: { color: "#1e2d40" },
      },
      y: {
        ticks: { color: "#8899aa", font: { size: 11 } },
        grid: { color: "#1e2d40" },
      },
    },
  };
}

function baseDoughnutOpts(): Record<string, unknown> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
        labels: { color: "#8899aa", font: { size: 12 }, padding: 16 },
      },
      tooltip: {
        backgroundColor: "#1a2235",
        titleColor: "#f0f4f8",
        bodyColor: "#8899aa",
        borderColor: "#1e2d40",
        borderWidth: 1,
      },
    },
  };
}

// ─── Shared UI components ─────────────────────────────────────────────────────

const Card: React.FC<{
  title?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title, children, style }) => (
  <div
    style={{
      background: "#111827",
      border: "1px solid #1e2d40",
      borderRadius: "12px",
      padding: "20px",
      ...style,
    }}
  >
    {title && (
      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          color: "#8899aa",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          marginBottom: "14px",
        }}
      >
        {title}
      </div>
    )}
    {children}
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  accent?: string;
}> = ({ label, value, sub, accent = "#0ea5e9" }) => (
  <Card>
    <div
      style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}
    >
      {label}
    </div>
    <div style={{ fontSize: "28px", fontWeight: 700, color: accent, lineHeight: 1 }}>
      {value}
    </div>
    {sub && (
      <div style={{ fontSize: "12px", color: "#8899aa", marginTop: "6px" }}>
        {sub}
      </div>
    )}
  </Card>
);

// ─── Leads Tab ────────────────────────────────────────────────────────────────

const LeadsTab: React.FC<{ leads: Lead[] }> = ({ leads }) => {
  const days = getLast30Days();
  const last30 = useMemo(() => {
    const cutoff = days[0].iso;
    return leads.filter((l) => l.created_at >= cutoff);
  }, [leads, days]);

  const total = leads.length;
  const converted = leads.filter((l) => l.status === "converted").length;
  const active = leads.filter((l) =>
    ["new", "qualifying", "booking"].includes(l.status)
  ).length;
  const rate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const volumeData = groupByDay(last30, days);

  const statusCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};
  leads.forEach((l) => {
    const s = l.status ?? "unknown";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    const src = l.source ?? "unknown";
    sourceCounts[src] = (sourceCounts[src] ?? 0) + 1;
  });

  const sourceEntries = Object.entries(sourceCounts).sort(
    (a, b) => b[1] - a[1]
  );
  const statusEntries = Object.entries(statusCounts).sort(
    (a, b) => b[1] - a[1]
  );
  const statusColors = [
    "#0ea5e9", "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#a855f7",
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Stat row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <StatCard label="Total Leads" value={total} sub="Last 90 days" />
        <StatCard label="Converted" value={converted} sub="Of total leads" accent="#10b981" />
        <StatCard label="Conversion Rate" value={`${rate}%`} sub="Converted / total" accent="#6366f1" />
        <StatCard label="Active Leads" value={active} sub="In pipeline" accent="#f59e0b" />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <Card title="Lead Volume — Last 30 Days">
          <div style={{ height: "220px" }}>
            <Line
              data={{
                labels: days.map((d) => d.label),
                datasets: [
                  {
                    label: "Leads",
                    data: volumeData,
                    borderColor: CHART_COLORS.blue,
                    backgroundColor: CHART_COLORS.blueAlpha,
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                  },
                ],
              }}
              options={baseLineOpts() as any}
            />
          </div>
        </Card>

        <Card title="Lead Sources">
          <div style={{ height: "220px" }}>
            <Doughnut
              data={{
                labels: sourceEntries.map(([k]) => k),
                datasets: [
                  {
                    data: sourceEntries.map(([, v]) => v),
                    backgroundColor: [
                      CHART_COLORS.blue,
                      CHART_COLORS.indigo,
                      CHART_COLORS.green,
                      CHART_COLORS.amber,
                      CHART_COLORS.purple,
                    ],
                    borderWidth: 0,
                  },
                ],
              }}
              options={baseDoughnutOpts() as any}
            />
          </div>
        </Card>
      </div>

      {/* Status breakdown + table */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <Card title="Status Breakdown">
          <div style={{ height: "200px" }}>
            <Bar
              data={{
                labels: statusEntries.map(([k]) => k),
                datasets: [
                  {
                    data: statusEntries.map(([, v]) => v),
                    backgroundColor: statusColors,
                    borderRadius: 4,
                  },
                ],
              }}
              options={baseBarOpts() as any}
            />
          </div>
        </Card>

        <Card title="Top Sources">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["Source", "Count", "Share"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "#8899aa", fontWeight: 600, borderBottom: "1px solid #1e2d40" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceEntries.slice(0, 8).map(([src, cnt]) => (
                <tr key={src}>
                  <td style={{ padding: "8px", color: "#f0f4f8", textTransform: "capitalize" }}>{src}</td>
                  <td style={{ padding: "8px", color: "#8899aa" }}>{cnt}</td>
                  <td style={{ padding: "8px", color: "#8899aa" }}>
                    {total > 0 ? `${Math.round((cnt / total) * 100)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};

// ─── Communication Tab ────────────────────────────────────────────────────────

const CommunicationTab: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const days = getLast30Days();
  const total = messages.length;
  const inbound = messages.filter((m) => m.direction === "inbound").length;
  const outbound = messages.filter((m) => m.direction === "outbound").length;

  const volumeData = groupByDay(messages, days);

  const channelCounts: Record<string, number> = {};
  messages.forEach((m) => {
    const ch = m.channel ?? "unknown";
    channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
  });
  const channelEntries = Object.entries(channelCounts).sort(
    (a, b) => b[1] - a[1]
  );

  const responseRate =
    inbound > 0 ? Math.round((outbound / inbound) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <StatCard label="Total Messages" value={total} sub="Last 30 days" />
        <StatCard label="Inbound" value={inbound} sub="From leads" accent="#10b981" />
        <StatCard label="Outbound" value={outbound} sub="Sent by team/AI" accent="#6366f1" />
        <StatCard label="Response Rate" value={`${responseRate}%`} sub="Outbound / inbound" accent="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <Card title="Message Volume — Last 30 Days">
          <div style={{ height: "220px" }}>
            <Bar
              data={{
                labels: days.map((d) => d.label),
                datasets: [
                  {
                    label: "Messages",
                    data: volumeData,
                    backgroundColor: CHART_COLORS.indigo,
                    borderRadius: 3,
                  },
                ],
              }}
              options={baseBarOpts() as any}
            />
          </div>
        </Card>

        <Card title="Channel Breakdown">
          <div style={{ height: "220px" }}>
            <Doughnut
              data={{
                labels: channelEntries.map(([k]) => k),
                datasets: [
                  {
                    data: channelEntries.map(([, v]) => v),
                    backgroundColor: [
                      CHART_COLORS.indigo,
                      CHART_COLORS.blue,
                      CHART_COLORS.green,
                      CHART_COLORS.amber,
                    ],
                    borderWidth: 0,
                  },
                ],
              }}
              options={baseDoughnutOpts() as any}
            />
          </div>
        </Card>
      </div>

      <Card title="Inbound vs Outbound">
        <div style={{ height: "200px" }}>
          <Bar
            data={{
              labels: days.map((d) => d.label),
              datasets: [
                {
                  label: "Inbound",
                  data: groupByDay(
                    messages.filter((m) => m.direction === "inbound"),
                    days
                  ),
                  backgroundColor: CHART_COLORS.green,
                  borderRadius: 3,
                  stack: "a",
                },
                {
                  label: "Outbound",
                  data: groupByDay(
                    messages.filter((m) => m.direction === "outbound"),
                    days
                  ),
                  backgroundColor: CHART_COLORS.indigo,
                  borderRadius: 3,
                  stack: "a",
                },
              ],
            }}
            options={{
              ...baseBarOpts(true),
              plugins: {
                ...((baseBarOpts(true) as any).plugins ?? {}),
                legend: {
                  display: true,
                  labels: { color: "#8899aa", font: { size: 12 } },
                },
              },
            } as any}
          />
        </div>
      </Card>
    </div>
  );
};

// ─── Bookings Tab ─────────────────────────────────────────────────────────────

const BookingsTab: React.FC<{ bookings: Booking[] }> = ({ bookings }) => {
  const days = getLast30Days();
  const total = bookings.length;
  const confirmed = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "completed"
  ).length;
  const noShows = bookings.filter((b) => b.status === "no_show").length;
  const noShowRate = total > 0 ? Math.round((noShows / total) * 100) : 0;

  const volumeData = groupByDay(bookings, days, "start_time");

  const statusCounts: Record<string, number> = {};
  bookings.forEach((b) => {
    const s = b.status ?? "unknown";
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  });
  const statusEntries = Object.entries(statusCounts).sort(
    (a, b) => b[1] - a[1]
  );

  const serviceCounts: Record<string, number> = {};
  bookings.forEach((b) => {
    const svc = b.service_type ?? "General";
    serviceCounts[svc] = (serviceCounts[svc] ?? 0) + 1;
  });
  const serviceEntries = Object.entries(serviceCounts).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <StatCard label="Total Bookings" value={total} sub="Last 90 days" />
        <StatCard label="Confirmed" value={confirmed} sub="Confirmed + completed" accent="#10b981" />
        <StatCard label="No-Shows" value={noShows} sub="Missed appointments" accent="#ef4444" />
        <StatCard label="No-Show Rate" value={`${noShowRate}%`} sub="No-shows / total" accent={noShowRate > 20 ? "#ef4444" : "#f59e0b"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <Card title="Bookings Over Time — Last 30 Days">
          <div style={{ height: "220px" }}>
            <Bar
              data={{
                labels: days.map((d) => d.label),
                datasets: [
                  {
                    label: "Bookings",
                    data: volumeData,
                    backgroundColor: CHART_COLORS.green,
                    borderRadius: 3,
                  },
                ],
              }}
              options={baseBarOpts() as any}
            />
          </div>
        </Card>

        <Card title="Status Breakdown">
          <div style={{ height: "220px" }}>
            <Doughnut
              data={{
                labels: statusEntries.map(([k]) => k),
                datasets: [
                  {
                    data: statusEntries.map(([, v]) => v),
                    backgroundColor: [
                      CHART_COLORS.green,
                      CHART_COLORS.blue,
                      CHART_COLORS.amber,
                      CHART_COLORS.red,
                      CHART_COLORS.indigo,
                    ],
                    borderWidth: 0,
                  },
                ],
              }}
              options={baseDoughnutOpts() as any}
            />
          </div>
        </Card>
      </div>

      <Card title="Bookings by Service Type">
        <div style={{ height: "200px" }}>
          <Bar
            data={{
              labels: serviceEntries.map(([k]) => k),
              datasets: [
                {
                  data: serviceEntries.map(([, v]) => v),
                  backgroundColor: CHART_COLORS.blue,
                  borderRadius: 4,
                },
              ],
            }}
            options={baseBarOpts() as any}
          />
        </div>
      </Card>
    </div>
  );
};

// ─── Clients Tab ──────────────────────────────────────────────────────────────

const ClientsTab: React.FC<{ leads: Lead[]; bookings: Booking[] }> = ({
  leads,
  bookings,
}) => {
  const totalLeads = leads.length;
  const leadsWithBookings = useMemo(() => {
    const ids = new Set(bookings.map((b) => b.lead_id).filter(Boolean));
    return ids.size;
  }, [bookings]);

  const repeatLeads = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings.forEach((b) => {
      if (b.lead_id) counts[b.lead_id] = (counts[b.lead_id] ?? 0) + 1;
    });
    return Object.values(counts).filter((c) => c > 1).length;
  }, [bookings]);

  const revenueEstimate = bookings.length * 150;

  const days = getLast30Days();
  const volumeData = groupByDay(leads, days);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
        <StatCard label="Total Leads" value={totalLeads} sub="All time" />
        <StatCard label="Have Bookings" value={leadsWithBookings} sub="With ≥1 booking" accent="#10b981" />
        <StatCard label="Repeat Clients" value={repeatLeads} sub="With ≥2 bookings" accent="#6366f1" />
        <StatCard label="Est. Revenue" value={`$${revenueEstimate.toLocaleString()}`} sub="At $150/booking" accent="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <Card title="Lead Acquisition — Last 30 Days">
          <div style={{ height: "220px" }}>
            <Line
              data={{
                labels: days.map((d) => d.label),
                datasets: [
                  {
                    label: "New Leads",
                    data: volumeData,
                    borderColor: CHART_COLORS.purple,
                    backgroundColor: "rgba(168,85,247,0.15)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 2,
                  },
                ],
              }}
              options={baseLineOpts() as any}
            />
          </div>
        </Card>

        <Card title="Client Engagement">
          <div style={{ height: "220px" }}>
            <Doughnut
              data={{
                labels: ["Have Bookings", "No Bookings"],
                datasets: [
                  {
                    data: [leadsWithBookings, Math.max(0, totalLeads - leadsWithBookings)],
                    backgroundColor: [CHART_COLORS.green, "#1e2d40"],
                    borderWidth: 0,
                  },
                ],
              }}
              options={baseDoughnutOpts() as any}
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── AI Advisor Tab ───────────────────────────────────────────────────────────

const HealthScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70
      ? "#10b981"
      : score >= 45
      ? "#f59e0b"
      : "#ef4444";
  const label =
    score >= 70 ? "Strong" : score >= 45 ? "Moderate" : "Needs Attention";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <svg width="150" height="150" viewBox="0 0 150 150">
        <circle cx="75" cy="75" r={radius} fill="none" stroke="#1e2d40" strokeWidth="12" />
        <circle
          cx="75"
          cy="75"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 75 75)"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
        <text
          x="75"
          y="68"
          textAnchor="middle"
          fill="#f0f4f8"
          fontSize="30"
          fontWeight="700"
          fontFamily="inherit"
        >
          {score}
        </text>
        <text
          x="75"
          y="90"
          textAnchor="middle"
          fill="#8899aa"
          fontSize="12"
          fontFamily="inherit"
        >
          / 100
        </text>
      </svg>
      <span
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color,
          background: `${color}18`,
          padding: "4px 12px",
          borderRadius: "999px",
          border: `1px solid ${color}40`,
        }}
      >
        {label}
      </span>
    </div>
  );
};

const AiPanel: React.FC<{
  title: string;
  type: AdvisorType;
  result: string | null;
  loading: boolean;
  onGenerate: () => void;
  accent?: string;
}> = ({ title, type, result, loading, onGenerate, accent = "#6366f1" }) => (
  <Card>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "#f0f4f8" }}>
        {title}
      </div>
      <button
        onClick={onGenerate}
        disabled={loading}
        style={{
          padding: "6px 14px",
          fontSize: "12px",
          fontWeight: 600,
          borderRadius: "6px",
          border: `1px solid ${accent}60`,
          background: loading ? "#1e2d40" : `${accent}18`,
          color: loading ? "#8899aa" : accent,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Generating…" : result ? "Regenerate" : "Generate"}
      </button>
    </div>
    {result ? (
      <div
        style={{
          fontSize: "13px",
          color: "#c8d6e5",
          lineHeight: 1.7,
          whiteSpace: "pre-line",
        }}
      >
        {result}
      </div>
    ) : !loading ? (
      <div style={{ fontSize: "13px", color: "#4a5a6b", fontStyle: "italic" }}>
        Click Generate to get AI-powered {type.replace("_", " ")} analysis.
      </div>
    ) : (
      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: accent,
              opacity: 0.6,
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    )}
  </Card>
);

// ─── Rule Card ────────────────────────────────────────────────────────────────

const RuleCard: React.FC<{
  ruleType: RuleType;
  rule: AutomationRule;
  onChange: (updated: AutomationRule) => void;
  onSave: () => void;
  saving: boolean;
}> = ({ ruleType, rule, onChange, onSave, saving }) => {
  const [expanded, setExpanded] = useState(false);
  const meta = RULE_META[ruleType];

  const set = <K extends keyof AutomationRule>(k: K, v: AutomationRule[K]) =>
    onChange({ ...rule, [k]: v });

  return (
    <div
      style={{
        background: "#111827",
        border: `1px solid ${rule.enabled ? meta.color + "40" : "#1e2d40"}`,
        borderRadius: "12px",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      {/* Header row */}
      <div
        style={{ display: "flex", alignItems: "center", padding: "16px 20px", gap: "12px", cursor: "pointer" }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: rule.enabled ? meta.color : "#4a5a6b",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: "#f0f4f8" }}>
            {meta.label}
          </div>
          <div style={{ fontSize: "12px", color: "#8899aa", marginTop: "2px" }}>
            {meta.description}
          </div>
        </div>

        {/* Toggle */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            set("enabled", !rule.enabled);
          }}
          style={{
            width: "40px",
            height: "22px",
            borderRadius: "11px",
            background: rule.enabled ? meta.color : "#1e2d40",
            position: "relative",
            cursor: "pointer",
            transition: "background 0.2s",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "3px",
              left: rule.enabled ? "21px" : "3px",
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s",
            }}
          />
        </div>

        <div
          style={{
            color: "#4a5a6b",
            fontSize: "12px",
            transition: "transform 0.2s",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div
          style={{ padding: "0 20px 20px", borderTop: "1px solid #1e2d40", paddingTop: "16px" }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
            {/* Channel */}
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#8899aa", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Channel
              </label>
              <select
                value={rule.channel}
                onChange={(e) =>
                  set("channel", e.target.value as AutomationRule["channel"])
                }
                style={{ width: "100%", padding: "8px 10px", background: "#0a0e1a", border: "1px solid #1e2d40", borderRadius: "6px", color: "#f0f4f8", fontSize: "13px" }}
              >
                <option value="sms">SMS</option>
                <option value="email">Email</option>
                <option value="both">Both</option>
              </select>
            </div>

            {/* Delay */}
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#8899aa", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Delay (hours)
              </label>
              <input
                type="number"
                min={1}
                value={rule.delay_hours}
                onChange={(e) => set("delay_hours", parseInt(e.target.value) || 24)}
                style={{ width: "100%", padding: "8px 10px", background: "#0a0e1a", border: "1px solid #1e2d40", borderRadius: "6px", color: "#f0f4f8", fontSize: "13px", boxSizing: "border-box" }}
              />
            </div>
          </div>

          {/* Toggles */}
          <div style={{ display: "flex", gap: "20px", marginBottom: "12px" }}>
            {(
              [
                { key: "use_ai_timing" as const, label: "AI Timing" },
                { key: "use_ai_message" as const, label: "AI Message" },
              ] as const
            ).map(({ key, label }) => (
              <label
                key={key}
                style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", color: "#8899aa" }}
              >
                <input
                  type="checkbox"
                  checked={rule[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  style={{ accentColor: meta.color }}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Custom message */}
          {!rule.use_ai_message && (
            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", fontSize: "11px", color: "#8899aa", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Custom Message
              </label>
              <textarea
                value={rule.custom_message}
                onChange={(e) => set("custom_message", e.target.value)}
                placeholder="Leave blank to use default template…"
                rows={3}
                style={{ width: "100%", padding: "8px 10px", background: "#0a0e1a", border: "1px solid #1e2d40", borderRadius: "6px", color: "#f0f4f8", fontSize: "13px", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              />
            </div>
          )}
          {rule.use_ai_message && (
            <div
              style={{ marginBottom: "12px", padding: "10px", background: "#0a0e1a", border: "1px solid #6366f130", borderRadius: "6px", fontSize: "12px", color: "#8899aa" }}
            >
              AI will generate a personalized message for each lead using their
              context and conversation history.
            </div>
          )}

          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 600,
              borderRadius: "7px",
              border: "none",
              background: meta.color,
              color: "#fff",
              cursor: saving ? "not-allowed" : "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save Rule"}
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Activity Log ─────────────────────────────────────────────────────────────

const ActivityLog: React.FC<{ activity: ActivityEntry[] }> = ({ activity }) => {
  const statusColor = (s: string) =>
    s === "sent" ? "#10b981" : s === "queued" ? "#f59e0b" : "#ef4444";

  return (
    <Card title="Outreach Activity Log">
      {activity.length === 0 ? (
        <div style={{ padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4a5a6b" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13 19.79 19.79 0 0 1 1.61 4.41 2 2 0 0 1 3.6 2.25h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91" />
          </svg>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8" }}>No outreach activity yet</div>
          <div style={{ fontSize: "12px", color: "#8899aa" }}>Enable automation rules above to start outreach</div>
        </div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              {["Rule", "Channel", "Preview", "Status", "Time"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "#8899aa", fontWeight: 600, borderBottom: "1px solid #1e2d40", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activity.slice(0, 20).map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #1e2d4040" }}>
                <td style={{ padding: "9px 10px", color: "#f0f4f8", textTransform: "capitalize" }}>
                  {a.rule_type}
                </td>
                <td style={{ padding: "9px 10px", color: "#8899aa", textTransform: "uppercase", fontSize: "11px" }}>
                  {a.channel}
                </td>
                <td style={{ padding: "9px 10px", color: "#8899aa", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.message_preview}
                </td>
                <td style={{ padding: "9px 10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: statusColor(a.status), background: `${statusColor(a.status)}18`, padding: "3px 8px", borderRadius: "999px" }}>
                    {a.status}
                  </span>
                </td>
                <td style={{ padding: "9px 10px", color: "#8899aa", whiteSpace: "nowrap", fontSize: "12px" }}>
                  {new Date(a.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
};

// ─── AI Advisor Tab (full) ────────────────────────────────────────────────────

const AiAdvisorTab: React.FC<{
  leads: Lead[];
  messages: Message[];
  bookings: Booking[];
}> = ({ leads, messages, bookings }) => {
  // ── Compute metrics ─────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const totalLeads = leads.length;
    const converted = leads.filter((l) => l.status === "converted").length;
    const conversionRate =
      totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;
    const totalBookings = bookings.length;
    const noShows = bookings.filter((b) => b.status === "no_show").length;
    const noShowRate =
      totalBookings > 0 ? Math.round((noShows / totalBookings) * 100) : 0;
    const totalMessages = messages.length;
    const inboundMessages = messages.filter(
      (m) => m.direction === "inbound"
    ).length;
    const outboundMessages = messages.filter(
      (m) => m.direction === "outbound"
    ).length;
    const srcCounts: Record<string, number> = {};
    leads.forEach((l) => {
      if (l.source) srcCounts[l.source] = (srcCounts[l.source] ?? 0) + 1;
    });
    const topSource =
      Object.entries(srcCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      "unknown";
    const activeLeads = leads.filter((l) =>
      ["new", "qualifying", "booking"].includes(l.status)
    ).length;
    const revenueEstimate = totalBookings * 150;
    return {
      totalLeads,
      conversionRate,
      totalBookings,
      noShowRate,
      totalMessages,
      inboundMessages,
      outboundMessages,
      topSource,
      activeLeads,
      revenueEstimate,
    };
  }, [leads, messages, bookings]);

  const healthScore = useMemo(() => {
    let s = 40;
    if (metrics.conversionRate >= 15) s += 15;
    else if (metrics.conversionRate >= 8) s += 8;
    if (metrics.noShowRate <= 10) s += 15;
    else if (metrics.noShowRate <= 20) s += 7;
    if (metrics.totalBookings >= 10) s += 15;
    else if (metrics.totalBookings >= 3) s += 7;
    if (metrics.totalLeads >= 20) s += 15;
    else if (metrics.totalLeads >= 5) s += 7;
    return Math.min(100, Math.max(0, s));
  }, [metrics]);

  // ── AI panel state ───────────────────────────────────────────────────────
  const [aiResults, setAiResults] = useState<
    Partial<Record<AdvisorType, string>>
  >({});
  const [aiLoading, setAiLoading] = useState<
    Partial<Record<AdvisorType, boolean>>
  >({});
  const [aiError, setAiError] = useState<string | null>(null);

  const generateAi = useCallback(
    async (type: AdvisorType) => {
      setAiLoading((prev) => ({ ...prev, [type]: true }));
      setAiError(null);
      try {
        const data = await apiPost<{ ok: boolean; result: string }>(
          "/internal/analytics/ai-advisor",
          { advisor_type: type, metrics }
        );
        setAiResults((prev) => ({ ...prev, [type]: data.result }));
      } catch (err: any) {
        setAiError(err?.message ?? "AI request failed");
      } finally {
        setAiLoading((prev) => ({ ...prev, [type]: false }));
      }
    },
    [metrics]
  );

  // ── Automation rules state ───────────────────────────────────────────────
  const [rules, setRules] = useState<Record<RuleType, AutomationRule>>(
    () =>
      Object.fromEntries(
        ALL_RULE_TYPES.map((t) => [t, defaultRule(t)])
      ) as Record<RuleType, AutomationRule>
  );
  const [savingRule, setSavingRule] = useState<RuleType | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);

  // Fetch rules + activity on mount
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [rulesRes, actRes] = await Promise.all([
          apiGet<{ ok: boolean; rules: AutomationRule[] }>(
            "/internal/automation-rules"
          ),
          apiGet<{ ok: boolean; activity: ActivityEntry[] }>(
            "/internal/automation-rules/activity"
          ),
        ]);
        if (!mounted) return;
        if (rulesRes.rules.length > 0) {
          const map = { ...rules };
          rulesRes.rules.forEach((r) => {
            if (r.rule_type in map) {
              map[r.rule_type as RuleType] = {
                ...r,
                custom_message: r.custom_message ?? "",
              };
            }
          });
          setRules(map);
        }
        setActivity(actRes.activity ?? []);
      } catch {
        // Gracefully degrade — tables may not exist yet
      } finally {
        if (mounted) setRulesLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveRule = async (type: RuleType) => {
    setSavingRule(type);
    try {
      await apiPost("/internal/automation-rules/upsert", rules[type]);
    } catch (err: any) {
      setAiError(`Save failed: ${err?.message}`);
    } finally {
      setSavingRule(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {aiError && (
        <div style={{ padding: "10px 16px", background: "#ef444418", border: "1px solid #ef444440", borderRadius: "8px", fontSize: "13px", color: "#ef4444" }}>
          {aiError}
        </div>
      )}

      {/* ── Part 1: Business Intelligence ─────────────────────────────────── */}
      <div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#f0f4f8", marginBottom: "16px", paddingBottom: "10px", borderBottom: "1px solid #1e2d40" }}>
          Business Intelligence
        </div>

        {/* Health Score + Trend */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "16px", marginBottom: "16px" }}>
          <Card style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.07em" }}>
              Health Score
            </div>
            <HealthScoreRing score={healthScore} />
            <div style={{ fontSize: "12px", color: "#8899aa", textAlign: "center" }}>
              Based on conversion, bookings & no-shows
            </div>
          </Card>

          <AiPanel
            title="Trend Analysis"
            type="trend"
            result={aiResults.trend ?? null}
            loading={!!aiLoading.trend}
            onGenerate={() => generateAi("trend")}
            accent="#0ea5e9"
          />
        </div>

        {/* Predictions + Actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
          <AiPanel
            title="Predictions (Next 30 Days)"
            type="predictions"
            result={aiResults.predictions ?? null}
            loading={!!aiLoading.predictions}
            onGenerate={() => generateAi("predictions")}
            accent="#6366f1"
          />
          <AiPanel
            title="Recommended Actions"
            type="actions"
            result={aiResults.actions ?? null}
            loading={!!aiLoading.actions}
            onGenerate={() => generateAi("actions")}
            accent="#10b981"
          />
        </div>

        {/* Growth Strategies */}
        <AiPanel
          title="Growth Strategies"
          type="growth"
          result={aiResults.growth ?? null}
          loading={!!aiLoading.growth}
          onGenerate={() => generateAi("growth")}
          accent="#f59e0b"
        />
      </div>

      {/* ── Part 2: Outreach Automation Engine ──────────────────────────────── */}
      <div>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#f0f4f8", marginBottom: "4px", paddingBottom: "10px", borderBottom: "1px solid #1e2d40" }}>
          Outreach Automation Engine
        </div>
        <div style={{ fontSize: "13px", color: "#8899aa", marginBottom: "20px" }}>
          Configure automated outreach rules. The background job runs every 15 minutes and logs activity below.
        </div>

        {rulesLoading ? (
          <div style={{ color: "#4a5a6b", fontSize: "13px" }}>Loading rules…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
            {ALL_RULE_TYPES.map((type) => (
              <RuleCard
                key={type}
                ruleType={type}
                rule={rules[type]}
                onChange={(updated) =>
                  setRules((prev) => ({ ...prev, [type]: updated }))
                }
                onSave={() => handleSaveRule(type)}
                saving={savingRule === type}
              />
            ))}
          </div>
        )}

        <ActivityLog activity={activity} />

        {/* Notification Preferences */}
        <Card title="Notification Preferences" style={{ marginTop: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {[
              "Email me when a rule fires",
              "Dashboard notification when outreach is queued",
              "Weekly automation summary report",
            ].map((pref) => (
              <label key={pref} style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", fontSize: "13px", color: "#8899aa" }}>
                <input type="checkbox" style={{ accentColor: "#0ea5e9" }} />
                {pref}
              </label>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

// ─── Main Analytics Component ─────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: "leads", label: "Leads" },
  { id: "communication", label: "Communication" },
  { id: "bookings", label: "Bookings" },
  { id: "clients", label: "Clients" },
  { id: "advisor", label: "AI Advisor" },
];

const Analytics: React.FC = () => {
  const { activeClientId } = useTenant();
  const [activeTab, setActiveTab] = useState<TabId>("leads");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [leadsData, setLeadsData] = useState<Lead[]>([]);
  const [messagesData, setMessagesData] = useState<Message[]>([]);
  const [bookingsData, setBookingsData] = useState<Booking[]>([]);

  useEffect(() => {
    if (!activeClientId) return;
    let mounted = true;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const ninetyDaysAgo = new Date(
          Date.now() - 90 * 24 * 60 * 60 * 1000
        ).toISOString();
        const thirtyDaysAgo = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        ).toISOString();

        const [leadsRes, messagesRes, bookingsRes] = await Promise.all([
          supabase
            .from("leads")
            .select("id, status, source, created_at, qualification_status")
            .eq("client_id", activeClientId)
            .gte("created_at", ninetyDaysAgo)
            .order("created_at", { ascending: false })
            .limit(1000),
          supabase
            .from("messages")
            .select("id, direction, channel, created_at")
            .eq("client_id", activeClientId)
            .gte("created_at", thirtyDaysAgo)
            .order("created_at", { ascending: false })
            .limit(2000),
          supabase
            .from("bookings")
            .select("id, status, start_time, lead_id, service_type")
            .eq("client_id", activeClientId)
            .gte("start_time", ninetyDaysAgo)
            .order("start_time", { ascending: false })
            .limit(1000),
        ]);

        if (!mounted) return;
        if (leadsRes.error) throw new Error(leadsRes.error.message);
        if (messagesRes.error) throw new Error(messagesRes.error.message);
        if (bookingsRes.error) throw new Error(bookingsRes.error.message);

        setLeadsData(leadsRes.data ?? []);
        setMessagesData(messagesRes.data ?? []);
        setBookingsData(bookingsRes.data ?? []);
      } catch (err: any) {
        if (mounted) setError(err?.message ?? "Failed to load analytics data");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();
    return () => { mounted = false; };
  }, [activeClientId]);

  if (!activeClientId) {
    return (
      <div style={{ padding: "40px 28px", color: "#8899aa", fontSize: "14px" }}>
        Select a client to view analytics.
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", minHeight: "100%" }}>
      {/* Page header */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#f0f4f8", margin: 0 }}>
          Analytics
        </h2>
        <p style={{ fontSize: "13px", color: "#8899aa", margin: "4px 0 0" }}>
          Business intelligence, performance metrics &amp; outreach automation
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "0", marginBottom: "24px", borderBottom: "1px solid #1e2d40" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: "10px 20px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: activeTab === tab.id ? "#f0f4f8" : "#8899aa",
              borderBottom: `2px solid ${activeTab === tab.id ? "#0ea5e9" : "transparent"}`,
              cursor: "pointer",
              marginBottom: "-1px",
              transition: "color 0.15s",
            }}
          >
            {tab.label}
            {tab.id === "advisor" && (
              <span
                style={{
                  marginLeft: "6px",
                  fontSize: "10px",
                  background: "#6366f118",
                  color: "#6366f1",
                  border: "1px solid #6366f140",
                  padding: "1px 6px",
                  borderRadius: "999px",
                  fontWeight: 700,
                }}
              >
                AI
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ color: "#8899aa", fontSize: "14px", padding: "40px 0", textAlign: "center" }}>
          Loading analytics data…
        </div>
      ) : error ? (
        <div style={{ padding: "16px", background: "#ef444418", border: "1px solid #ef444440", borderRadius: "8px", color: "#ef4444", fontSize: "13px" }}>
          {error}
        </div>
      ) : (
        <>
          {activeTab === "leads" && <LeadsTab leads={leadsData} />}
          {activeTab === "communication" && (
            <CommunicationTab messages={messagesData} />
          )}
          {activeTab === "bookings" && (
            <BookingsTab bookings={bookingsData} />
          )}
          {activeTab === "clients" && (
            <ClientsTab leads={leadsData} bookings={bookingsData} />
          )}
          {activeTab === "advisor" && (
            <AiAdvisorTab
              leads={leadsData}
              messages={messagesData}
              bookings={bookingsData}
            />
          )}
        </>
      )}

      {/* Pulse animation for AI loading dots */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default Analytics;
