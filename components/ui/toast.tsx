"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { IconAlert, IconCheck, IconClose } from "@/components/icons";
import { IconButton, cx } from "@/components/ui/primitives";

type ToastTone = "neutral" | "success" | "danger";
type ToastItem = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  push: (input: { title: string; description?: string; tone?: ToastTone }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: { title: string; description?: string; tone?: ToastTone }) => {
      const id = nextToastId++;
      setToasts((current) => [
        ...current.slice(-3),
        {
          id,
          title: input.title,
          description: input.description,
          tone: input.tone ?? "neutral",
        },
      ]);
    },
    [],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="toast-stack">
        {toasts.map((toast) => (
          <Toast key={toast.id} onDismiss={() => dismiss(toast.id)} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5200);
    return () => window.clearTimeout(timer);
  }, [onDismiss]);

  const Icon = toast.tone === "success" ? IconCheck : toast.tone === "danger" ? IconAlert : IconCheck;

  return (
    <div className={cx("toast", `toast-${toast.tone}`)} role="status">
      <Icon className="toast-icon" size={16} />
      <div>
        <strong>{toast.title}</strong>
        {toast.description ? <p>{toast.description}</p> : null}
      </div>
      <IconButton label="Dismiss notification" onClick={onDismiss}>
        <IconClose size={14} />
      </IconButton>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
