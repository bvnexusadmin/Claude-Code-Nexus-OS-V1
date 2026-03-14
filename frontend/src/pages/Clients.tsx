import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

type BookingRow = {
  id: string;
  lead_id: string | null;
  service_type: string | null;
  start_time: string | null;
  status: string | null;
};

type ClientItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  totalBookings: number;
  lastBooking: string | null;
  value: number;
};

function fmtDate(dt: string | null | undefined) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return dt; }
}

function fmtValue(val: number) {
  if (val === 0) return "—";
  return "$" + val.toLocaleString();
}

const COL = "2fr 1.5fr 120px 140px 90px 90px";

const Clients: React.FC = () => {
  const { activeClientId, loadingMe } = useTenant();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    if (loadingMe) return;
    if (!activeClientId) {
      setLeads([]);
      setBookings([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: leadData, error: leadErr } = await supabase
          .from("leads")
          .select("id, client_id, name, phone, email, source, service_type, urgency, qualification_status, status, created_at")
          .eq("client_id", activeClientId)
          .order("created_at", { ascending: false })
          .limit(500);

        if (cancelled) return;
        if (leadErr) throw new Error(leadErr.message);
        setLeads((leadData as LeadRow[]) ?? []);

        const { data: bookData, error: bookErr } = await supabase
          .from("bookings")
          .select("id, lead_id, service_type, start_time, status")
          .eq("client_id", activeClientId)
          .order("start_time", { ascending: false })
          .limit(2000);

        if (cancelled) return;
        if (bookErr) throw new Error(bookErr.message);
        setBookings((bookData as BookingRow[]) ?? []);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [activeClientId, loadingMe]);

  // Build per-lead booking stats
  const bookingsByLead = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      if (!b.lead_id) continue;
      const existing = map.get(b.lead_id) ?? [];
      existing.push(b);
      map.set(b.lead_id, existing);
    }
    return map;
  }, [bookings]);

  const items: ClientItem[] = useMemo(() => {
    const qq = q.trim().toLowerCase();

    return leads
      .filter((l) => {
        const s = (l.status ?? "new").toLowerCase();
        if (tab === "archived") return s === "archived";
        return s !== "archived";
      })
      .map((l) => {
        const lbs = bookingsByLead.get(l.id) ?? [];
        const lastBooking = lbs.length > 0 ? lbs[0].start_time : null;
        // $150 default rate per booking
        const value = lbs.length * 150;
        return {
          id: l.id,
          name: (l.name ?? "").trim() || "Unnamed",
          phone: l.phone ?? null,
          email: l.email ?? null,
          status: (l.status ?? "new").toLowerCase(),
          totalBookings: lbs.length,
          lastBooking,
          value,
        };
      })
      .filter((x) => {
        if (!qq) return true;
        return [x.name, x.phone ?? "", x.email ?? ""].join(" ").toLowerCase().includes(qq);
      })
      .sort((a, b) => {
        // Sort by most recent booking, then by name
        const at = a.lastBooking ?? "";
        const bt = b.lastBooking ?? "";
        if (bt !== at) return bt.localeCompare(at);
        return a.name.localeCompare(b.name);
      });
  }, [leads, bookingsByLead, q, tab]);

  const tabStyle = (t: "active" | "archived") => ({
    padding: "8px 4px",
    marginRight: "20px",
    fontSize: "14px",
    fontWeight: 500 as const,
    background: "transparent",
    border: "none",
    borderBottom: tab === t ? "2px solid #0ea5e9" : "2px solid transparent",
    color: tab === t ? "#0ea5e9" : "#8899aa",
    cursor: "pointer",
  });

  return (
    <div style={{ padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px" }}>
        <h2 style={{ fontSize: "22px", fontWeight: 600, color: "#f0f4f8", margin: 0 }}>Clients</h2>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
            style={{
              width: "220px", padding: "8px 12px", fontSize: "13px",
              color: "#f0f4f8", background: "#1a2235",
              border: "1px solid #1e2d40", borderRadius: "7px", outline: "none",
            }}
          />
          <button style={{
            padding: "8px 16px", fontSize: "13px", fontWeight: 600,
            color: "#fff", background: "#0ea5e9", border: "none",
            borderRadius: "7px", cursor: "pointer",
          }}>
            + Add Client
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e2d40", marginBottom: "20px" }}>
        <button style={tabStyle("active")} onClick={() => setTab("active")}>Active</button>
        <button style={tabStyle("archived")} onClick={() => setTab("archived")}>Archived</button>
      </div>

      {!activeClientId ? (
        <div style={{ fontSize: "12px", color: "#4a5a6b" }}>No active tenant selected.</div>
      ) : (
        <>
          {loading && <div style={{ fontSize: "12px", color: "#8899aa", marginBottom: "12px" }}>Loading…</div>}
          {error && <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "12px", whiteSpace: "pre-wrap" }}>{error}</div>}

          <div style={{ border: "1px solid #1e2d40", borderRadius: "8px", overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid", gridTemplateColumns: COL,
              padding: "10px 16px", background: "#1a2235",
              borderBottom: "1px solid #1e2d40", fontSize: "11px",
              fontWeight: 600, color: "#8899aa", textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}>
              {["Name", "Contact", "Total Bookings", "Last Booking", "Status", "Value"].map((h) => (
                <div key={h}>{h}</div>
              ))}
            </div>

            {/* Rows */}
            {items.map((c, idx) => {
              const isLast = idx === items.length - 1;
              const isArchived = c.status === "archived";
              const statusLabel = isArchived ? "Archived" : "Active";
              const statusColor = isArchived
                ? { bg: "rgba(136,153,170,0.12)", color: "#8899aa" }
                : { bg: "rgba(16,185,129,0.15)", color: "#10b981" };

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/clients/${c.id}`)}
                  onMouseEnter={() => setHoveredRow(c.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    display: "grid", gridTemplateColumns: COL,
                    alignItems: "center", padding: "0 16px",
                    height: "44px", cursor: "pointer",
                    background: hoveredRow === c.id ? "#1a2235" : "#111827",
                    borderBottom: isLast ? "none" : "1px solid #1e2d40",
                  }}
                >
                  <div style={{
                    fontWeight: 600, fontSize: "14px", color: "#f0f4f8",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.name}
                  </div>
                  <div style={{
                    fontFamily: "monospace", fontSize: "13px", color: "#8899aa",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {c.phone ?? c.email ?? "—"}
                  </div>
                  <div style={{ fontSize: "13px", color: "#f0f4f8", fontWeight: 500 }}>
                    {c.totalBookings > 0 ? c.totalBookings : <span style={{ color: "#4a5a6b" }}>0</span>}
                  </div>
                  <div style={{ fontSize: "13px", color: "#8899aa" }}>
                    {fmtDate(c.lastBooking)}
                  </div>
                  <div>
                    <span style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: "20px",
                      fontSize: "11px", fontWeight: 600,
                      background: statusColor.bg, color: statusColor.color,
                    }}>
                      {statusLabel}
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: c.value > 0 ? "#f0f4f8" : "#4a5a6b", fontWeight: c.value > 0 ? 600 : 400 }}>
                    {fmtValue(c.value)}
                  </div>
                </div>
              );
            })}

            {items.length === 0 && !loading && (
              <div style={{ padding: "32px 16px", fontSize: "13px", color: "#4a5a6b", textAlign: "center" }}>
                No {tab} clients found.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Clients;
