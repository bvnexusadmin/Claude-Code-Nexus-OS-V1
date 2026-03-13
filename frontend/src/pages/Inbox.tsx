import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
import { useTenant } from "../lib/tenant";

type Message = {
  id: string;
  lead_id: string;
  client_id: string;
  channel: string;
  content: string;
  created_at: string;
};

type ConversationPreview = {
  lead_id: string;
  last_message: string;
  created_at: string;
  channel: string;
};

const Inbox: React.FC = () => {
  const { activeClientId, loadingMe } = useTenant();

  const [conversations, setConversations] = useState<
    Record<string, ConversationPreview>
  >({});

  useEffect(() => {
    if (loadingMe) return;

    // If no tenant, clear and do nothing
    if (!activeClientId) {
      setConversations({});
      return;
    }

    let channelSub: any;
    let cancelled = false;

    const loadInitial = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, lead_id, client_id, channel, content, created_at")
        .eq("client_id", activeClientId)
        .not("lead_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;
      if (error || !data) return;

      const map: Record<string, ConversationPreview> = {};

      for (const msg of data) {
        if (!msg.lead_id) continue;
        if (!map[msg.lead_id]) {
          map[msg.lead_id] = {
            lead_id: msg.lead_id,
            last_message: msg.content,
            created_at: msg.created_at,
            channel: msg.channel,
          };
        }
      }

      setConversations(map);
    };

    loadInitial();

    channelSub = supabase
      .channel(`inbox-realtime-${activeClientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `client_id=eq.${activeClientId}`,
        },
        (payload) => {
          const msg = payload.new as Message;

          if (!msg.lead_id) return;
          if (msg.client_id !== activeClientId) return;

          setConversations((prev) => ({
            ...prev,
            [msg.lead_id]: {
              lead_id: msg.lead_id,
              last_message: msg.content,
              created_at: msg.created_at,
              channel: msg.channel,
            },
          }));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channelSub) supabase.removeChannel(channelSub);
    };
  }, [activeClientId, loadingMe]);

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ color: "#f0f4f8", marginBottom: "4px" }}>Inbox</h2>
      <p style={{ color: "#8899aa", fontSize: "13px", marginBottom: "20px" }}>Unified conversations (SMS · Email · Voice).</p>

      {!activeClientId ? (
        <div style={{ fontSize: "12px", color: "#4a5a6b" }}>
          No active tenant selected.
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {Object.values(conversations)
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
            )
            .map((c) => (
              <li
                key={c.lead_id}
                style={{
                  border: "1px solid #1e2d40",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  marginBottom: "8px",
                  background: "#111827",
                }}
              >
                <Link to={`/inbox/${c.lead_id}`} style={{ textDecoration: "none" }}>
                  <div style={{ fontWeight: 600, color: "#f0f4f8", fontSize: "14px", marginBottom: "4px" }}>
                    Lead {c.lead_id.slice(0, 8)} ({c.channel})
                  </div>
                  <div style={{ fontSize: "12px", color: "#8899aa" }}>{c.last_message}</div>
                </Link>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default Inbox;
