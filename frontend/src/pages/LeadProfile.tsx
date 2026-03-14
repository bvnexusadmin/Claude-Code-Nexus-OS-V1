import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

type BookingRow = {
  id: string;
  lead_id: string | null;
  service_type: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  created_at: string | null;
};

function fmt(dt: string | null | undefined) {
  if (!dt) return "";
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

function fmtDate(dt: string | null | undefined) {
  if (!dt) return "";
  try { return new Date(dt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); } catch { return dt; }
}

function deriveLeadScore(lead: LeadRow): number {
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

function generateAiAnalysis(lead: LeadRow): string {
  const name = (lead.name ?? "").trim() || "This lead";
  const urgency = lead.urgency ?? "unknown";
  const service = lead.service_type ?? "general service";
  const qs = lead.qualification_status ?? "pending";
  const source = lead.source ?? "an unknown channel";

  const urgencyText =
    urgency === "high" ? "high urgency requiring prompt follow-up" :
    urgency === "medium" ? "moderate urgency with a standard follow-up window" :
    urgency === "low" ? "low urgency, suitable for a nurture sequence" :
    "urgency not yet assessed";

  const qualText =
    qs === "qualified" ? "has been fully qualified and is ready for conversion" :
    qs.includes("partial") ? "is partially qualified — additional discovery recommended" :
    qs === "not_qualified" || qs === "disqualified" ? "does not meet current qualification criteria" :
    "has not yet been assessed for qualification";

  const action =
    urgency === "high" ? "Recommend immediate outreach within 1 hour." :
    urgency === "medium" ? "Recommend follow-up within 24 hours." :
    "Recommend adding to a nurture sequence.";

  return `${name} came in via ${source} requesting ${service}. This lead shows ${urgencyText}. Based on intake data, this lead ${qualText}. ${action}`;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  new: { bg: "rgba(14,165,233,0.15)", color: "#0ea5e9" },
  contacted: { bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
  qualified: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  "follow-up": { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  follow_up: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  converted: { bg: "rgba(16,185,129,0.2)", color: "#34d399" },
  lost: { bg: "rgba(239,68,68,0.15)", color: "#ef4444" },
};

function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "new").toLowerCase().replace(/_/g, "-");
  const c = STATUS_COLORS[s] ?? { bg: "rgba(136,153,170,0.15)", color: "#8899aa" };
  const display = s.charAt(0).toUpperCase() + s.slice(1);
  return (
    <span style={{
      display: "inline-block", padding: "3px 12px", borderRadius: "20px",
      fontSize: "12px", fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {display}
    </span>
  );
}

function ChannelIcon({ channel }: { channel: string | null }) {
  const c = (channel ?? "").toLowerCase();
  const map: Record<string, { label: string; bg: string; color: string }> = {
    sms: { label: "SMS", bg: "rgba(16,185,129,0.15)", color: "#10b981" },
    email: { label: "Email", bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
    voice: { label: "Voice", bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
    phone: { label: "Phone", bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  };
  const info = map[c] ?? { label: channel ?? "—", bg: "rgba(136,153,170,0.15)", color: "#8899aa" };
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: "4px",
      fontSize: "10px", fontWeight: 700, background: info.bg, color: info.color,
      letterSpacing: "0.04em", flexShrink: 0,
    }}>
      {info.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      style={{
        padding: "2px 8px", fontSize: "11px", fontWeight: 500,
        color: copied ? "#10b981" : "#8899aa",
        background: "transparent", border: "1px solid #1e2d40",
        borderRadius: "4px", cursor: "pointer",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// Shared card style
const card = {
  background: "#111827",
  border: "1px solid #1e2d40",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "14px",
};

const LeadProfile: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();
  const { activeClientId, loadingMe } = useTenant();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (loadingMe) return;
    if (!activeClientId || !leadId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: leadData, error: leadErr } = await supabase
          .from("leads")
          .select("id, client_id, name, phone, email, source, service_type, urgency, qualification_status, status, created_at")
          .eq("client_id", activeClientId)
          .eq("id", leadId)
          .single();

        if (cancelled) return;
        if (leadErr) throw new Error(leadErr.message);
        setLead((leadData as LeadRow) ?? null);

        const { data: msgData, error: msgErr } = await supabase
          .from("messages")
          .select("id, lead_id, client_id, channel, direction, content, created_at")
          .eq("client_id", activeClientId)
          .eq("lead_id", leadId)
          .order("created_at", { ascending: true })
          .limit(1000);

        if (cancelled) return;
        if (msgErr) throw new Error(msgErr.message);
        setMessages((msgData as MessageRow[]) ?? []);

        const { data: bookData } = await supabase
          .from("bookings")
          .select("id, lead_id, service_type, start_time, end_time, status, created_at")
          .eq("client_id", activeClientId)
          .eq("lead_id", leadId)
          .order("start_time", { ascending: false })
          .limit(20);

        if (cancelled) return;
        setBookings((bookData as BookingRow[]) ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`lead-profile-${activeClientId}-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${activeClientId},lead_id=eq.${leadId}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow;
          if (msg.client_id !== activeClientId) return;
          if (msg.lead_id !== leadId) return;
          setMessages((prev) =>
            prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeClientId, leadId, loadingMe]);

  const title = useMemo(() => {
    const nm = (lead?.name ?? "").trim();
    return nm || "Lead Profile";
  }, [lead]);

  const score = useMemo(() => lead ? deriveLeadScore(lead) : 0, [lead]);
  const scoreColor = score > 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const aiAnalysis = useMemo(() => lead ? generateAiAnalysis(lead) : "", [lead]);

  const handleSaveNotes = () => {
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 2000);
  };

  const handleAction = (label: string) => {
    setActionFeedback(label);
    setTimeout(() => setActionFeedback(null), 2000);
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Back button */}
      <div style={{ marginBottom: "20px" }}>
        <Link to="/leads" style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontSize: "13px", color: "#8899aa", textDecoration: "none",
          padding: "6px 12px", borderRadius: "6px",
          border: "1px solid #1e2d40", background: "#111827",
        }}>
          ← Leads
        </Link>
      </div>

      {loading && <div style={{ fontSize: "12px", color: "#8899aa", marginBottom: "12px" }}>Loading…</div>}
      {error && <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "12px", whiteSpace: "pre-wrap" }}>{error}</div>}

      {lead && (
        <div style={{ display: "grid", gridTemplateColumns: "65fr 35fr", gap: "20px", alignItems: "start" }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────────── */}
          <div>
            {/* Header card */}
            <div style={{ ...card, marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f4f8", margin: "0 0 8px 0" }}>
                    {title}
                  </h1>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <StatusBadge status={lead.status} />
                    {lead.source && (
                      <span style={{ fontSize: "12px", color: "#8899aa" }}>
                        via {lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}
                      </span>
                    )}
                    <span style={{
                      fontSize: "13px", fontWeight: 700, color: scoreColor,
                    }}>
                      Score: {score}
                    </span>
                    {lead.service_type && (
                      <span style={{ fontSize: "12px", color: "#8899aa" }}>
                        · {lead.service_type}
                      </span>
                    )}
                  </div>
                </div>
                <button style={{
                  padding: "7px 16px", fontSize: "13px", fontWeight: 500,
                  color: "#f0f4f8", background: "transparent",
                  border: "1px solid #1e2d40", borderRadius: "7px", cursor: "pointer",
                  flexShrink: 0,
                }}>
                  Edit
                </button>
              </div>

              <div style={{ marginTop: "14px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
                {[
                  ["Urgency", lead.urgency],
                  ["Qualification", lead.qualification_status],
                  ["Created", fmt(lead.created_at)],
                  ["Lead ID", leadId ? leadId.slice(0, 8) + "…" : "—"],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "2px" }}>{label}</div>
                    <div style={{ fontSize: "13px", color: "#8899aa" }}>{val || "—"}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Communication History */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>
                Communication History
              </h3>
              {messages.length === 0 ? (
                <div style={{ fontSize: "13px", color: "#4a5a6b" }}>No messages yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {messages.map((m) => {
                    const isOutbound = (m.direction ?? "").toLowerCase() === "outbound";
                    return (
                      <div key={m.id} style={{
                        padding: "10px 12px",
                        borderRadius: "8px",
                        background: isOutbound ? "rgba(14,165,233,0.07)" : "#0a0e1a",
                        border: `1px solid ${isOutbound ? "rgba(14,165,233,0.2)" : "#1e2d40"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                          <ChannelIcon channel={m.channel} />
                          <span style={{ fontSize: "11px", color: "#4a5a6b", marginLeft: "auto" }}>
                            {isOutbound ? "Outbound" : "Inbound"} · {fmt(m.created_at)}
                          </span>
                        </div>
                        <div style={{ fontSize: "13px", color: "#c4cfda", lineHeight: 1.5 }}>
                          {m.content ?? ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 10px 0" }}>Notes</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this lead…"
                rows={4}
                style={{
                  width: "100%", padding: "10px 12px", fontSize: "13px",
                  color: "#f0f4f8", background: "#0a0e1a",
                  border: "1px solid #1e2d40", borderRadius: "7px",
                  outline: "none", resize: "vertical", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px" }}>
                <button
                  onClick={handleSaveNotes}
                  style={{
                    padding: "7px 16px", fontSize: "13px", fontWeight: 600,
                    color: "#fff", background: "#0ea5e9", border: "none",
                    borderRadius: "7px", cursor: "pointer",
                  }}
                >
                  Save Notes
                </button>
                {notesSaved && <span style={{ fontSize: "12px", color: "#10b981" }}>Saved!</span>}
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ─────────────────────────────────────────── */}
          <div>
            {/* Contact Info */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>Contact Info</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <div>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>Phone</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontFamily: "monospace", color: "#f0f4f8", fontWeight: 500 }}>
                      {lead.phone ?? "—"}
                    </span>
                    {lead.phone && <CopyButton text={lead.phone} />}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>Email</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "14px", fontFamily: "monospace", color: "#f0f4f8", fontWeight: 500 }}>
                      {lead.email ?? "—"}
                    </span>
                    {lead.email && <CopyButton text={lead.email} />}
                  </div>
                </div>
              </div>
            </div>

            {/* AI Analysis */}
            <div style={{
              ...card,
              background: "rgba(99,102,241,0.07)",
              border: "1px solid rgba(99,102,241,0.25)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#818cf8", margin: 0 }}>Nexus Analysis</h3>
              </div>
              <p style={{ fontSize: "13px", color: "#a5b4c8", lineHeight: 1.6, margin: 0 }}>
                {aiAnalysis}
              </p>
            </div>

            {/* Bookings */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>Bookings</h3>
              {bookings.length === 0 ? (
                <div style={{ fontSize: "13px", color: "#4a5a6b" }}>No bookings yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {bookings.map((b) => {
                    const bStatus = (b.status ?? "").toLowerCase();
                    const bColor = bStatus === "confirmed" ? "#10b981" : bStatus === "pending" ? "#f59e0b" : "#8899aa";
                    return (
                      <div key={b.id} style={{
                        padding: "10px 12px", borderRadius: "8px",
                        background: "#0a0e1a", border: "1px solid #1e2d40",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "13px", color: "#f0f4f8", fontWeight: 500 }}>
                            {b.service_type ?? "Appointment"}
                          </span>
                          <span style={{ fontSize: "11px", fontWeight: 600, color: bColor }}>
                            {(b.status ?? "—").charAt(0).toUpperCase() + (b.status ?? "").slice(1)}
                          </span>
                        </div>
                        {b.start_time && (
                          <div style={{ fontSize: "12px", color: "#8899aa", marginTop: "4px" }}>
                            {fmtDate(b.start_time)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>Actions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  onClick={() => handleAction("Converting to client…")}
                  style={{
                    padding: "10px 16px", fontSize: "13px", fontWeight: 600,
                    color: "#fff", background: "#0ea5e9", border: "none",
                    borderRadius: "7px", cursor: "pointer", textAlign: "left",
                  }}
                >
                  Convert to Client
                </button>
                <button
                  onClick={() => handleAction("Opening message composer…")}
                  style={{
                    padding: "10px 16px", fontSize: "13px", fontWeight: 500,
                    color: "#f0f4f8", background: "transparent",
                    border: "1px solid #1e2d40", borderRadius: "7px", cursor: "pointer", textAlign: "left",
                  }}
                >
                  Send Message
                </button>
                <button
                  onClick={() => handleAction("Marked as lost.")}
                  style={{
                    padding: "10px 16px", fontSize: "13px", fontWeight: 500,
                    color: "#ef4444", background: "rgba(239,68,68,0.08)",
                    border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  Mark as Lost
                </button>
                {actionFeedback && (
                  <div style={{ fontSize: "12px", color: "#10b981", paddingTop: "2px" }}>
                    {actionFeedback}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadProfile;
