import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTenant } from "../lib/tenant";
import { apiPost } from "../lib/api";

type Message = {
  id: string;
  lead_id: string;
  client_id: string;
  direction: "inbound" | "outbound" | string;
  content: string;
  created_at?: string;
};

const Conversation: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();
  const { activeClientId, loadingMe } = useTenant();

  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [leadEmail, setLeadEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [replyChannel, setReplyChannel] = useState<"sms" | "email">("sms");

  /* =====================
     LOAD + REALTIME (TENANT-SCOPED)
  ===================== */
  useEffect(() => {
    if (loadingMe) return;
    if (!leadId) return;

    if (!activeClientId) {
      setMessages([]);
      setLeadEmail(null);
      return;
    }

    let cancelled = false;

    const loadMessagesAndLead = async () => {
      const { data: msgData, error: msgErr } = await supabase
        .from("messages")
        .select("id, lead_id, client_id, direction, content, created_at")
        .eq("client_id", activeClientId)
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      if (!cancelled) {
        if (!msgErr) setMessages((msgData as Message[]) ?? []);
      }

      const { data: lead, error: leadErr } = await supabase
        .from("leads")
        .select("email")
        .eq("client_id", activeClientId)
        .eq("id", leadId)
        .single();

      if (!cancelled) {
        if (!leadErr) setLeadEmail(lead?.email ?? null);
        else setLeadEmail(null);
      }
    };

    loadMessagesAndLead();

    const channel = supabase
      .channel(`conversation-${activeClientId}-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${activeClientId},lead_id=eq.${leadId}`,
        },
        (payload) => {
          const msg = payload.new as Message;

          if (!msg.lead_id) return;
          if (msg.lead_id !== leadId) return;
          if (msg.client_id !== activeClientId) return;

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
  }, [leadId, activeClientId, loadingMe]);

  /* =====================
     SEND MESSAGE (apiPost handles JWT + tenant header)
  ===================== */
  const sendMessage = async () => {
    if (!message.trim() || !leadId) return;

    if (!activeClientId) {
      alert("No active tenant selected.");
      return;
    }

    if (replyChannel === "email" && !leadEmail) {
      alert("This lead has no email address.");
      return;
    }

    setSending(true);

    try {
      if (replyChannel === "sms") {
        await apiPost("/internal/send-message", {
          lead_id: leadId,
          content: message,
        });
      } else {
        await apiPost("/internal/email/send", {
          lead_id: leadId,
          to: leadEmail,
          subject: subject || "Re:",
          content: message,
        });
      }

      setMessage("");
      setSubject("");
    } catch (err) {
      console.error("SEND ERROR:", err);
      alert("Send failed — check backend console");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ color: "#f0f4f8", marginBottom: "4px" }}>Conversation</h2>
      <p style={{ fontSize: "12px", color: "#8899aa", marginBottom: "4px" }}>Lead ID: {leadId}</p>
      {activeClientId && (
        <p style={{ fontSize: "12px", color: "#8899aa", marginBottom: "4px" }}>
          Tenant: {activeClientId.slice(0, 8)}
        </p>
      )}
      {leadEmail && <p style={{ fontSize: "12px", color: "#8899aa", marginBottom: "16px" }}>Email: {leadEmail}</p>}

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px 0" }}>
        {messages.map((m) => (
          <li
            key={m.id}
            style={{
              border: "1px solid #1e2d40",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "8px",
              background: "#111827",
              color: "#f0f4f8",
              fontSize: "13px",
            }}
          >
            <span style={{ fontSize: "11px", color: "#8899aa", marginRight: "8px" }}>[{m.direction}]</span>
            {m.content}
          </li>
        ))}
      </ul>

      {/* CHANNEL SELECTOR */}
      <div style={{ marginBottom: "10px", display: "flex", gap: "16px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#8899aa", cursor: "pointer" }}>
          <input
            type="radio"
            checked={replyChannel === "sms"}
            onChange={() => setReplyChannel("sms")}
          />
          SMS
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "#8899aa", cursor: "pointer" }}>
          <input
            type="radio"
            checked={replyChannel === "email"}
            onChange={() => setReplyChannel("email")}
          />
          Email
        </label>
      </div>

      {/* EMAIL SUBJECT */}
      {replyChannel === "email" && (
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          style={{
            width: "100%",
            marginBottom: "8px",
            padding: "9px 12px",
            fontSize: "13px",
            color: "#f0f4f8",
            background: "#111827",
            border: "1px solid #1e2d40",
            borderRadius: "7px",
            outline: "none",
          }}
        />
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Type your ${replyChannel.toUpperCase()} reply...`}
        rows={3}
        style={{
          width: "100%",
          padding: "9px 12px",
          fontSize: "13px",
          color: "#f0f4f8",
          background: "#111827",
          border: "1px solid #1e2d40",
          borderRadius: "7px",
          outline: "none",
          resize: "vertical",
        }}
      />

      <br />

      <button
        onClick={sendMessage}
        disabled={sending}
        style={{
          marginTop: "10px",
          padding: "9px 20px",
          fontSize: "13px",
          fontWeight: 600,
          color: "#0a0e1a",
          background: sending ? "rgba(14,165,233,0.5)" : "#0ea5e9",
          border: "none",
          borderRadius: "7px",
          cursor: sending ? "not-allowed" : "pointer",
          transition: "background 0.15s",
        }}
      >
        {sending ? "Sending..." : "Send"}
      </button>
    </div>
  );
};

export default Conversation;
