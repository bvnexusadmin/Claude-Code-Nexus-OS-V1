import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import { useTenant } from "../lib/tenant";
import { useToast } from "../lib/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = "business" | "integrations" | "users" | "automation" | "notifications";

type BusinessForm = {
  name: string;
  phone: string;
  business_email: string;
  website: string;
  address: string;
  timezone: string;
  default_service_duration: number;
  services: string;
};

type IntegrationData = {
  google_calendar: { connected: boolean; calendar_id: string };
  twilio: { phone: string; phone_masked: string; connected: boolean };
  openai: { model: string; api_key_masked: string; connected: boolean };
  email: { connected: boolean; provider: string };
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  status: "active" | "pending";
};

type NotifPrefs = {
  ai_outreach_inapp: boolean;
  ai_outreach_daily_email: boolean;
  ai_outreach_instant_alert: boolean;
  new_lead_alert: boolean;
  booking_confirmed: boolean;
  missed_call_alert: boolean;
  daily_summary: boolean;
};

type AutomationRule = {
  rule_type: string;
  enabled: boolean;
  channel: string;
  delay_hours: number;
};

// ─── Static data ──────────────────────────────────────────────────────────────

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const AUTOMATION_RULE_META: Record<
  string,
  { label: string; trigger: string; action: string }
> = {
  followup: {
    label: "Follow-Up (No Response)",
    trigger: "New lead has not responded within the configured delay hours",
    action: "Send automated follow-up message via configured channel",
  },
  reminder: {
    label: "Booking Reminder",
    trigger: "Confirmed appointment is within X hours",
    action: "Send reminder message to lead before their appointment",
  },
  reengagement: {
    label: "Re-engagement (Cold Leads)",
    trigger: "Lead has been stalled for the configured delay hours",
    action: "Send re-engagement outreach to revive cold leads",
  },
  thankyou: {
    label: "Post-Booking Thank You",
    trigger: "Booking status changes to completed",
    action: "Send a thank you message after a completed appointment",
  },
  promo: {
    label: "Discount / Promo Offer",
    trigger: "Lead has been inactive for the configured delay hours",
    action: "Send a promotional offer to inactive leads",
  },
  review: {
    label: "Review / Feedback Request",
    trigger: "X hours after a completed appointment",
    action: "Request a review or feedback from the client",
  },
};

const NOTIF_ITEMS: {
  key: keyof NotifPrefs;
  label: string;
  description: string;
  group: "ai" | "system";
}[] = [
  {
    key: "ai_outreach_inapp",
    label: "In-app notification when AI sends outreach",
    description: "Shows a notification in the dashboard when automation fires",
    group: "ai",
  },
  {
    key: "ai_outreach_daily_email",
    label: "Daily email summary of AI outreach activity",
    description: "Receive a daily digest of all automated outreach sent",
    group: "ai",
  },
  {
    key: "ai_outreach_instant_alert",
    label: "Instant email/SMS alert for each AI outreach",
    description: "Get notified immediately each time automation sends a message",
    group: "ai",
  },
  {
    key: "new_lead_alert",
    label: "New lead alert",
    description: "Notify when a new lead enters the system",
    group: "system",
  },
  {
    key: "booking_confirmed",
    label: "Booking confirmed",
    description: "Notify when a lead books an appointment",
    group: "system",
  },
  {
    key: "missed_call_alert",
    label: "Missed call alert",
    description: "Notify when a voice call comes in and is not answered",
    group: "system",
  },
  {
    key: "daily_summary",
    label: "Daily business summary",
    description: "Receive a morning summary of leads, bookings, and activity",
    group: "system",
  },
];

// ─── Shared components ────────────────────────────────────────────────────────

