import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Message = {
  id: string;
  direction: "inbound" | "outbound" | string;
  content: string;
};

const Conversation: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [leadEmail, setLeadEmail] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [replyChannel, setReplyChannel] = useState<"sms" | "email">("sms");

  /* =====================
     LOAD + REALTIME
  ===================== */
  useEffect(() => {
    if (!leadId) return;

    const loadMessagesAndLead = async () => {
      // Load messages
      const { data: msgData } = await supabase
        .from("messages")
        .select("id, direction, content")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: true });

      setMessages(msgData ?? []);

      // Load lead email
      const { data: lead } = await supabase
        .from("leads")
        .select("email")
        .eq("id", leadId)
        .single();

      setLeadEmail(lead?.email ?? null);
    };

    loadMessagesAndLead();

    const channel = supabase
      .channel(`conversation-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `lead_id=eq.${leadId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  /* =====================
     SEND MESSAGE
  ===================== */
  const sendMessage = async () => {
    if (!message.trim() || !leadId) return;

    if (replyChannel === "email" && !leadEmail) {
      alert("This lead has no email address.");
      return;
    }

    setSending(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Not authenticated");
      }

      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      };

      let res: Response;

      if (replyChannel === "sms") {
        res = await fetch("http://localhost:4000/internal/send-message", {
          method: "POST",
          headers,
          body: JSON.stringify({
            lead_id: leadId,
            content: message,
          }),
        });
      } else {
        res = await fetch("http://localhost:4000/internal/email/send", {
          method: "POST",
          headers,
          body: JSON.stringify({
            lead_id: leadId,
            to: leadEmail,
            subject: subject || "Re:",
            content: message,
          }),
        });
      }

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Send failed");
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
      />

      <br />

      <button onClick={sendMessage} disabled={sending}>
        {sending ? "Sending..." : "Send"}
      </button>
    </div>
  );
};

export default Conversation;
