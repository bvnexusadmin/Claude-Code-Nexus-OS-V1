import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTenant } from "../lib/tenant";

type LeadRow = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  service_type: string | null;
  urgency: string | null;
  qualification_status: string | null;
  status: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: string;
  lead_id: string;
  client_id: string;
  channel: string | null;
  direction: string | null;
  content: string | null;
  created_at: string;
};

type LeadListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  qualification_status: string | null;
  service_type: string | null;
  urgency: string | null;
  source: string | null;
  created_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_channel: string | null;
};

function preview(text: string | null | undefined, max = 80) {
  const s = (text ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return "—";
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dt).toLocaleDateString();
}

function deriveLeadScore(lead: LeadListItem): number {
  let score = 45;
  const urgency = (lead.urgency ?? "").toLowerCase();
  if (urgency === "high") score += 28;
  else if (urgency === "medium") score += 14;
  else if (urgency === "low") score -= 5;

  const qs = (lead.qualification_status ?? "").toLowerCase();
  if (qs === "qualified") score += 27;
  else if (qs.includes("partial")) score += 12;
  else if (qs === "not_qualified" || qs === "disqualified") score -= 18;

  if (lead.id.length > 0) {
    score += (lead.id.charCodeAt(lead.id.length - 1) % 10) - 5;
  }
  return Math.max(1, Math.min(100, score));
}

