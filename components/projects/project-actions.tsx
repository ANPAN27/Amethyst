"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { IconEdit, IconMore, IconPlus, IconTrash } from "@/components/icons";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Menu } from "@/components/ui/menu";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import { useToast as useToastHook } from "@/components/ui/toast";
import { apiRequest } from "@/lib/client-api";
import type { ProjectSummary } from "@/lib/types";
import { formatClientError } from "@/lib/ui";

export function CreateProjectButton({
  label = "New project",
  variant = "primary",
  size = "md",
}: {
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} size={size} variant={variant}>
        <IconPlus size={14} />
        {label}
      </Button>
      <ProjectFormDialog onClose={() => setOpen(false)} open={open} />
    </>
  );
}

function ProjectFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToastHook();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const result = await apiRequest<{ project: ProjectSummary }>("/api/v1/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });
      toast.push({ title: "Project created", tone: "success" });
      setOpenState();
      router.push(`/projects/${result.project.id}`);
      router.refresh();
    } catch (caught) {
      setError(formatClientError(caught));
    } finally {
      setBusy(false);
    }
  }

  function setOpenState() {
    setName("");
    setDescription("");
    setError(null);
    onClose();
  }

  return (
    <Dialog
      description="Projects group local targets, analysis jobs, findings, and AI work."
      footer={
        <>
          <Button onClick={setOpenState} type="button" variant="secondary">
            Cancel
          </Button>
          <Button disabled={busy} form="create-project-form" type="submit">
            {busy ? "Creating…" : "Create project"}
          </Button>
        </>
      }
      onClose={setOpenState}
      open={open}
      title="Create project"
    >
      <form className="stack" id="create-project-form" onSubmit={submit}>
        {error ? (
          <div className="notice notice-danger" role="alert">
            <div className="notice-body">{error}</div>
          </div>
        ) : null}
        <Field htmlFor="project-name" label="Project name">
          <Input
            autoFocus
            id="project-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Acme desktop client"
            required
            value={name}
          />
        </Field>
        <Field
          htmlFor="project-description"
          label="Description"
          hint="Optional context for the workspace. Do not include secrets."
        >
          <Textarea
            id="project-description"
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What system is being inspected, and why?"
            value={description}
          />
        </Field>
      </form>
    </Dialog>
  );
}

export function ProjectActions({
  project,
  redirectOnDelete = false,
}: {
  project: ProjectSummary;
  redirectOnDelete?: boolean;
}) {
  const router = useRouter();
  const toast = useToastHook();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await apiRequest(`/api/v1/projects/${project.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          description: description.trim() ? description.trim() : null,
        }),
      });
      toast.push({ title: "Project updated", tone: "success" });
      setEditOpen(false);
      router.refresh();
    } catch (caught) {
      setError(formatClientError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/v1/projects/${project.id}`, { method: "DELETE" });
      toast.push({ title: "Project deleted", description: "Evidence objects were removed.", tone: "success" });
      setDeleteOpen(false);
      if (redirectOnDelete) router.push("/projects");
      router.refresh();
    } catch (caught) {
      setError(formatClientError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Menu
        label={`Actions for ${project.name}`}
        trigger={<IconMore size={17} />}
      >
        {({ close }) => (
          <>
            <button
              className="menu-item"
              onClick={() => {
                close();
                setEditOpen(true);
              }}
              type="button"
            >
              <IconEdit size={14} /> Edit project
            </button>
            <div className="menu-separator" />
            <button
              className="menu-item menu-item-danger"
              onClick={() => {
                close();
                setDeleteOpen(true);
              }}
              type="button"
            >
              <IconTrash size={14} /> Delete project
            </button>
          </>
        )}
      </Menu>

      <Dialog
        footer={
          <>
            <Button onClick={() => setEditOpen(false)} type="button" variant="secondary">
              Cancel
            </Button>
            <Button disabled={busy} form={`edit-project-${project.id}`} type="submit">
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
        onClose={() => setEditOpen(false)}
        open={editOpen}
        title="Edit project"
      >
        <form className="stack" id={`edit-project-${project.id}`} onSubmit={save}>
          {error ? (
            <div className="notice notice-danger" role="alert">
              <div className="notice-body">{error}</div>
            </div>
          ) : null}
          <Field htmlFor={`project-name-${project.id}`} label="Project name">
            <Input
              id={`project-name-${project.id}`}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </Field>
          <Field htmlFor={`project-description-${project.id}`} label="Description">
            <Textarea
              id={`project-description-${project.id}`}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </Field>
        </form>
      </Dialog>

      <ConfirmDialog
        busy={busy}
        confirmLabel="Delete project"
        danger
        description={`This permanently deletes ${project.name}, its targets, jobs, findings, and stored evidence. This cannot be undone.`}
        onClose={() => setDeleteOpen(false)}
        onConfirm={remove}
        open={deleteOpen}
        title="Delete project?"
      />
    </>
  );
}
