import Link from "next/link";
import { IconArrowRight, IconFindings } from "@/components/icons";

export default function NotFound() {
  return (
    <main className="error-page grid-pattern">
      <div className="error-card">
        <div className="unavailable-mark" style={{ height: 48, width: 48 }}>
          <IconFindings size={22} />
        </div>
        <div className="eyebrow" style={{ marginTop: 16 }}>404 / not found</div>
        <h1>This record is not available.</h1>
        <p>
          It may have been deleted, belong to another account, or never have existed. Amethyst does
          not reveal whether a private record exists.
        </p>
        <div className="error-card-actions">
          <Link className="btn btn-primary" href="/overview">
            Return to workspace <IconArrowRight size={13} />
          </Link>
          <Link className="btn btn-secondary" href="/projects">
            Browse projects
          </Link>
        </div>
      </div>
    </main>
  );
}