const Toggle: React.FC<{
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: string;
}> = ({ value, onChange, disabled, color = "#0ea5e9" }) => (
  <div
    onClick={() => !disabled && onChange(!value)}
    style={{
      width: "40px",
      height: "22px",
      borderRadius: "11px",
      background: value ? color : "#1e2d40",
      position: "relative",
      cursor: disabled ? "not-allowed" : "pointer",
      flexShrink: 0,
      transition: "background 0.2s",
      opacity: disabled ? 0.5 : 1,
    }}
  >
    <div
      style={{
        position: "absolute",
        top: "3px",
        left: value ? "21px" : "3px",
        width: "16px",
        height: "16px",
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
      }}
    />
  </div>
);

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, children, hint }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
    <label
      style={{
        fontSize: "12px",
        fontWeight: 600,
        color: "#8899aa",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </label>
    {children}
    {hint && (
      <span style={{ fontSize: "11px", color: "#4a5a6b" }}>{hint}</span>
    )}
  </div>
);

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  fontSize: "13px",
  color: "var(--color-text-primary)",
  background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-bg-border)",
  borderRadius: "7px",
  outline: "none",
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      background: "var(--color-bg-surface)",
      border: "1px solid var(--color-bg-border)",
      borderRadius: "10px",
      padding: "20px",
      ...style,
    }}
  >
    {children}
  </div>
);

const SectionHeader: React.FC<{
  title: string;
  action?: React.ReactNode;
}> = ({ title, action }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "24px",
    }}
  >
    <h2
      style={{
        fontSize: "22px",
        fontWeight: 600,
        color: "var(--color-text-primary)",
        margin: 0,
      }}
    >
      {title}
    </h2>
    {action}
  </div>
);

const StatusBadge: React.FC<{ connected: boolean }> = ({ connected }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      fontSize: "11px",
      fontWeight: 700,
      padding: "3px 10px",
      borderRadius: "999px",
      background: connected
        ? "rgba(16,185,129,0.12)"
        : "rgba(74,90,107,0.2)",
      color: connected ? "#10b981" : "#4a5a6b",
      border: `1px solid ${connected ? "rgba(16,185,129,0.3)" : "rgba(74,90,107,0.3)"}`,
      whiteSpace: "nowrap" as const,
    }}
  >
    <span
      style={{
        width: "5px",
        height: "5px",
        borderRadius: "50%",
        background: connected ? "#10b981" : "#4a5a6b",
        display: "inline-block",
      }}
    />
    {connected ? "Connected" : "Disconnected"}
  </span>
);

function primaryBtn(disabled = false): React.CSSProperties {
  return {
    padding: "9px 20px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "7px",
    border: "none",
    background: disabled ? "#1e2d40" : "var(--color-accent)",
    color: disabled ? "#4a5a6b" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    padding: "9px 20px",
    fontSize: "13px",
    fontWeight: 600,
    borderRadius: "7px",
    border: "1px solid var(--color-bg-border)",
    background: "transparent",
    color: "var(--color-text-secondary)",
    cursor: "pointer",
  };
}

const ErrorBox: React.FC<{ msg: string; migration?: boolean }> = ({
  msg,
  migration,
}) => (
  <div
    style={{
      marginBottom: "16px",
      padding: "10px 14px",
      background: "rgba(239,68,68,0.1)",
      border: "1px solid rgba(239,68,68,0.3)",
      borderRadius: "7px",
      fontSize: "13px",
      color: "var(--color-danger)",
    }}
  >
    {msg}
    {migration && (
      <span
        style={{ display: "block", marginTop: "4px", fontSize: "12px" }}
      >
        Run the SQL migration from{" "}
        <code
          style={{
            background: "rgba(239,68,68,0.15)",
            padding: "1px 5px",
            borderRadius: "3px",
          }}
        >
          backend/src/routes/internal/settings.ts
        </code>{" "}
        in Supabase.
      </span>
    )}
  </div>
);

// ─── Business Info Section ────────────────────────────────────────────────────

