import Link from "next/link";

export function AppHeader({ email }: { email: string | null }) {
  return (
    <header className="header">
      <Link className="brand" href="/projects">
        Amethyst<span>.</span>
      </Link>
      <nav>
        <Link href="/projects">Projects</Link>
        <span className="small muted">{email ?? "signed in"}</span>
        <form action="/auth/signout" method="post">
          <button className="secondary" type="submit">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
