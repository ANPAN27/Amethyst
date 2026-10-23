"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconAi,
  IconAnalysis,
  IconClose,
  IconCollapse,
  IconCredits,
  IconExpand,
  IconFindings,
  IconGraph,
  IconLogout,
  IconMenu,
  IconOverview,
  IconProjects,
  IconSettings,
  IconUser,
} from "@/components/icons";
import { ToastProvider } from "@/components/ui/toast";
import { cx } from "@/components/ui/primitives";
import type { CreditBalance, UserProfile } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  match: (pathname: string) => boolean;
};

const sections: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      {
        href: "/overview",
        label: "Overview",
        icon: <IconOverview size={16} />,
        match: (pathname) => pathname === "/overview",
      },
      {
        href: "/projects",
        label: "Projects",
        icon: <IconProjects size={16} />,
        match: (pathname) => pathname.startsWith("/projects"),
      },
      {
        href: "/analysis",
        label: "Analysis",
        icon: <IconAnalysis size={16} />,
        match: (pathname) => pathname === "/analysis",
      },
      {
        href: "/findings",
        label: "Findings",
        icon: <IconFindings size={16} />,
        match: (pathname) => pathname.startsWith("/findings"),
      },
    ],
  },
  {
    label: "Intelligence",
    items: [
      {
        href: "/ai",
        label: "AI workspace",
        icon: <IconAi size={16} />,
        match: (pathname) => pathname.startsWith("/ai"),
      },
      {
        href: "/graph",
        label: "Graph",
        icon: <IconGraph size={16} />,
        match: (pathname) => pathname.startsWith("/graph"),
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        href: "/usage",
        label: "Usage & credits",
        icon: <IconCredits size={16} />,
        match: (pathname) => pathname === "/usage",
      },
      {
        href: "/settings",
        label: "Settings",
        icon: <IconSettings size={16} />,
        match: (pathname) => pathname === "/settings",
      },
    ],
  },
];

const ROUTE_LABELS: Record<string, string> = {
  overview: "Overview",
  projects: "Projects",
  analysis: "Analysis",
  findings: "Findings",
  ai: "AI workspace",
  graph: "Graph",
  usage: "Usage & credits",
  settings: "Settings",
};

function breadcrumbs(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Overview", href: "/overview" }];

  const crumbs: { label: string; href?: string }[] = [];
  const first = parts[0] ?? "";
  if (first !== "overview") {
    crumbs.push({ label: "Workspace", href: "/overview" });
  }

  parts.forEach((part, index) => {
    const isId = /^[0-9a-f-]{20,}$/i.test(part);
    const label = isId ? "Project" : (ROUTE_LABELS[part] ?? part.replaceAll("-", " "));
    crumbs.push({
      label,
      href: index < parts.length - 1 ? `/${parts.slice(0, index + 1).join("/")}` : undefined,
    });
  });

  return crumbs;
}

function initials(profile: UserProfile) {
  const source = profile.display_name?.trim() || profile.email?.split("@")[0] || "A";
  return source
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function WorkspaceShell({
  profile,
  credits,
  openJobs,
  children,
}: {
  profile: UserProfile;
  credits: CreditBalance;
  openJobs: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("amethyst.sidebar") === "collapsed");
    } catch {
      setCollapsed(false);
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("amethyst.sidebar", next ? "collapsed" : "expanded");
      } catch {
        // Preference persistence is optional.
      }
      return next;
    });
  }

  const crumbs = useMemo(() => breadcrumbs(pathname), [pathname]);

  return (
    <ToastProvider>
      <div
        className={cx(
          "app-shell",
          collapsed && "sidebar-collapsed",
          drawerOpen && "sidebar-drawer-open",
        )}
      >
        <aside className="sidebar">
          <div className="sidebar-top">
            <Link className="sidebar-brand" href="/overview">
              <span className="brand-mark">A</span>
              <span className="brand-word">
                Amethyst<span>.</span>
              </span>
            </Link>
            <button
              aria-label="Close navigation"
              className="icon-btn mobile-menu-button"
              onClick={() => setDrawerOpen(false)}
              type="button"
            >
              <IconClose size={17} />
            </button>
          </div>

          <nav className="nav" aria-label="Workspace">
            {sections.map((section) => (
              <div className="nav-section" key={section.label}>
                <span className="nav-section-label">{section.label}</span>
                {section.items.map((item) => {
                  const active = item.match(pathname);
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={cx("nav-link", active && "nav-link-active")}
                      href={item.href}
                      key={item.href}
                      title={collapsed ? item.label : undefined}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-label">{item.label}</span>
                      {item.href === "/analysis" && openJobs > 0 ? (
                        <span className="nav-badge">{openJobs} open</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <Link className="sidebar-user" href="/settings">
              <span className="avatar">{initials(profile)}</span>
              <span className="sidebar-user-copy">
                <strong>{profile.display_name || profile.email || "Amethyst user"}</strong>
                <span>{profile.email || "Authenticated session"}</span>
              </span>
            </Link>
            <button className="sidebar-collapse" onClick={toggleCollapsed} type="button">
              {collapsed ? <IconExpand size={14} /> : <IconCollapse size={14} />}
              <span>{collapsed ? "Expand" : "Collapse"}</span>
            </button>
          </div>
        </aside>

        {drawerOpen ? (
          <button
            aria-label="Close navigation"
            className="drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
        ) : null}

        <div className="workspace">
          <header className="topbar">
            <div className="topbar-left">
              <button
                aria-label="Open navigation"
                className="icon-btn mobile-menu-button"
                onClick={() => setDrawerOpen(true)}
                type="button"
              >
                <IconMenu size={18} />
              </button>
              <nav aria-label="Breadcrumb" className="breadcrumbs">
                {crumbs.map((crumb, index) => (
                  <span className="row" key={`${crumb.label}-${index}`} style={{ gap: 7 }}>
                    {index > 0 ? <span className="breadcrumb-separator">/</span> : null}
                    {crumb.href ? (
                      <Link href={crumb.href}>{crumb.label}</Link>
                    ) : (
                      <span className="breadcrumb-current">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            </div>
            <div className="topbar-right">
              {openJobs > 0 ? (
                <Link className="topbar-live" href="/analysis">
                  <span className="status status-live">
                    <span className="status-dot" />
                    {openJobs} {openJobs === 1 ? "job" : "jobs"} active
                  </span>
                </Link>
              ) : null}
              <Link className="topbar-credit" href="/usage">
                <IconCredits size={14} />
                <span>Credits</span>
                <strong>{credits.available.toLocaleString()}</strong>
              </Link>
              <form action="/auth/signout" method="post">
                <button className="icon-btn" title="Sign out" type="submit" aria-label="Sign out">
                  <IconLogout size={16} />
                </button>
              </form>
            </div>
          </header>
          <main className="workspace-content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}

export function UserAvatar({ profile }: { profile: UserProfile }) {
  return (
    <span className="avatar" title={profile.display_name || profile.email || "Amethyst user"}>
      {initials(profile) || <IconUser size={13} />}
    </span>
  );
}
