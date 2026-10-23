import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { IconAlert, IconCheck, IconClock } from "@/components/icons";
import { statusLabel, statusTone } from "@/lib/ui";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return <button className={cx("btn", `btn-${variant}`, `btn-${size}`, className)} {...props} />;
}

type ButtonLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({
  className,
  variant = "primary",
  size = "md",
  href,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={cx("btn", `btn-${variant}`, `btn-${size}`, className)} href={href} {...props} />
  );
}

export function IconButton({
  className,
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      className={cx("icon-btn", className)}
      title={label}
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label className="field" htmlFor={htmlFor}>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("textarea", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("select", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  mono = false,
  className,
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "live" | "solid";
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cx("badge", `badge-${tone}`, mono && "mono", className)}>{children}</span>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = statusTone(status);
  return (
    <span className={cx("status", `status-${tone}`)}>
      <span className="status-dot" />
      {label ?? statusLabel(status)}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {meta ? <div className="page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("empty-state", compact && "empty-state-compact")}>
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-actions">{action}</div> : null}
    </div>
  );
}

export function Skeleton({
  width,
  height = 12,
  className,
}: {
  width?: string;
  height?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx("skeleton", className)}
      style={{ width: width ?? "100%", height }}
    />
  );
}

export function Notice({
  tone = "neutral",
  title,
  children,
  action,
}: {
  tone?: "neutral" | "success" | "warning" | "danger";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "success" ? IconCheck : tone === "warning" ? IconClock : IconAlert;
  return (
    <div className={cx("notice", `notice-${tone}`)} role={tone === "danger" ? "alert" : "status"}>
      <Icon className="notice-icon" size={16} />
      <div className="notice-body">
        {title ? <strong>{title}</strong> : null}
        {children}
      </div>
      {action ? <div className="notice-action">{action}</div> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {detail ? <span className="metric-detail">{detail}</span> : null}
    </>
  );
  if (href) {
    return (
      <Link className="metric metric-link" href={href}>
        {content}
      </Link>
    );
  }
  return <div className="metric">{content}</div>;
}

export function Divider() {
  return <div aria-hidden="true" className="divider" />;
}
