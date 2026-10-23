import { describe, expect, it } from "vitest";
import {
  aiChatSchema,
  companionTargetSchema,
  createJobSchema,
  createTargetSchema,
  exchangePairingCodeSchema,
  graphQuerySchema,
  jobResultSchema,
  WORKFLOWS,
} from "@/lib/validation/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("workflow validation", () => {
  it("accepts only allowlisted workflows", () => {
    for (const workflow of WORKFLOWS) {
      expect(
        createJobSchema.safeParse({
          workflow,
          target_id: uuid,
          companion_id: uuid,
        }).success,
      ).toBe(true);
    }

    expect(
      createJobSchema.safeParse({
        workflow: "run_arbitrary_command",
        target_id: uuid,
        companion_id: uuid,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown workflow parameters instead of forwarding them", () => {
    const result = createJobSchema.safeParse({
      workflow: "analyze_javascript_application",
      target_id: uuid,
      companion_id: uuid,
      params: { command: "rm -rf /" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts only documented parameters", () => {
    const result = createJobSchema.safeParse({
      workflow: "inspect_sqlite_database",
      target_id: uuid,
      companion_id: uuid,
      params: { table: "users" },
    });
    expect(result.success).toBe(true);

    expect(
      createJobSchema.safeParse({
        workflow: "analyze_javascript_application",
        target_id: uuid,
        companion_id: uuid,
        params: { detail: "summary" },
      }).success,
    ).toBe(false);
  });
});

describe("target validation", () => {
  it("requires a local absolute path", () => {
    expect(
      createTargetSchema.safeParse({
        kind: "javascript_application",
        label: "app",
        target_path: "relative",
      })
        .success,
    ).toBe(false);
    expect(
      createTargetSchema.safeParse({
        kind: "javascript_application",
        label: "app",
        target_path: "/tmp/app",
      }).success,
    ).toBe(true);
    expect(
      createTargetSchema.safeParse({
        kind: "run_arbitrary_command",
        label: "app",
        target_path: "/tmp/app",
      }).success,
    ).toBe(false);
  });
});

describe("companion target registration validation", () => {
  it("requires an allowlisted kind and an absolute path", () => {
    const base = {
      project_id: uuid,
      kind: "javascript_application",
      label: "Desktop app",
      target_path: "/home/user/app",
    };

    expect(companionTargetSchema.safeParse(base).success).toBe(true);
    expect(
      companionTargetSchema.safeParse({ ...base, kind: "javascript_app" }).success,
    ).toBe(false);
    expect(
      companionTargetSchema.safeParse({ ...base, target_path: "relative/app" }).success,
    ).toBe(false);
  });

  it("accepts explicit AI evidence consent", () => {
    expect(aiChatSchema.safeParse({ question: "Explain", consent_to_send_evidence: true }).success).toBe(
      true,
    );
    expect(aiChatSchema.safeParse({ question: "Explain" }).data?.consent_to_send_evidence).toBe(
      undefined,
    );
  });
});

describe("job result validation", () => {
  const artifact = { path: "p/1.json", sha256: "a".repeat(64), size_bytes: 10 };

  it("requires an artifact for a succeeded job", () => {
    expect(jobResultSchema.safeParse({ status: "succeeded" }).success).toBe(false);
    expect(jobResultSchema.safeParse({ status: "succeeded", artifact }).success).toBe(true);
  });

  it("does not require an artifact for a failed job", () => {
    expect(
      jobResultSchema.safeParse({ status: "failed", error: { code: "TARGET_NOT_APPROVED" } }).success,
    ).toBe(true);
  });

  it("rejects an invalid digest", () => {
    expect(
      jobResultSchema.safeParse({ status: "succeeded", artifact: { ...artifact, sha256: "xyz" } })
        .success,
    ).toBe(false);
  });

  it("caps graph query depth", () => {
    expect(graphQuerySchema.safeParse({ entity_id: "a", depth: 4 }).success).toBe(false);
    expect(graphQuerySchema.safeParse({ entity_id: "a" }).data?.depth).toBe(1);
  });

  it("rejects oversized pairing codes", () => {
    expect(exchangePairingCodeSchema.safeParse({ code: "x".repeat(33), name: "host" }).success).toBe(
      false,
    );
  });
});