const BusinessInfoSection: React.FC = () => {
  const { showToast } = useToast();
  const [form, setForm] = useState<BusinessForm>({
    name: "",
    phone: "",
    business_email: "",
    website: "",
    address: "",
    timezone: "America/New_York",
    default_service_duration: 60,
    services: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean; business: BusinessForm }>(
      "/internal/settings/business"
    )
      .then((d) => setForm(d.business))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof BusinessForm>(k: K, v: BusinessForm[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await apiPost("/internal/settings/business", form);
      setSuccess(true);
      showToast("Business info saved", "success");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
      showToast(err?.message ?? "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "52px", borderRadius: "7px" }} />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <SectionHeader title="Business Info" />
      {error && (
        <ErrorBox
          msg={error}
          migration={error.includes("column") || error.includes("does not exist")}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <Field label="Company Name">
            <input
              style={inputStyle}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Brautigam Ventures"
            />
          </Field>
          <Field label="Business Phone">
            <input
              style={inputStyle}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+1 720-555-0100"
            />
          </Field>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <Field label="Business Email">
            <input
              style={inputStyle}
              type="email"
              value={form.business_email}
              onChange={(e) => set("business_email", e.target.value)}
              placeholder="hello@example.com"
            />
          </Field>
          <Field label="Website URL">
            <input
              style={inputStyle}
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              placeholder="https://example.com"
            />
          </Field>
        </div>

        <Field label="Business Address">
          <input
            style={inputStyle}
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="123 Main St, Denver, CO 80203"
          />
        </Field>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "16px",
          }}
        >
          <Field label="Timezone">
            <select
              style={inputStyle}
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default Service Duration (min)">
            <input
              style={inputStyle}
              type="number"
              min={15}
              max={480}
              step={15}
              value={form.default_service_duration}
              onChange={(e) =>
                set(
                  "default_service_duration",
                  parseInt(e.target.value) || 60
                )
              }
            />
          </Field>
        </div>

        <Field
          label="Services Offered"
          hint="One service per line — used in booking flows and AI context."
        >
          <textarea
            style={{
              ...inputStyle,
              resize: "vertical",
              minHeight: "100px",
            }}
            value={form.services}
            onChange={(e) => set("services", e.target.value)}
            placeholder={"HVAC Installation\nFurnace Repair\nAC Tune-Up"}
            rows={4}
          />
        </Field>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "12px",
          marginTop: "28px",
          paddingTop: "20px",
          borderTop: "1px solid var(--color-bg-border)",
        }}
      >
        {success && (
          <span
            style={{ fontSize: "13px", color: "var(--color-success)" }}
          >
            ✓ Saved successfully
          </span>
        )}
        <button
          type="submit"
          style={primaryBtn(saving)}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </form>
  );
};

// ─── Integrations Section ─────────────────────────────────────────────────────

const IntegrationsSection: React.FC = () => {
  const { activeClientId } = useTenant();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [twilioPhone, setTwilioPhone] = useState("");
  const [openaiModel, setOpenaiModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [savedProvider, setSavedProvider] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    apiGet<{ ok: boolean; integrations: IntegrationData }>(
      "/internal/settings/integrations"
    )
      .then((d) => {
        setData(d.integrations);
        setTwilioPhone(d.integrations.twilio.phone);
        setOpenaiModel(d.integrations.openai.model);
      })
      .catch((e) => setError(e?.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get("connected") === "google") loadData();
  }, [searchParams, loadData]);

  const saveIntegration = async (provider: string, payload: object) => {
    setSavingProvider(provider);
    setError(null);
    try {
      await apiPost("/internal/settings/integrations", { provider, ...payload });
      setSavedProvider(provider);
      showToast(`${provider.charAt(0).toUpperCase() + provider.slice(1)} settings saved`, "success");
      setTimeout(() => setSavedProvider(null), 3000);
      loadData();
    } catch (err: any) {
      setError(err?.message ?? "Save failed");
      showToast(err?.message ?? "Save failed", "error");
    } finally {
      setSavingProvider(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "80px", borderRadius: "10px" }} />
        ))}
      </div>
    );
  }

  const IntCard: React.FC<{
    name: string;
    description: string;
    connected: boolean;
    detail?: string;
    children?: React.ReactNode;
  }> = ({ name, description, connected, detail, children }) => (
    <Card style={{ marginBottom: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "16px",
          marginBottom: children ? "0" : "0",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "4px",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--color-text-primary)",
              }}
            >
              {name}
            </span>
            <StatusBadge connected={connected} />
          </div>
          <div
            style={{
              fontSize: "13px",
              color: "var(--color-text-secondary)",
            }}
          >
            {description}
          </div>
          {detail && (
            <div
              style={{
                marginTop: "6px",
                fontSize: "12px",
                color: "#4a5a6b",
                fontFamily: "monospace",
              }}
            >
              {detail}
            </div>
          )}
        </div>
      </div>
      {children && (
        <div
          style={{
            marginTop: "16px",
            paddingTop: "16px",
            borderTop: "1px solid var(--color-bg-border)",
          }}
        >
          {children}
        </div>
      )}
    </Card>
  );

  return (
    <div>
      <SectionHeader title="Integrations" />
      {error && <ErrorBox msg={error} />}

      {/* Google Calendar */}
      <IntCard
        name="Google Calendar"
        description="Sync bookings with Google Calendar. Required for real-time appointment management."
        connected={data?.google_calendar.connected ?? false}
        detail={
          data?.google_calendar.connected
            ? `Calendar ID: ${data.google_calendar.calendar_id}`
            : undefined
        }
      >
        {data?.google_calendar.connected ? (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span
              style={{
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                flex: 1,
              }}
            >
              Google Calendar is connected and syncing appointments.
            </span>
            <button
              onClick={() =>
                (window.location.href = `/auth/google/start?client_id=${activeClientId}`)
              }
              style={secondaryBtn()}
            >
              Reconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() =>
              (window.location.href = `/auth/google/start?client_id=${activeClientId}`)
            }
            style={primaryBtn()}
          >
            Connect Google Calendar
          </button>
        )}
      </IntCard>

      {/* Twilio */}
      <IntCard
        name="Twilio SMS"
        description="Phone number used for sending and receiving SMS messages with leads."
        connected={data?.twilio.connected ?? false}
        detail={
          data?.twilio.connected ? data.twilio.phone_masked : undefined
        }
      >
        <div
          style={{ display: "flex", gap: "10px", alignItems: "flex-end" }}
        >
          <Field label="Twilio Phone Number" hint="Format: +17205550100">
            <input
              style={{ ...inputStyle, maxWidth: "240px" }}
              value={twilioPhone}
              onChange={(e) => setTwilioPhone(e.target.value)}
              placeholder="+17205550100"
            />
          </Field>
          <button
            onClick={() =>
              saveIntegration("twilio", { twilio_phone: twilioPhone })
            }
            disabled={savingProvider === "twilio"}
            style={{ ...primaryBtn(savingProvider === "twilio"), marginBottom: "1px" }}
          >
            {savingProvider === "twilio"
              ? "Saving…"
              : savedProvider === "twilio"
              ? "✓ Saved"
              : "Save"}
          </button>
        </div>
      </IntCard>

      {/* OpenAI */}
      <IntCard
        name="OpenAI API"
        description="Powers AI qualification, suggested replies, business intelligence, and Ask Nexus."
        connected={data?.openai.connected ?? false}
        detail={`Model: ${data?.openai.model ?? "—"}  ·  Key: ${data?.openai.api_key_masked ?? "••••••••"}`}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
            alignItems: "flex-end",
          }}
        >
          <Field label="Model">
            <input
              style={inputStyle}
              value={openaiModel}
              onChange={(e) => setOpenaiModel(e.target.value)}
              placeholder="gpt-4o"
            />
          </Field>
          <Field label="API Key" hint="Leave blank to keep existing key">
            <input
              style={inputStyle}
              type="password"
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder={data?.openai.api_key_masked ?? "sk-••••••••"}
              autoComplete="off"
            />
          </Field>
        </div>
        <button
          onClick={() =>
            saveIntegration("openai", {
              openai_model: openaiModel,
              ...(openaiKey ? { openai_api_key: openaiKey } : {}),
            })
          }
          disabled={savingProvider === "openai"}
          style={{ ...primaryBtn(savingProvider === "openai"), marginTop: "12px" }}
        >
          {savingProvider === "openai"
            ? "Saving…"
            : savedProvider === "openai"
            ? "✓ Saved"
            : "Save OpenAI Settings"}
        </button>
      </IntCard>

      {/* Email */}
      <IntCard
        name="Email Provider (Postmark)"
        description="Sends transactional emails, booking confirmations, and outreach messages."
        connected={data?.email.connected ?? false}
        detail={
          data?.email.connected
            ? "Configured via POSTMARK_API_KEY environment variable"
            : "Set POSTMARK_API_KEY in server .env to enable"
        }
      />
    </div>
  );
};

