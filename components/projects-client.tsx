"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { apiRequest, ClientApiError } from "@/lib/client-api";

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export function ProjectsClient({ projects }: { projects: ProjectSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiRequest<{ project: ProjectSummary }>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({ name, description: description.trim() || undefined }),
      });
      setName("");
      setDescription("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create project");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(project: ProjectSummary) {
    if (!window.confirm(`Delete "${project.name}" and all of its analysis data?`)) return;
    setError(null);

    try {
      await apiRequest<{ deleted: boolean }>(`/api/v1/projects/${project.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to delete project");
    }
  }

  return (
    <div className="grid">
      <section className="card">
        <div className="card-header">
          <h2>New project</h2>
        </div>
        <form className="stack" onSubmit={createProject}>
          {error ? <div className="alert error">{error}</div> : null}
          <label className="field">
            <span>Name</span>
            <input
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <button disabled={busy} type="submit">
            {busy ? "Creating..." : "Create project"}
          </button>
        </form>
      </section>

      <section>
        <div className="card-header">
          <h2>Projects</h2>
          <span className="badge">{projects.length}</span>
        </div>
        {projects.length === 0 ? (
          <div className="card empty">No projects yet. Create one to add analysis targets.</div>
        ) : (
          <ul className="list">
            {projects.map((project) => (
              <li className="list-item" key={project.id}>
                <div className="row spread">
                  <div>
                    <h3 style={{ marginBottom: 4 }}>
                      <Link href={`/projects/${project.id}`}>{project.name}</Link>
                    </h3>
                    <p className="small muted" style={{ margin: 0 }}>
                      {project.description || "No description"}
                    </p>
                  </div>
                  <button className="danger" type="button" onClick={() => deleteProject(project)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ClientApiError) return `${error.message} (${error.code})`;
  return error instanceof Error ? error.message : "Unexpected error";
}
