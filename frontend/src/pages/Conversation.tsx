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
    <div>
      <h2>Conversation</h2>
      <p>Lead ID: {leadId}</p>
      {activeClientId && (
        <p style={{ fontSize: "12px", opacity: 0.8 }}>
          Tenant: {activeClientId.slice(0, 8)}
        </p>
      )}
      {leadEmail && <p>Email: {leadEmail}</p>}

      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            [{m.direction}] {m.content}
          </li>
        ))}
      </ul>

      {/* CHANNEL SELECTOR */}
      <div style={{ marginBottom: "8px" }}>
        <label style={{ marginRight: "12px" }}>
          <input
            type="radio"
            checked={replyChannel === "sms"}
            onChange={() => setReplyChannel("sms")}
          />
          SMS
        </label>

        <label>
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
          style={{ width: "100%", marginBottom: "6px" }}
        />
      )}

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`Type your ${replyChannel.toUpperCase()} reply...`}
        rows={3}
        style={{ width: "100%" }}
      />

      <br />

      <button onClick={sendMessage} disabled={sending}>
        {sending ? "Sending..." : "Send"}
      </button>
    </div>
  );
};

export default Conversation;