// ─── Users Section ────────────────────────────────────────────────────────────

const InviteModal: React.FC<{
  onClose: () => void;
  onSuccess: () => void;
}> = ({ onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"staff" | "admin">("staff");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await apiPost("/internal/settings/users/invite", {
        email: email.trim(),
        role,
      });
      showToast(`Invitation sent to ${email.trim()}`, "success");
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Invite failed");
      showToast(err?.message ?? "Invite failed", "error");
    } finally {
      setInviting(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) =>
        e.target === overlayRef.current && onClose()
      }
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 300,
      }}
    >
      <div
        style={{
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-bg-border)",
          borderRadius: "12px",
          padding: "28px",
          width: "440px",
          maxWidth: "90vw",
          boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
        }}
      >
        <h3
          style={{
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: "20px",
          }}
        >
          Invite Team Member
        </h3>
        {error && <ErrorBox msg={error} />}
        <form
          onSubmit={handleInvite}
          style={{ display: "flex", flexDirection: "column", gap: "16px" }}
        >
          <Field label="Email Address">
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="team@example.com"
              autoFocus
              required
            />
          </Field>
          <Field label="Role">
            <select
              style={inputStyle}
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "staff" | "admin")
              }
            >
              <option value="staff">
                Staff — Leads, Clients, Communication, Calendar
              </option>
              <option value="admin">
                Admin — Full access including Settings
              </option>
            </select>
          </Field>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
              marginTop: "8px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={secondaryBtn()}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviting || !email.trim()}
              style={primaryBtn(inviting || !email.trim())}
            >
              {inviting ? "Sending…" : "Send Invite"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const UsersSection: React.FC = () => {
  const { me } = useTenant();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    setLoading(true);
    apiGet<{ ok: boolean; users: UserRow[] }>("/internal/settings/users")
      .then((d) => setUsers(d.users))
      .catch((e) => setError(e?.message ?? "Failed to load users"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRemove = async (userId: string) => {
    if (!window.confirm("Remove this user from the team?")) return;
    setRemovingId(userId);
    try {
      const { supabase } = await import("../lib/supabase");
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token)
        headers["Authorization"] = `Bearer ${session.access_token}`;
      const clientId = localStorage.getItem("nexus_active_client_id");
      if (clientId) headers["x-nexus-client-id"] = clientId;

      const res = await fetch(`/internal/settings/users/${userId}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Remove failed");
      showToast("User removed", "success");
      loadUsers();
    } catch (err: any) {
      setError(err?.message ?? "Remove failed");
      showToast(err?.message ?? "Remove failed", "error");
    } finally {
      setRemovingId(null);
    }
  };

  const roleBadge = (role: string) => {
    const isAdmin = role === "admin";
    return (
      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          padding: "3px 10px",
          borderRadius: "999px",
          background: isAdmin
            ? "rgba(99,102,241,0.15)"
            : "rgba(74,90,107,0.2)",
          color: isAdmin ? "#6366f1" : "#8899aa",
          border: `1px solid ${isAdmin ? "rgba(99,102,241,0.3)" : "rgba(74,90,107,0.3)"}`,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
        }}
      >
        {role}
      </span>
    );
  };

  return (
    <div>
      <SectionHeader
        title="Users"
        action={
          <button
            onClick={() => setShowInvite(true)}
            style={primaryBtn()}
          >
            + Invite User
          </button>
        }
      />

      <Card
        style={{
          marginBottom: "20px",
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.2)",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            color: "var(--color-text-secondary)",
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "#6366f1" }}>Admin</strong> — Full access
          to all pages including Settings, Analytics, and user management.
          <br />
          <strong style={{ color: "#8899aa" }}>Staff</strong> — Access to
          Leads, Clients, Communication, and Calendar only.
          <br />
          <span style={{ fontSize: "12px", color: "#4a5a6b" }}>
            Role-based access control (RBAC) page enforcement is planned for
            v2.
          </span>
        </div>
      </Card>

      {error && <ErrorBox msg={error} />}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: "44px", borderRadius: "7px" }} />
          ))}
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-bg-border)",
                }}
              >
                {["Email", "Role", "Status", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "12px 16px",
                      textAlign: "left",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#8899aa",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: "1px solid rgba(30,45,64,0.5)",
                  }}
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--color-text-primary)",
                    }}
                  >
                    {u.email}
                    {u.id === me?.user?.id && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontSize: "11px",
                          color: "#4a5a6b",
                        }}
                      >
                        (you)
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {roleBadge(u.role)}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color:
                          u.status === "active"
                            ? "#10b981"
                            : "#f59e0b",
                      }}
                    >
                      {u.status === "active"
                        ? "Active"
                        : "Pending invite"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {u.id !== me?.user?.id && (
                      <button
                        onClick={() => handleRemove(u.id)}
                        disabled={removingId === u.id}
                        style={{
                          padding: "5px 12px",
                          fontSize: "12px",
                          borderRadius: "5px",
                          border: "1px solid rgba(239,68,68,0.3)",
                          background: "transparent",
                          color: "#ef4444",
                          cursor:
                            removingId === u.id
                              ? "not-allowed"
                              : "pointer",
                          opacity: removingId === u.id ? 0.5 : 1,
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: "20px 16px",
                      color: "#4a5a6b",
                      textAlign: "center",
                    }}
                  >
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSuccess={() => {
            setShowInvite(false);
            loadUsers();
          }}
        />
      )}
    </div>
  );
};

// ─── Automation Section ───────────────────────────────────────────────────────

const AutomationSection: React.FC = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean; rules: AutomationRule[] }>(
      "/internal/automation-rules"
    )
      .then((d) => setRules(d.rules))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (ruleType: string, currentEnabled: boolean) => {
    const updated = rules.map((r) =>
      r.rule_type === ruleType ? { ...r, enabled: !currentEnabled } : r
    );
    setRules(updated);
    setTogglingId(ruleType);
    try {
      const rule = updated.find((r) => r.rule_type === ruleType);
      if (rule) await apiPost("/internal/automation-rules/upsert", rule);
    } catch {
      setRules(rules);
    } finally {
      setTogglingId(null);
    }
  };

  const allRuleTypes = Object.keys(AUTOMATION_RULE_META);

  return (
    <div>
      <SectionHeader title="Automation Rules" />
      <p
        style={{
          fontSize: "13px",
          color: "var(--color-text-secondary)",
          marginBottom: "24px",
          marginTop: "-12px",
        }}
      >
        Toggle rules on/off here. Full configuration (delay, channel, AI
        message) is in{" "}
        <button
          onClick={() => navigate("/analytics")}
          style={{
            background: "none",
            border: "none",
            color: "var(--color-accent)",
            cursor: "pointer",
            fontSize: "13px",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          Analytics → AI Advisor
        </button>
        .
      </p>

      {loading ? (
        <div style={{ color: "#4a5a6b", fontSize: "13px" }}>
          Loading rules…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {allRuleTypes.map((ruleType) => {
            const meta = AUTOMATION_RULE_META[ruleType];
            const dbRule = rules.find((r) => r.rule_type === ruleType);
            const enabled = dbRule?.enabled ?? false;
            const delay = dbRule?.delay_hours;
            const channel = dbRule?.channel;

            return (
              <Card key={ruleType}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        marginBottom: "4px",
                      }}
                    >
                      {meta.label}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#8899aa",
                        marginBottom: "2px",
                      }}
                    >
                      <strong style={{ color: "#4a5a6b" }}>
                        Trigger:
                      </strong>{" "}
                      {meta.trigger}
                    </div>
                    <div
                      style={{ fontSize: "12px", color: "#8899aa" }}
                    >
                      <strong style={{ color: "#4a5a6b" }}>
                        Action:
                      </strong>{" "}
                      {meta.action}
                    </div>
                    {dbRule && (
                      <div
                        style={{
                          marginTop: "8px",
                          fontSize: "11px",
                          color: "#4a5a6b",
                        }}
                      >
                        Delay: {delay}h · Channel:{" "}
                        {channel?.toUpperCase() ?? "SMS"}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      flexShrink: 0,
                    }}
                  >
                    <button
                      onClick={() => navigate("/analytics")}
                      style={{
                        padding: "6px 12px",
                        fontSize: "12px",
                        fontWeight: 600,
                        borderRadius: "6px",
                        border: "1px solid var(--color-bg-border)",
                        background: "transparent",
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      Configure
                    </button>
                    <Toggle
                      value={enabled}
                      onChange={() =>
                        handleToggle(ruleType, enabled)
                      }
                      disabled={togglingId === ruleType}
                      color="#0ea5e9"
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Notifications Section ────────────────────────────────────────────────────

const NotificationsSection: React.FC = () => {
  const [prefs, setPrefs] = useState<NotifPrefs>({
    ai_outreach_inapp: false,
    ai_outreach_daily_email: false,
    ai_outreach_instant_alert: false,
    new_lead_alert: true,
    booking_confirmed: true,
    missed_call_alert: true,
    daily_summary: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<keyof NotifPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ ok: boolean; prefs: NotifPrefs }>(
      "/internal/settings/notifications"
    )
      .then((d) => setPrefs(d.prefs))
      .catch((e) => setError(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = async (key: keyof NotifPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(key);
    setError(null);
    try {
      await apiPost("/internal/settings/notifications", updated);
    } catch (err: any) {
      setPrefs(prefs);
      setError(err?.message ?? "Save failed");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {[...Array(7)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: "44px", borderRadius: "7px" }} />
        ))}
      </div>
    );
  }

  const groups = [
    {
      label: "AI Outreach Automation",
      items: NOTIF_ITEMS.filter((i) => i.group === "ai"),
    },
    {
      label: "System Alerts",
      items: NOTIF_ITEMS.filter((i) => i.group === "system"),
    },
  ];

  return (
    <div>
      <SectionHeader title="Notifications" />
      {error && (
        <ErrorBox
          msg={error}
          migration={
            error.includes("does not exist") ||
            error.includes("relation")
          }
        />
      )}

      {groups.map(({ label, items }) => (
        <div key={label} style={{ marginBottom: "24px" }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "#4a5a6b",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: "8px",
            }}
          >
            {label}
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            {items.map(({ key, label: itemLabel, description }) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 16px",
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-bg-border)",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{ flex: 1, paddingRight: "16px" }}
                >
                  <div
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      marginBottom: "2px",
                    }}
                  >
                    {itemLabel}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    {description}
                  </div>
                </div>
                <Toggle
                  value={prefs[key]}
                  onChange={() => handleToggle(key)}
                  disabled={saving === key}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Nav icons ────────────────────────────────────────────────────────────────

type NavIconProps = { section: Section; size?: number };

const NavIcon: React.FC<NavIconProps> = ({ section, size = 16 }) => {
  const paths: Record<Section, React.ReactElement> = {
    business: (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    ),
    integrations: (
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    ),
    users: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    automation: (
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    ),
    notifications: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      {paths[section]}
    </svg>
  );
};

// ─── Main Settings Component ──────────────────────────────────────────────────

const NAV_ITEMS: { id: Section; label: string }[] = [
  { id: "business", label: "Business Info" },
  { id: "integrations", label: "Integrations" },
  { id: "users", label: "Users" },
  { id: "automation", label: "Automation" },
  { id: "notifications", label: "Notifications" },
];

const Settings: React.FC = () => {
  const [searchParams] = useSearchParams();
  const rawSection = searchParams.get("section") as Section | null;
  const validSection =
    rawSection && NAV_ITEMS.some((n) => n.id === rawSection)
      ? rawSection
      : "business";

  const [activeSection, setActiveSection] = useState<Section>(validSection);
  const [hoveredNav, setHoveredNav] = useState<Section | null>(null);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left sub-navigation */}
      <nav
        style={{
          width: "220px",
          flexShrink: 0,
          background: "var(--color-bg-surface)",
          borderRight: "1px solid var(--color-bg-border)",
          display: "flex",
          flexDirection: "column",
          padding: "16px 0",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            padding: "4px 16px 14px",
            fontSize: "11px",
            fontWeight: 700,
            color: "#4a5a6b",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          Settings
        </div>

        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          const isHovered = hoveredNav === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              onMouseEnter={() => setHoveredNav(item.id)}
              onMouseLeave={() => setHoveredNav(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 16px",
                margin: "2px 8px",
                borderRadius: "7px",
                fontSize: "14px",
                fontWeight: 500,
                color: isActive
                  ? "var(--color-accent)"
                  : isHovered
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
                background: isActive
                  ? "var(--color-accent-muted)"
                  : isHovered
                  ? "var(--color-bg-elevated)"
                  : "transparent",
                border: "none",
                borderLeft: `2px solid ${
                  isActive ? "var(--color-accent)" : "transparent"
                }`,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <NavIcon section={item.id} size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Right content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px",
          background: "var(--color-bg-base)",
        }}
      >
        <div style={{ maxWidth: "740px" }}>
          {activeSection === "business" && <BusinessInfoSection />}
          {activeSection === "integrations" && <IntegrationsSection />}
          {activeSection === "users" && <UsersSection />}
          {activeSection === "automation" && <AutomationSection />}
          {activeSection === "notifications" && <NotificationsSection />}
        </div>
      </div>
    </div>
  );
};

export default Settings;
