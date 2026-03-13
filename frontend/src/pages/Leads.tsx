import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useTenant } from "../lib/tenant";

type LeadRow = {
  id: string;
  client_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null; // sms/email/call/etc
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

const Leads: React.FC = () => {
  const { activeClientId, loadingMe } = useTenant();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

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
        // Leads (MATCHES YOUR TABLE COLUMNS — NO tags)
        const { data: leadData, error: leadErr } = await supabase
          .from("leads")
          .select(
            "id, client_id, name, phone, email, source, service_type, urgency, qualification_status, status, created_at"
          )
          .eq("client_id", activeClientId)
          .order("created_at", { ascending: false })
          .limit(500);

        if (cancelled) return;
        if (leadErr) throw new Error(leadErr.message);
        setLeads((leadData as LeadRow[]) ?? []);

        // Recent messages for last preview
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

    return () => {
      cancelled = true;
    };
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
        if (status !== "all" && x.status !== status) return false;
        if (!qq) return true;
        const hay = [
          x.name,
          x.phone ?? "",
          x.email ?? "",
          x.service_type ?? "",
          x.urgency ?? "",
          x.qualification_status ?? "",
          x.source ?? "",
          x.last_message_preview ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(qq);
      })
      .sort((a, b) => {
        const at = a.last_message_at ?? a.created_at ?? "";
        const bt = b.last_message_at ?? b.created_at ?? "";
        return bt.localeCompare(at);
      });
  }, [leads, lastByLead, q, status]);

  return (
    <div>
      <h2>Leads</h2>
      <p>All captured leads across channels.</p>

      {!activeClientId ? (
        <div style={{ fontSize: "12px", opacity: 0.8 }}>No active tenant selected.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, phone, email, service, urgency, message…"
              style={{ flex: 1, padding: "8px" }}
            />

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ padding: "8px" }}
            >
              <option value="all">All</option>
              <option value="new">New</option>
              <option value="open">Open</option>
              <option value="qualified">Qualified</option>
              <option value="booked">Booked</option>
              <option value="closed">Closed</option>
            </select>

            <button
              onClick={() => window.location.reload()}
              style={{ padding: "8px" }}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {loading && <div style={{ fontSize: "12px" }}>Loading…</div>}
          {error && (
            <div style={{ fontSize: "12px", color: "crimson", whiteSpace: "pre-wrap" }}>
              {error}
            </div>
          )}

          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {items.map((l) => (
              <li
                key={l.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "10px",
                }}
              >
                <Link to={`/leads/${l.id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{l.name}</div>
                      <div style={{ fontSize: "12px", opacity: 0.85 }}>
                        {l.phone ?? "No phone"} · {l.email ?? "No email"}
                      </div>

                      <div style={{ fontSize: "12px", opacity: 0.85, marginTop: "4px" }}>
                        <strong>Service:</strong> {l.service_type ?? "—"} ·{" "}
                        <strong>Urgency:</strong> {l.urgency ?? "—"} ·{" "}
                        <strong>Qual:</strong> {l.qualification_status ?? "—"}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700 }}>
                        {l.status.toUpperCase()}
                      </div>
                      <div style={{ fontSize: "12px", opacity: 0.75 }}>
                        {l.last_message_at
                          ? new Date(l.last_message_at).toLocaleString()
                          : l.created_at
                          ? new Date(l.created_at).toLocaleString()
                          : ""}
                      </div>
                      <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "4px" }}>
                        {l.source ? `Source: ${l.source}` : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "12px", opacity: 0.9 }}>
                    <span style={{ fontWeight: 700 }}>
                      {l.last_channel ? l.last_channel.toUpperCase() : "—"}
                    </span>{" "}
                    {l.last_message_preview ? `· ${l.last_message_preview}` : ""}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {items.length === 0 && !loading && (
            <div style={{ fontSize: "12px", opacity: 0.8 }}>No leads found.</div>
          )}
        </>
      )}
    </div>
  );
};

export default Leads;
