import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiPost } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  content: string;
  ts: Date;
  error?: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  "How many leads this week?",
  "What's my conversion rate?",
  "Who are my top clients?",
  "Any follow-ups needed?",
  "Show bookings this month",
  "How can I improve my no-show rate?",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "Just now";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const SparklesIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 20,
  color = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
  >
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    <path d="M5.5 16l.75 2.25 2.25.75-2.25.75L5.5 22l-.75-2.25L2.5 19l2.25-.75z" />
    <path d="M18.5 3l.75 2.25 2.25.75-2.25.75L18.5 9l-.75-2.25L15.5 6l2.25-.75z" />
  </svg>
);

const SendIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// ─── Subcomponents ────────────────────────────────────────────────────────────

const TypingIndicator: React.FC = () => (
  <div
    style={{
      background: "rgba(99,102,241,0.08)",
      borderLeft: "3px solid var(--color-info)",
      borderRadius: "8px",
      padding: "16px 20px",
      marginBottom: "20px",
    }}
  >
    <div
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "var(--color-info)",
        textTransform: "uppercase",
        letterSpacing: "0.07em",
        marginBottom: "10px",
      }}
    >
      Nexus AI
    </div>
    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            background: "var(--color-info)",
            animation: `nexusBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  </div>
);

const MessageBubble: React.FC<{ msg: Message }> = ({ msg }) => {
  if (msg.role === "assistant") {
    return (
      <div style={{ marginBottom: "20px" }}>
        <div
          style={{
            background: msg.error
              ? "rgba(239,68,68,0.08)"
              : "rgba(99,102,241,0.08)",
            borderLeft: `3px solid ${msg.error ? "var(--color-danger)" : "var(--color-info)"}`,
            borderRadius: "8px",
            padding: "16px 20px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 700,
              color: msg.error ? "var(--color-danger)" : "var(--color-info)",
              textTransform: "uppercase",
              letterSpacing: "0.07em",
              marginBottom: "10px",
            }}
          >
            Nexus AI
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "var(--color-text-primary)",
              lineHeight: 1.7,
              whiteSpace: "pre-line",
            }}
          >
            {msg.content}
          </div>
        </div>
        <div
          style={{
            fontSize: "11px",
            color: "var(--color-text-muted)",
            marginTop: "5px",
            paddingLeft: "4px",
          }}
        >
          {formatTime(msg.ts)}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        marginBottom: "20px",
      }}
    >
      <div
        style={{
          maxWidth: "70%",
          background: "rgba(14,165,233,0.1)",
          border: "1px solid rgba(14,165,233,0.2)",
          borderRadius: "8px",
          padding: "12px 16px",
          fontSize: "14px",
          color: "var(--color-text-primary)",
          lineHeight: 1.6,
          whiteSpace: "pre-line",
        }}
      >
        {msg.content}
      </div>
      <div
        style={{
          fontSize: "11px",
          color: "var(--color-text-muted)",
          marginTop: "5px",
          paddingRight: "4px",
        }}
      >
        {formatTime(msg.ts)}
      </div>
    </div>
  );
};

const SuggestedPrompts: React.FC<{
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}> = ({ onSelect, disabled }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div
      style={{
        display: "flex",
        gap: "8px",
        flexWrap: "wrap",
        marginBottom: "12px",
      }}
    >
      {SUGGESTED_PROMPTS.map((p, i) => (
        <button
          key={p}
          onClick={() => !disabled && onSelect(p)}
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          disabled={disabled}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            borderRadius: "20px",
            border: `1px solid ${hovered === i ? "var(--color-accent)" : "var(--color-bg-border)"}`,
            background: "var(--color-bg-elevated)",
            color:
              hovered === i
                ? "var(--color-accent)"
                : "var(--color-text-secondary)",
            cursor: disabled ? "not-allowed" : "pointer",
            transition: "border-color 0.15s, color 0.15s",
            opacity: disabled ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const AskNexus: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxHeight = 8 * 22 + 16; // ~8 rows
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }, [input]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: trimmed,
        ts: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setLoading(true);
      setError(null);

      // Build history for context (exclude the message we just added)
      const history = messages
        .concat(userMsg)
        .slice(-40)
        .map((m) => ({ role: m.role, content: m.content }));

      try {
        const data = await apiPost<{ ok: boolean; reply: string }>(
          "/internal/ask-nexus",
          { message: trimmed, history: history.slice(0, -1) }
        );
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: data.reply,
            ts: new Date(),
          },
        ]);
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: "assistant",
            content: `Something went wrong: ${err?.message ?? "Unknown error"}`,
            ts: new Date(),
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setError(null);
    textareaRef.current?.focus();
  };

  const hasMessages = messages.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* ── Page-level header ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-bg-border)",
          flexShrink: 0,
          background: "var(--color-bg-surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <SparklesIcon size={20} color="#6366f1" />
          <span
            style={{
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--color-text-primary)",
            }}
          >
            Ask Nexus
          </span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              background: "rgba(99,102,241,0.15)",
              color: "#6366f1",
              border: "1px solid rgba(99,102,241,0.3)",
              padding: "2px 8px",
              borderRadius: "999px",
              letterSpacing: "0.06em",
            }}
          >
            AI
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {hasMessages && (
            <button
              onClick={handleNewChat}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                fontSize: "13px",
                fontWeight: 600,
                borderRadius: "7px",
                border: "1px solid var(--color-bg-border)",
                background: "transparent",
                color: "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              <PlusIcon />
              New Chat
            </button>
          )}
        </div>
      </div>

      {/* ── Message area ───────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!hasMessages ? (
          /* Welcome state */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              gap: "16px",
              maxWidth: "640px",
              margin: "0 auto",
              width: "100%",
            }}
          >
            <div
              style={{
                width: "68px",
                height: "68px",
                borderRadius: "20px",
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <SparklesIcon size={32} color="#6366f1" />
            </div>

            <div>
              <h2
                style={{
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "var(--color-text-primary)",
                  marginBottom: "8px",
                }}
              >
                Ask Nexus anything about your business
              </h2>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.6,
                }}
              >
                Get insights, find leads, check bookings, and more.
              </p>
            </div>

            <SuggestedPrompts onSelect={sendMessage} disabled={loading} />
          </div>
        ) : (
          /* Message list */
          <div
            style={{
              maxWidth: "800px",
              width: "100%",
              margin: "0 auto",
              flex: 1,
            }}
          >
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} />
            ))}
            {loading && <TypingIndicator />}
            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--color-bg-border)",
          padding: "16px 32px",
          background: "var(--color-bg-surface)",
        }}
      >
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          {/* Suggested prompts above input (only when there are messages) */}
          {hasMessages && (
            <SuggestedPrompts onSelect={sendMessage} disabled={loading} />
          )}

          {error && (
            <div
              style={{
                marginBottom: "10px",
                fontSize: "12px",
                color: "var(--color-danger)",
              }}
            >
              {error}
            </div>
          )}

          {/* Input row */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Nexus anything about your business…"
              rows={2}
              disabled={loading}
              style={{
                flex: 1,
                padding: "12px 16px",
                fontSize: "14px",
                color: "var(--color-text-primary)",
                background: "var(--color-bg-elevated)",
                border: "1px solid var(--color-bg-border)",
                borderRadius: "10px",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: 1.6,
                overflowY: "auto",
                transition: "border-color 0.15s",
                opacity: loading ? 0.7 : 1,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--color-accent)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--color-bg-border)";
              }}
            />

            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                border: "none",
                background:
                  input.trim() && !loading
                    ? "var(--color-success)"
                    : "var(--color-bg-elevated)",
                color:
                  input.trim() && !loading
                    ? "#fff"
                    : "var(--color-text-muted)",
                cursor:
                  input.trim() && !loading ? "pointer" : "not-allowed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <SendIcon />
            </button>
          </div>

          <div
            style={{
              marginTop: "8px",
              fontSize: "11px",
              color: "var(--color-text-muted)",
              textAlign: "center",
            }}
          >
            Enter to send · Shift+Enter for new line
          </div>
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes nexusBounce {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50% { opacity: 1; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
};

export default AskNexus;
