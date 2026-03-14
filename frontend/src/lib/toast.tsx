// Toast notification system — context + hook + renderer
// Usage: const { showToast } = useToast();
//        showToast("Saved!", "success");

import React, { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).slice(2, 10);
    setToasts((prev) => [...prev, { id, message, type }]);
    const t = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timers.current.delete(id);
    }, 4000);
    timers.current.set(id, t);
  }, []);

  const dismiss = (id: string) => {
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="nexus-toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`nexus-toast ${toast.type}`}
            onClick={() => dismiss(toast.id)}
            style={{ cursor: "pointer" }}
          >
            <span style={{ flex: 1 }}>{toast.message}</span>
            <span style={{ fontSize: "16px", color: "var(--color-text-muted)", lineHeight: 1 }}>×</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
