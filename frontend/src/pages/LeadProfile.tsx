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

function fmt(dt: string | null | undefined) {
  if (!dt) return "";
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}

const LeadProfile: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();
  const { activeClientId, loadingMe } = useTenant();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lead, setLead] = useState<LeadRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);

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
          .select(
            "id, client_id, name, phone, email, source, service_type, urgency, qualification_status, status, created_at"
          )
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
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // realtime for this lead + tenant
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

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "16px" }}>
        <div>
          <h2 style={{ marginBottom: "4px", color: "#f0f4f8" }}>{title}</h2>
          <div style={{ fontSize: "12px", color: "#8899aa" }}>
            Lead ID: {leadId}
            {activeClientId ? ` · Tenant: ${activeClientId.slice(0, 8)}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link to="/leads" style={{ color: "#0ea5e9", fontSize: "13px" }}>← Back to Leads</Link>
          <Link to={`/inbox/${leadId}`} style={{ color: "#0ea5e9", fontSize: "13px" }}>Open Conversation →</Link>
        </div>
      </div>

      {loading && <div style={{ fontSize: "12px", color: "#8899aa" }}>Loading…</div>}
      {error && (
        <div style={{ fontSize: "12px", color: "#ef4444", whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}

      {lead && (
        <div
          style={{
            border: "1px solid #1e2d40",
            borderRadius: "8px",
            padding: "16px",
            marginTop: "12px",
            background: "#111827",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "18px" }}>
            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{(lead.name ?? "").trim() || "Unnamed Lead"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Phone</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.phone ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.email ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Source</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.source ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Service</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.service_type ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Urgency</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.urgency ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Qualification</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.qualification_status ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{lead.status ?? "—"}</div>
            </div>

            <div>
              <div style={{ fontSize: "11px", color: "#8899aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>Created</div>
              <div style={{ fontWeight: 600, color: "#f0f4f8", marginTop: "2px" }}>{fmt(lead.created_at)}</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: "16px" }}>
        <h3 style={{ marginBottom: "8px", color: "#f0f4f8" }}>Timeline</h3>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {messages.map((m) => (
            <li
              key={m.id}
              style={{
                border: "1px solid #1e2d40",
                borderRadius: "8px",
                padding: "12px",
                marginBottom: "8px",
                background: "#111827",
              }}
            >
              <div style={{ fontSize: "12px", color: "#8899aa" }}>
                {fmt(m.created_at)} · {m.channel ?? "—"} · {m.direction ?? "—"}
              </div>
              <div style={{ marginTop: "4px", color: "#f0f4f8" }}>{m.content ?? ""}</div>
            </li>
          ))}
        </ul>

        {messages.length === 0 && (
          <div style={{ fontSize: "12px", color: "#4a5a6b" }}>No messages yet.</div>
        )}
      </div>
    </div>
  );
};

export default LeadProfile;
