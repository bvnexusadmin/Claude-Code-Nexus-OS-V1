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
  source: string | null;
  created_at: string | null;
};

function fmt(dt: string | null | undefined) {
  if (!dt) return "—";
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

function fmtDate(dt: string | null | undefined) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return dt; }
}

const BOOKING_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  confirmed: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
  pending: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  completed: { bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
  cancelled: { bg: "rgba(239,68,68,0.12)", color: "#ef4444" },
  no_show: { bg: "rgba(136,153,170,0.12)", color: "#8899aa" },
};

function BookingStatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  const c = BOOKING_STATUS_COLORS[s] ?? { bg: "rgba(136,153,170,0.12)", color: "#8899aa" };
  const label = s.replace(/_/g, " ").replace(/^\w/, (ch) => ch.toUpperCase());
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "20px",
      fontSize: "11px", fontWeight: 600, background: c.bg, color: c.color,
    }}>
      {label || "—"}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: string | null }) {
  const c = (channel ?? "").toLowerCase();
  const map: Record<string, { bg: string; color: string }> = {
    sms: { bg: "rgba(16,185,129,0.15)", color: "#10b981" },
    email: { bg: "rgba(99,102,241,0.15)", color: "#818cf8" },
    voice: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
    phone: { bg: "rgba(245,158,11,0.15)", color: "#f59e0b" },
  };
  const style = map[c] ?? { bg: "rgba(136,153,170,0.12)", color: "#8899aa" };
  return (
    <span style={{
      display: "inline-block", padding: "1px 8px", borderRadius: "4px",
      fontSize: "10px", fontWeight: 700, background: style.bg, color: style.color,
      letterSpacing: "0.04em", flexShrink: 0,
    }}>
      {(channel ?? "—").toUpperCase()}
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
    <button onClick={copy} style={{
      padding: "2px 8px", fontSize: "11px", fontWeight: 500,
      color: copied ? "#10b981" : "#8899aa", background: "transparent",
      border: "1px solid #1e2d40", borderRadius: "4px", cursor: "pointer",
    }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

const card: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #1e2d40",
  borderRadius: "10px",
  padding: "16px",
  marginBottom: "14px",
};

const ClientProfile: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const { activeClientId, loadingMe } = useTenant();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    if (loadingMe) return;
    if (!activeClientId || !clientId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: leadData, error: leadErr } = await supabase
          .from("leads")
          .select("id, client_id, name, phone, email, source, service_type, urgency, qualification_status, status, created_at")
          .eq("client_id", activeClientId)
          .eq("id", clientId)
          .single();

        if (cancelled) return;
        if (leadErr) throw new Error(leadErr.message);
        setLead((leadData as LeadRow) ?? null);

        const { data: msgData, error: msgErr } = await supabase
          .from("messages")
          .select("id, lead_id, client_id, channel, direction, content, created_at")
          .eq("client_id", activeClientId)
          .eq("lead_id", clientId)
          .order("created_at", { ascending: true })
          .limit(1000);

        if (cancelled) return;
        if (msgErr) throw new Error(msgErr.message);
        setMessages((msgData as MessageRow[]) ?? []);

        const { data: bookData } = await supabase
          .from("bookings")
          .select("id, lead_id, service_type, start_time, end_time, status, source, created_at")
          .eq("client_id", activeClientId)
          .eq("lead_id", clientId)
          .order("start_time", { ascending: false })
          .limit(50);

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
      .channel(`client-profile-${activeClientId}-${clientId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `client_id=eq.${activeClientId},lead_id=eq.${clientId}`,
      }, (payload) => {
        const msg = payload.new as MessageRow;
        if (msg.client_id !== activeClientId || msg.lead_id !== clientId) return;
        setMessages((prev) => prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]);
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeClientId, clientId, loadingMe]);

  const totalBookings = bookings.length;
  const lifetimeValue = totalBookings * 150;
  const isArchived = (lead?.status ?? "").toLowerCase() === "archived";

  const title = useMemo(() => (lead?.name ?? "").trim() || "Client Profile", [lead]);

  const handleArchive = async () => {
    if (!clientId || !activeClientId) return;
    setArchiving(true);
    const { error: updateErr } = await supabase
      .from("leads")
      .update({ status: "archived" })
      .eq("id", clientId)
      .eq("client_id", activeClientId);
    setArchiving(false);
    if (updateErr) {
      setActionFeedback(`Error: ${updateErr.message}`);
    } else {
      setLead((prev) => prev ? { ...prev, status: "archived" } : prev);
      setActionFeedback("Client archived.");
    }
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleRestore = async () => {
    if (!clientId || !activeClientId) return;
    setArchiving(true);
    const { error: updateErr } = await supabase
      .from("leads")
      .update({ status: "converted" })
      .eq("id", clientId)
      .eq("client_id", activeClientId);
    setArchiving(false);
    if (updateErr) {
      setActionFeedback(`Error: ${updateErr.message}`);
    } else {
      setLead((prev) => prev ? { ...prev, status: "converted" } : prev);
      setActionFeedback("Client restored.");
    }
    setTimeout(() => setActionFeedback(null), 3000);
  };

  const handleAction = (label: string) => {
    setActionFeedback(label);
    setTimeout(() => setActionFeedback(null), 2000);
  };

  return (
    <div style={{ padding: "24px" }}>
      {/* Back */}
      <div style={{ marginBottom: "20px" }}>
        <Link to="/clients" style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          fontSize: "13px", color: "#8899aa", textDecoration: "none",
          padding: "6px 12px", borderRadius: "6px",
          border: "1px solid #1e2d40", background: "#111827",
        }}>
          ← Clients
        </Link>
      </div>

      {loading && <div style={{ fontSize: "12px", color: "#8899aa", marginBottom: "12px" }}>Loading…</div>}
      {error && <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "12px", whiteSpace: "pre-wrap" }}>{error}</div>}

      {lead && (
        <div style={{ display: "grid", gridTemplateColumns: "65fr 35fr", gap: "20px", alignItems: "start" }}>

          {/* ── LEFT COLUMN ─────────────────────────────────────── */}
          <div>
            {/* Header card */}
            <div style={card}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ flex: 1 }}>
                  <h1 style={{ fontSize: "22px", fontWeight: 700, color: "#f0f4f8", margin: "0 0 6px 0" }}>
                    {title}
                  </h1>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "12px" }}>
                    <span style={{
                      display: "inline-block", padding: "3px 12px", borderRadius: "20px",
                      fontSize: "12px", fontWeight: 600,
                      background: isArchived ? "rgba(136,153,170,0.12)" : "rgba(16,185,129,0.15)",
                      color: isArchived ? "#8899aa" : "#10b981",
                    }}>
                      {isArchived ? "Archived" : "Active"}
                    </span>
                    {lead.source && (
                      <span style={{ fontSize: "12px", color: "#8899aa" }}>
                        via {lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}
                      </span>
                    )}
                  </div>

                  {/* Lifetime value */}
                  <div style={{ marginBottom: "14px" }}>
                    <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>
                      Lifetime Value
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: "#0ea5e9", lineHeight: 1 }}>
                      {lifetimeValue > 0 ? `$${lifetimeValue.toLocaleString()}` : "—"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#4a5a6b", marginTop: "3px" }}>
                      {totalBookings} booking{totalBookings !== 1 ? "s" : ""}
                    </div>
                  </div>

                  {/* Contact summary */}
                  <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
                    {[
                      ["Phone", lead.phone],
                      ["Email", lead.email],
                      ["Service", lead.service_type],
                      ["Member since", fmtDate(lead.created_at)],
                    ].map(([label, val]) => (
                      <div key={label as string}>
                        <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "2px" }}>{label}</div>
                        <div style={{ fontSize: "13px", color: "#8899aa", fontFamily: label === "Phone" || label === "Email" ? "monospace" : "inherit" }}>
                          {val || "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <button style={{
                  padding: "7px 16px", fontSize: "13px", fontWeight: 500,
                  color: "#f0f4f8", background: "transparent",
                  border: "1px solid #1e2d40", borderRadius: "7px",
                  cursor: "pointer", flexShrink: 0,
                }}>
                  Edit
                </button>
              </div>
            </div>

            {/* Booking History */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>
                Booking History
              </h3>
              {bookings.length === 0 ? (
                <div style={{ fontSize: "13px", color: "#4a5a6b" }}>No bookings yet.</div>
              ) : (
                <div style={{ border: "1px solid #1e2d40", borderRadius: "8px", overflow: "hidden" }}>
                  {/* Table header */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "140px 1fr 90px",
                    padding: "8px 12px", background: "#1a2235",
                    borderBottom: "1px solid #1e2d40",
                    fontSize: "10px", fontWeight: 600, color: "#8899aa",
                    textTransform: "uppercase", letterSpacing: "0.06em",
                  }}>
                    {["Date", "Service", "Status"].map((h) => <div key={h}>{h}</div>)}
                  </div>
                  {bookings.map((b, idx) => (
                    <div key={b.id} style={{
                      display: "grid", gridTemplateColumns: "140px 1fr 90px",
                      alignItems: "center", padding: "10px 12px",
                      background: "#111827",
                      borderBottom: idx < bookings.length - 1 ? "1px solid #1e2d40" : "none",
                    }}>
                      <div style={{ fontSize: "13px", color: "#8899aa" }}>{fmtDate(b.start_time)}</div>
                      <div style={{ fontSize: "13px", color: "#f0f4f8" }}>{b.service_type ?? "Appointment"}</div>
                      <div><BookingStatusBadge status={b.status} /></div>
                    </div>
                  ))}
                </div>
              )}
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
                        padding: "10px 12px", borderRadius: "8px",
                        background: isOutbound ? "rgba(14,165,233,0.07)" : "#0a0e1a",
                        border: `1px solid ${isOutbound ? "rgba(14,165,233,0.2)" : "#1e2d40"}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                          <ChannelBadge channel={m.channel} />
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
          </div>

          {/* ── RIGHT COLUMN ─────────────────────────────────────── */}
          <div>
            {/* Client Details */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>Client Details</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>Full Name</div>
                  <div style={{ fontSize: "14px", color: "#f0f4f8", fontWeight: 500 }}>{title}</div>
                </div>
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
                <div>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>Service Type</div>
                  <div style={{ fontSize: "13px", color: "#8899aa" }}>{lead.service_type ?? "—"}</div>
                </div>
                <div>
                  <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#4a5a6b", marginBottom: "4px" }}>Source</div>
                  <div style={{ fontSize: "13px", color: "#8899aa" }}>{lead.source ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={card}>
              <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#f0f4f8", margin: "0 0 12px 0" }}>Actions</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <button
                  onClick={() => handleAction("Opening message composer…")}
                  style={{
                    padding: "10px 16px", fontSize: "13px", fontWeight: 600,
                    color: "#fff", background: "#0ea5e9", border: "none",
                    borderRadius: "7px", cursor: "pointer", textAlign: "left",
                  }}
                >
                  Send Message
                </button>
                <button
                  onClick={() => handleAction("Opening booking form…")}
                  style={{
                    padding: "10px 16px", fontSize: "13px", fontWeight: 500,
                    color: "#f0f4f8", background: "transparent",
                    border: "1px solid #1e2d40", borderRadius: "7px",
                    cursor: "pointer", textAlign: "left",
                  }}
                >
                  New Booking
                </button>
                {isArchived ? (
                  <button
                    onClick={handleRestore}
                    disabled={archiving}
                    style={{
                      padding: "10px 16px", fontSize: "13px", fontWeight: 500,
                      color: "#10b981", background: "rgba(16,185,129,0.08)",
                      border: "1px solid rgba(16,185,129,0.25)", borderRadius: "7px",
                      cursor: archiving ? "not-allowed" : "pointer", textAlign: "left",
                      opacity: archiving ? 0.6 : 1,
                    }}
                  >
                    {archiving ? "Restoring…" : "Restore Client"}
                  </button>
                ) : (
                  <button
                    onClick={handleArchive}
                    disabled={archiving}
                    style={{
                      padding: "10px 16px", fontSize: "13px", fontWeight: 500,
                      color: "#ef4444", background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px",
                      cursor: archiving ? "not-allowed" : "pointer", textAlign: "left",
                      opacity: archiving ? 0.6 : 1,
                    }}
                  >
                    {archiving ? "Archiving…" : "Archive Client"}
                  </button>
                )}
                {actionFeedback && (
                  <div style={{ fontSize: "12px", color: "#10b981", paddingTop: "2px" }}>
                    {actionFeedback}
                  </div>
                )}
              </div>
            </div>

            {/* Also linked as Lead */}
            <div style={{ ...card, background: "rgba(14,165,233,0.05)", border: "1px solid rgba(14,165,233,0.15)" }}>
              <div style={{ fontSize: "12px", color: "#8899aa", marginBottom: "8px" }}>Also exists as a Lead record</div>
              <Link
                to={`/leads/${clientId}`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "6px",
                  fontSize: "13px", color: "#0ea5e9", fontWeight: 500,
                }}
              >
                View Lead Profile →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientProfile;
