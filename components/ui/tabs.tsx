"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/primitives";

export type TabItem<T extends string = string> = {
  id: T;
  label: string;
  count?: number;
  disabled?: boolean;
};

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => !item.disabled);
    if (enabled.length === 0) return;
    const current = enabled.findIndex(({ itemIndex }) => itemIndex === index);
    let next = current;
    if (event.key === "ArrowLeft") next = (current - 1 + enabled.length) % enabled.length;
    if (event.key === "ArrowRight") next = (current + 1) % enabled.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    onChange(target.item.id);
    refs.current[target.itemIndex]?.focus();
  }

  return (
    <div aria-label={ariaLabel} className={cx("tabs", className)} role="tablist">
      {items.map((item, index) => (
        <button
          aria-selected={value === item.id}
          className={cx("tab", value === item.id && "tab-active")}
          disabled={item.disabled}
          key={item.id}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => onKeyDown(event, index)}
          ref={(node) => {
            refs.current[index] = node;
          }}
          role="tab"
          tabIndex={value === item.id ? 0 : -1}
          type="button"
        >
          <span>{item.label}</span>
          {typeof item.count === "number" ? <span className="tab-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({
  active,
  children,
  id,
}: {
  active: boolean;
  children: ReactNode;
  id: string;
}) {
  if (!active) return null;
  return (
    <div aria-labelledby={`${id}-tab`} id={id} role="tabpanel" tabIndex={0}>
      {children}
    </div>
  );
}