const SOURCE_COLORS: Record<string, { bg: string; color: string }> = {
  sms: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  email: { bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
  website: { bg: "rgba(14,165,233,0.15)", color: "#0ea5e9" },
  phone: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  voice: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  referral: { bg: "rgba(236,72,153,0.15)", color: "#f472b6" },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new: { bg: "rgba(14,165,233,0.15)", color: "#0ea5e9" },
  contacted: { bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
  qualified: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  "follow-up": { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  follow_up: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  converted: { bg: "rgba(16,185,129,0.2)", color: "#34d399" },
  lost: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
};

const STATUS_PILLS = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Contacted", value: "contacted" },
  { label: "Qualified", value: "qualified" },
  { label: "Follow-Up", value: "follow-up" },
  { label: "Converted", value: "converted" },
  { label: "Lost", value: "lost" },
];

function SourceBadge({ source }: { source: string | null }) {
  const s = (source ?? "").toLowerCase();
  const c = SOURCE_COLORS[s] ?? { bg: "rgba(136,153,170,0.15)", color: "#8899aa" };
  const label = source ? source.charAt(0).toUpperCase() + source.slice(1).toLowerCase() : "—";
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase().replace(/_/g, "-");
  const c = STATUS_COLORS[s] ?? STATUS_COLORS[status.toLowerCase()] ?? { bg: "rgba(136,153,170,0.15)", color: "#8899aa" };
  const display = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {display}
    </span>
  );
}

function ScoreCell({ score }: { score: number }) {
  const color = score > 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  return <span style={{ fontWeight: 700, color, fontSize: "13px" }}>{score}</span>;
}

const COL = "2fr 1.5fr 90px 110px 120px 64px 90px";

const Leads: React.FC = () => {
  const { activeClientId, loadingMe } = useTenant();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    if (loadingMe) return;
    if (!activeClientId) {
      setLeads([]);
      setMessages([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: leadData, error: leadErr } = await supabase
          .from("leads")
          .select("id, client_id, name, phone, email, source, service_type, urgency, qualification_status, status, created_at")
          .eq("client_id", activeClientId)
          .order("created_at", { ascending: false })
          .limit(500);

        if (cancelled) return;
        if (leadErr) throw new Error(leadErr.message);
        setLeads((leadData as LeadRow[]) ?? []);

        const { data: msgData, error: msgErr } = await supabase
          .from("messages")
          .select("id, lead_id, client_id, channel, direction, content, created_at")
          .eq("client_id", activeClientId)
          .not("lead_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(800);

        if (cancelled) return;
        if (msgErr) throw new Error(msgErr.message);
        setMessages((msgData as MessageRow[]) ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [activeClientId, loadingMe]);

  const lastByLead = useMemo(() => {
    const map = new Map<string, MessageRow>();
    for (const m of messages) {
      if (!m.lead_id) continue;
      if (!map.has(m.lead_id)) map.set(m.lead_id, m);
    }
    return map;
  }, [messages]);

  const items: LeadListItem[] = useMemo(() => {
    const base = leads.map((l) => {
      const last = lastByLead.get(l.id);
      return {
        id: l.id,
        name: (l.name ?? "").trim() || "Unnamed Lead",
        phone: l.phone ?? null,
        email: l.email ?? null,
        status: (l.status ?? "new").toLowerCase(),
        qualification_status: l.qualification_status ?? null,
        service_type: l.service_type ?? null,
        urgency: l.urgency ?? null,
        source: l.source ?? null,
        created_at: l.created_at ?? null,
        last_message_at: last?.created_at ?? null,
        last_message_preview: preview(last?.content ?? null, 90),
        last_channel: last?.channel ?? null,
      };
    });

    const qq = q.trim().toLowerCase();

    return base
      .filter((x) => {
        if (status !== "all") {
          const xs = x.status.replace(/_/g, "-");
          if (xs !== status && x.status !== status) return false;
        }
        if (!qq) return true;
        const hay = [
          x.name, x.phone ?? "", x.email ?? "", x.service_type ?? "",
          x.urgency ?? "", x.qualification_status ?? "", x.source ?? "",
          x.last_message_preview ?? "",
        ].join(" ").toLowerCase();
        return hay.includes(qq);
      })
      .sort((a, b) => {
        const at = a.last_message_at ?? a.created_at ?? "";
        const bt = b.last_message_at ?? b.created_at ?? "";
        return bt.localeCompare(at);
      });
  }, [leads, lastByLead, q, status]);

  return (
    <div style={{ padding: "24px" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#f0f4f8", margin: 0 }}>Leads</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search leads…"
            style={{
              width: "220px", padding: "8px 12px", fontSize: "13px",
              color: "#f0f4f8", background: "#1a2235",
              border: "1px solid #1e2d40", borderRadius: "7px", outline: "none",
            }}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{
              padding: "8px 12px", fontSize: "13px", color: "#f0f4f8",
              background: "#1a2235", border: "1px solid #1e2d40",
              borderRadius: "7px", cursor: "pointer",
            }}
          >
            {STATUS_PILLS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <button
            style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: 600,
              color: "#fff", background: "#0ea5e9", border: "none",
              borderRadius: "7px", cursor: "pointer",
            }}
          >
            + New Lead
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        {STATUS_PILLS.map((pill) => {
          const active = status === pill.value;
          return (
            <button
              key={pill.value}
              onClick={() => setStatus(pill.value)}
              style={{
                padding: "4px 14px", borderRadius: "20px", fontSize: "13px",
                fontWeight: 500, border: "none", cursor: "pointer",
                background: active ? "#0ea5e9" : "#1a2235",
                color: active ? "#fff" : "#8899aa",
              }}
            >
              {pill.label}
            </button>
          );
        })}
      </div>

      {!activeClientId ? (
        <div style={{ fontSize: "12px", color: "#4a5a6b" }}>No active tenant selected.</div>
      ) : (
        <>
          {loading && <div style={{ fontSize: "12px", color: "#8899aa", marginBottom: "12px" }}>Loading…</div>}
          {error && <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "12px", whiteSpace: "pre-wrap" }}>{error}</div>}

          {/* Table */}
          <div style={{ border: "1px solid #1e2d40", borderRadius: "8px", overflow: "hidden" }}>
            {/* Header */}
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "10px 16px", background: "#1a2235",
              borderBottom: "1px solid #1e2d40", fontSize: "11px",
              fontWeight: 600, color: "#8899aa", textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              {["Name", "Contact", "Source", "Status", "Last Activity", "Score", "Assigned"].map((h) => (
                <div key={h}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {items.map((l, idx) => {
              const score = deriveLeadScore(l);
              const isLast = idx === items.length - 1;
              return (
                <div
                  key={l.id}
                  onClick={() => navigate(`/leads/${l.id}`)}
                  onMouseEnter={() => setHoveredRow(l.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    alignItems: "center", padding: "0 16px",
                    height: "44px", cursor: "pointer",
                    background: hoveredRow === l.id ? "#1a2235" : "#111827",
                    borderBottom: isLast ? "none" : "1px solid #1e2d40",
                  }}
                >
                  <div style={{
                    fontWeight: 600, fontSize: "14px", color: "#f0f4f8",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {l.name}
                  </div>
                  <div style={{
                    fontFamily: "monospace", fontSize: "13px", color: "#8899aa",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {l.phone ?? l.email ?? "—"}
                  </div>
                  <div><SourceBadge source={l.source} /></div>
                  <div><StatusBadge status={l.status} /></div>
                  <div style={{ fontSize: "12px", color: "#8899aa" }}>
                    {timeAgo(l.last_message_at ?? l.created_at)}
                  </div>
                  <div><ScoreCell score={score} /></div>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: "20px",
                      fontSize: "11px", fontWeight: 600,
                      background: "rgba(99,102,241,0.15)", color: "#818cf8",
                    }}>
                      AI
                    </span>
                  </div>
                </div>
              );
            })}

            {items.length === 0 && !loading && (
              <div style={{ padding: "32px 16px", fontSize: "13px", color: "#4a5a6b", textAlign: "center" }}>
                No leads found.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Leads;
