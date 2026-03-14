import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { apiPost } from "../lib/api";
import { useTenant } from "../lib/tenant";

// ─── Types ───────────────────────────────────────────────────────────────────

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
};

type MessageRow = {
  id: string;
  lead_id: string;
  client_id: string;
  channel: string | null;
  direction: string | null;
  content: string | null;
  sender_type: string | null;
  created_at: string;
};

type ConvPreview = {
  lead_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  lastMsg: string;
  lastAt: string;
  lastChannel: string;
  unreadCount: number;
};

// ─── Inline SVG icons ────────────────────────────────────────────────────────

const SmsIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const EmailIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);

const SparkleIcon = ({ size = 14, color = "currentColor" }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    <path d="M5.5 16l.75 2.25 2.25.75-2.25.75L5.5 22l-.75-2.25L2.5 19l2.25-.75z" />
    <path d="M18.5 3l.75 2.25 2.25.75-2.25.75L18.5 9l-.75-2.25L15.5 6l2.25-.75z" />
  </svg>
);

// ─── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return "";
  const diff = Date.now() - new Date(dt).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return dt; }
}

function isClient(status: string | null): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "converted" || s === "booked";
}

function channelIcon(ch: string | null, size = 13) {
  const c = (ch ?? "").toLowerCase();
  if (c === "email") return <EmailIcon size={size} color="#818cf8" />;
  return <SmsIcon size={size} color="#10b981" />;
}

// ─── Component ────────────────────────────────────────────────────────────────

