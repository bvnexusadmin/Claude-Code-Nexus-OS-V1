import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

type Message = {
  id: string;
  lead_id: string;
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
  const [conversations, setConversations] = useState<
    Record<string, ConversationPreview>
  >({});

  useEffect(() => {
    let channelSub: any;

    const loadInitial = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, lead_id, channel, content, created_at")
        .not("lead_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!data) return;

      const map: Record<string, ConversationPreview> = {};

      for (const msg of data) {
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
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Message;

          if (!msg.lead_id) return;

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
      if (channelSub) supabase.removeChannel(channelSub);
    };
  }, []);

  return (
    <div>
      <h2>Inbox</h2>
      <p>Unified conversations (SMS · Email · Voice).</p>

      <ul>
        {Object.values(conversations)
          .sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime()
          )
          .map((c) => (
            <li key={c.lead_id}>
              <Link to={`/inbox/${c.lead_id}`}>
                <strong>
                  Lead {c.lead_id.slice(0, 8)} ({c.channel})
                </strong>
                <br />
                <span>{c.last_message}</span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
};

export default Inbox;