const Communication: React.FC = () => {
  const { activeClientId, loadingMe } = useTenant();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [previewMessages, setPreviewMessages] = useState<MessageRow[]>([]);
  const [convoMessages, setConvoMessages] = useState<MessageRow[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [msgInput, setMsgInput] = useState("");
  const [subject, setSubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  // Track when each conversation was last viewed (for unread counts)
  const [viewedAt, setViewedAt] = useState<Map<string, number>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const convoSubRef = useRef<any>(null);

  // ── Load leads + preview messages, realtime for inbox ──────────────────────
  useEffect(() => {
    if (loadingMe) return;
    if (!activeClientId) {
      setLeads([]);
      setPreviewMessages([]);
      return;
    }

    let cancelled = false;

    const loadAll = async () => {
      const [leadsRes, msgsRes] = await Promise.all([
        supabase
          .from("leads")
          .select("id, name, phone, email, status")
          .eq("client_id", activeClientId)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("messages")
          .select("id, lead_id, client_id, channel, direction, content, sender_type, created_at")
          .eq("client_id", activeClientId)
          .not("lead_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (cancelled) return;
      if (!leadsRes.error) setLeads((leadsRes.data as LeadRow[]) ?? []);
      if (!msgsRes.error) setPreviewMessages((msgsRes.data as MessageRow[]) ?? []);
    };

    loadAll();

    // Global inbox realtime — updates conversation list
    const inboxSub = supabase
      .channel(`comm-inbox-${activeClientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${activeClientId}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow;
          if (msg.client_id !== activeClientId) return;
          setPreviewMessages((prev) =>
            prev.find((m) => m.id === msg.id) ? prev : [msg, ...prev]
          );
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(inboxSub);
    };
  }, [activeClientId, loadingMe]);

  // ── Load conversation + realtime when selected lead changes ────────────────
  useEffect(() => {
    if (!selectedLeadId || !activeClientId) {
      setConvoMessages([]);
      return;
    }

    // Remove previous conversation subscription
    if (convoSubRef.current) {
      supabase.removeChannel(convoSubRef.current);
      convoSubRef.current = null;
    }

    let cancelled = false;

    const loadConvo = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, lead_id, client_id, channel, direction, content, sender_type, created_at")
        .eq("client_id", activeClientId)
        .eq("lead_id", selectedLeadId)
        .order("created_at", { ascending: true })
        .limit(500);

      if (cancelled) return;
      if (!error) setConvoMessages((data as MessageRow[]) ?? []);
    };

    loadConvo();

    // Conversation-specific realtime
    const convoSub = supabase
      .channel(`comm-convo-${activeClientId}-${selectedLeadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${activeClientId},lead_id=eq.${selectedLeadId}`,
        },
        (payload) => {
          const msg = payload.new as MessageRow;
          if (msg.client_id !== activeClientId) return;
          if (msg.lead_id !== selectedLeadId) return;
          setConvoMessages((prev) =>
            prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
        }
      )
      .subscribe();

    convoSubRef.current = convoSub;

    return () => {
      cancelled = true;
      supabase.removeChannel(convoSub);
      convoSubRef.current = null;
    };
  }, [selectedLeadId, activeClientId]);

  // ── Auto-scroll to bottom when messages update ─────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convoMessages]);

  // ── Select a conversation ──────────────────────────────────────────────────
  const selectConversation = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
    setViewedAt((prev) => new Map(prev).set(leadId, Date.now()));
    setSendError(null);
    setSuggestError(null);
  }, []);

  // ── Derived: conversation preview list ────────────────────────────────────
  const convPreviews: ConvPreview[] = useMemo(() => {
    const leadMap = new Map(leads.map((l) => [l.id, l]));
    const lastByLead = new Map<string, MessageRow>();
    const inboundByLead = new Map<string, MessageRow[]>();

    for (const m of previewMessages) {
      if (!m.lead_id) continue;
      if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);
      if (m.direction === "inbound") {
        const arr = inboundByLead.get(m.lead_id) ?? [];
        arr.push(m);
        inboundByLead.set(m.lead_id, arr);
      }
    }

    const qq = q.trim().toLowerCase();

    return Array.from(lastByLead.entries())
      .map(([lead_id, last]) => {
        const lead = leadMap.get(lead_id);
        const inbounds = inboundByLead.get(lead_id) ?? [];
        const lastViewed = viewedAt.get(lead_id);
        const unreadCount = lastViewed
          ? inbounds.filter((m) => new Date(m.created_at).getTime() > lastViewed).length
          : 0;

        return {
          lead_id,
          name: (lead?.name ?? "").trim() || `Lead ${lead_id.slice(0, 8)}`,
          phone: lead?.phone ?? null,
          email: lead?.email ?? null,
          status: lead?.status ?? null,
          lastMsg: (last.content ?? "").trim(),
          lastAt: last.created_at,
          lastChannel: last.channel ?? "sms",
          unreadCount,
        };
      })
      .filter((c) => {
        if (!qq) return true;
        return [c.name, c.phone ?? "", c.email ?? ""].join(" ").toLowerCase().includes(qq);
      })
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [leads, previewMessages, q, viewedAt]);

  // ── Selected lead ─────────────────────────────────────────────────────────
  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId]
  );
  const selectedPreview = useMemo(
    () => convPreviews.find((c) => c.lead_id === selectedLeadId) ?? null,
    [convPreviews, selectedLeadId]
  );

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!msgInput.trim() || !selectedLeadId || sending) return;
    if (!activeClientId) return;

    if (channel === "email" && !selectedLead?.email) {
      setSendError("This contact has no email address.");
      return;
    }

    setSending(true);
    setSendError(null);

    // Optimistic: add message immediately so it appears on the right
    const optimisticMsg: MessageRow = {
      id: `opt-${Date.now()}`,
      lead_id: selectedLeadId,
      client_id: activeClientId,
      channel,
      direction: "outbound",
      content: msgInput,
      sender_type: "human",
      created_at: new Date().toISOString(),
    };
    setConvoMessages((prev) => [...prev, optimisticMsg]);

    const draft = msgInput;
    const subjectDraft = subject;
    setMsgInput("");
    setSubject("");

    try {
      if (channel === "sms") {
        await apiPost("/internal/send-message", {
          lead_id: selectedLeadId,
          content: draft,
        });
      } else {
        await apiPost("/internal/email/send", {
          lead_id: selectedLeadId,
          to: selectedLead?.email,
          subject: subjectDraft || "Message from Nexus",
          content: draft,
        });
      }
    } catch (err: any) {
      setSendError(err?.message ?? "Send failed");
      // Remove optimistic message on error
      setConvoMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setMsgInput(draft);
      setSubject(subjectDraft);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── AI Suggest Reply ──────────────────────────────────────────────────────
  const aiSuggest = async () => {
    if (!selectedLeadId || suggestLoading) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const res = await apiPost<{ ok: true; reply: string }>(
        "/internal/ai-suggest-reply",
        { lead_id: selectedLeadId }
      );
      setMsgInput(res.reply ?? "");
    } catch (err: any) {
      setSuggestError(err?.message ?? "AI suggest failed");
    } finally {
      setSuggestLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── LEFT PANEL: Conversation List ───────────────────────────────── */}
      <div style={{
        width: "320px",
        flexShrink: 0,
        borderRight: "1px solid #1e2d40",
        background: "#111827",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Search */}
        <div style={{ padding: "12px 12px 8px 12px", flexShrink: 0 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conversations..."
            style={{
              width: "100%", padding: "8px 12px", fontSize: "13px",
              color: "#f0f4f8", background: "#1a2235",
              border: "1px solid #1e2d40", borderRadius: "7px",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Contact list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {convPreviews.length === 0 && (
            <div style={{ padding: "24px 16px", fontSize: "13px", color: "#4a5a6b", textAlign: "center" }}>
              {loadingMe ? "Loading…" : "No conversations yet."}
            </div>
          )}
          {convPreviews.map((c) => {
            const active = c.lead_id === selectedLeadId;
            const client = isClient(c.status);
            return (
              <div
                key={c.lead_id}
                onClick={() => selectConversation(c.lead_id)}
                style={{
                  padding: "12px 14px",
                  cursor: "pointer",
                  background: active ? "#1a2235" : "transparent",
                  borderLeft: active ? "2px solid #0ea5e9" : "2px solid transparent",
                  borderBottom: "1px solid #1e2d40",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
                    {channelIcon(c.lastChannel)}
                    <span style={{
                      fontWeight: 600, fontSize: "14px", color: "#f0f4f8",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {c.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0, marginLeft: "8px" }}>
                    {c.unreadCount > 0 && (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: "18px", height: "18px", borderRadius: "9px",
                        background: "#0ea5e9", color: "#fff",
                        fontSize: "10px", fontWeight: 700, padding: "0 5px",
                      }}>
                        {c.unreadCount}
                      </span>
                    )}
                    <span style={{ fontSize: "11px", color: "#4a5a6b" }}>{timeAgo(c.lastAt)}</span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{
                    fontSize: "13px", color: "#8899aa",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
                  }}>
                    {c.lastMsg || "No messages"}
                  </span>
                  <span style={{
                    display: "inline-block", padding: "1px 7px", borderRadius: "10px",
                    fontSize: "10px", fontWeight: 600, flexShrink: 0,
                    background: client ? "rgba(16,185,129,0.15)" : "rgba(14,165,233,0.12)",
                    color: client ? "#10b981" : "#0ea5e9",
                  }}>
                    {client ? "Client" : "Lead"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANEL: Conversation ───────────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#0a0e1a",
        overflow: "hidden",
        minWidth: 0,
      }}>
        {selectedLeadId && selectedPreview ? (
          <>
            {/* Conversation header */}
            <div style={{
              flexShrink: 0,
              padding: "14px 24px",
              borderBottom: "1px solid #1e2d40",
              background: "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                {channelIcon(selectedPreview.lastChannel, 16)}
                <span style={{ fontWeight: 700, fontSize: "16px", color: "#f0f4f8" }}>
                  {selectedPreview.name}
                </span>
                <span style={{
                  display: "inline-block", padding: "2px 9px", borderRadius: "10px",
                  fontSize: "11px", fontWeight: 600,
                  background: isClient(selectedPreview.status) ? "rgba(16,185,129,0.15)" : "rgba(14,165,233,0.12)",
                  color: isClient(selectedPreview.status) ? "#10b981" : "#0ea5e9",
                }}>
                  {isClient(selectedPreview.status) ? "Client" : "Lead"}
                </span>
                {selectedLead?.phone && (
                  <span style={{ fontSize: "12px", color: "#4a5a6b", fontFamily: "monospace" }}>
                    {selectedLead.phone}
                  </span>
                )}
              </div>
              <Link
                to={isClient(selectedPreview.status) ? `/clients/${selectedLeadId}` : `/leads/${selectedLeadId}`}
                style={{
                  fontSize: "13px", color: "#0ea5e9", fontWeight: 500,
                  textDecoration: "none", flexShrink: 0,
                }}
              >
                View Profile →
              </Link>
            </div>

            {/* Message thread */}
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}>
              {convoMessages.length === 0 && (
                <div style={{ fontSize: "13px", color: "#4a5a6b", textAlign: "center", marginTop: "40px" }}>
                  No messages yet.
                </div>
              )}
              {convoMessages.map((m) => {
                const isInbound = m.direction === "inbound";
                const isAi = !isInbound && (m.sender_type === "ai" || m.sender_type === "system");
                // isHumanOut = outbound and human-sent (or optimistic)
                const isHumanOut = !isInbound && !isAi;

                if (isInbound) {
                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "65%" }}>
                      <div style={{
                        padding: "12px 16px", borderRadius: "8px",
                        background: "#1a2235",
                        fontSize: "14px", color: "#f0f4f8", lineHeight: 1.5,
                      }}>
                        {m.content ?? ""}
                      </div>
                      <span style={{ fontSize: "11px", color: "#4a5a6b", marginTop: "4px", paddingLeft: "2px" }}>
                        {fmt(m.created_at)}
                      </span>
                    </div>
                  );
                }

                if (isAi) {
                  return (
                    <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "65%" }}>
                      <span style={{ fontSize: "11px", color: "#6366f1", fontWeight: 600, marginBottom: "4px", paddingLeft: "2px" }}>
                        Nexus AI
                      </span>
                      <div style={{
                        padding: "12px 16px", borderRadius: "8px",
                        background: "rgba(99,102,241,0.1)",
                        borderLeft: "3px solid #6366f1",
                        fontSize: "14px", color: "#f0f4f8", lineHeight: 1.5,
                      }}>
                        {m.content ?? ""}
                      </div>
                      <span style={{ fontSize: "11px", color: "#4a5a6b", marginTop: "4px", paddingLeft: "2px" }}>
                        {fmt(m.created_at)}
                      </span>
                    </div>
                  );
                }

                // Human outbound — right aligned
                return (
                  <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "65%", alignSelf: "flex-end" }}>
                    <div style={{
                      padding: "12px 16px", borderRadius: "8px",
                      background: "rgba(14,165,233,0.12)",
                      borderRight: "3px solid #0ea5e9",
                      fontSize: "14px", color: "#f0f4f8", lineHeight: 1.5,
                    }}>
                      {m.content ?? ""}
                    </div>
                    <span style={{ fontSize: "11px", color: "#4a5a6b", marginTop: "4px", paddingRight: "2px" }}>
                      {fmt(m.created_at)}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div style={{
              flexShrink: 0,
              borderTop: "1px solid #1e2d40",
              padding: "14px 24px",
              background: "#111827",
            }}>
              {/* Channel toggles */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                {(["sms", "email"] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setChannel(ch)}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "4px 12px", borderRadius: "20px",
                      fontSize: "12px", fontWeight: 600, border: "none",
                      cursor: "pointer",
                      background: channel === ch ? (ch === "sms" ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)") : "#1a2235",
                      color: channel === ch ? (ch === "sms" ? "#10b981" : "#818cf8") : "#8899aa",
                    }}
                  >
                    {ch === "sms" ? <SmsIcon size={12} /> : <EmailIcon size={12} />}
                    {ch.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Email subject */}
              {channel === "email" && (
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject…"
                  style={{
                    width: "100%", marginBottom: "8px",
                    padding: "8px 12px", fontSize: "13px",
                    color: "#f0f4f8", background: "#0a0e1a",
                    border: "1px solid #1e2d40", borderRadius: "7px",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              )}

              {/* Textarea + buttons */}
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}>
                <textarea
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Type a ${channel === "sms" ? "SMS" : "email"} message… (Ctrl+Enter to send)`}
                  rows={2}
                  style={{
                    flex: 1, padding: "10px 12px", fontSize: "13px",
                    color: "#f0f4f8", background: "#0a0e1a",
                    border: "1px solid #1e2d40", borderRadius: "7px",
                    outline: "none", resize: "none",
                    fontFamily: "inherit", lineHeight: 1.5,
                    maxHeight: "120px", overflowY: "auto",
                    boxSizing: "border-box",
                  }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flexShrink: 0 }}>
                  <button
                    onClick={aiSuggest}
                    disabled={suggestLoading}
                    title="AI Suggest Reply"
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "8px 12px", fontSize: "12px", fontWeight: 600,
                      color: suggestLoading ? "#4a5a6b" : "#818cf8",
                      background: "rgba(99,102,241,0.1)",
                      border: "1px solid rgba(99,102,241,0.25)",
                      borderRadius: "7px", cursor: suggestLoading ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <SparkleIcon size={12} color={suggestLoading ? "#4a5a6b" : "#818cf8"} />
                    {suggestLoading ? "Thinking…" : "AI Suggest"}
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={sending || !msgInput.trim()}
                    style={{
                      padding: "8px 16px", fontSize: "13px", fontWeight: 600,
                      color: sending || !msgInput.trim() ? "#4a5a6b" : "#fff",
                      background: sending || !msgInput.trim() ? "#1a2235" : "#0ea5e9",
                      border: "none", borderRadius: "7px",
                      cursor: sending || !msgInput.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </div>

              {/* Errors */}
              {sendError && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#ef4444" }}>
                  {sendError}
                </div>
              )}
              {suggestError && (
                <div style={{ marginTop: "6px", fontSize: "12px", color: "#f59e0b" }}>
                  AI: {suggestError}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Empty state */
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", gap: "12px",
          }}>
            <SmsIcon size={32} color="#1e2d40" />
            <div style={{ fontSize: "15px", color: "#4a5a6b", fontWeight: 500 }}>
              Select a conversation
            </div>
            <div style={{ fontSize: "13px", color: "#4a5a6b" }}>
              Choose a contact from the list to start messaging.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Communication;
