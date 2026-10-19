import { z } from "zod";

export const WORKFLOWS = [
  "analyze_javascript_application",
  "inspect_managed_artifact",
  "inspect_sqlite_database",
  "inspect_go_binary",
  "inspect_rust_binary",
] as const;

export const workflowSchema = z.enum(WORKFLOWS);

export const findingClassSchema = z.enum([
  "observed",
  "verified_relationship",
  "inferred",
  "ai_interpretation",
  "proposed_code",
]);

const uuid = z.string().uuid();
const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const createProjectSchema = z.object({
  name: trimmed(120),
  description: z.string().trim().max(2000).optional(),
});

export const updateProjectSchema = z
  .object({
    name: trimmed(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const createTargetSchema = z.object({
  kind: trimmed(60),
  label: trimmed(200),
  target_path: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => value.startsWith("/") || /^[A-Za-z]:\\/.test(value), {
      message: "target_path must be an absolute local path",
    }),
  target_digest: z.string().max(128).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createJobSchema = z.object({
  workflow: workflowSchema,
  target_id: uuid,
  companion_id: uuid,
  // Workflow parameters are allowlisted below; opaque additional keys are not
  // accepted so a job can never smuggle arbitrary CLI arguments.
  params: z
    .object({
      table: z.string().trim().max(200).optional(),
    })
    .strict()
    .optional(),
  idempotency_key: z.string().trim().min(8).max(200).optional(),
});

export const evidenceItemSchema = z.object({
  source: z.string().max(200).optional(),
  path: z.string().max(2000).optional(),
  digest: z.string().max(128).optional(),
  note: z.string().max(4000).optional(),
  line: z.number().int().min(0).optional(),
});

export const submittedFindingSchema = z.object({
  class: findingClassSchema,
  category: z.string().trim().max(80).optional(),
  title: trimmed(500),
  detail: z.string().max(20000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(evidenceItemSchema).max(50).optional(),
});

export const graphEntitySchema = z.object({
  id: trimmed(300),
  type: trimmed(80),
  label: trimmed(300).optional(),
  properties: z.record(z.unknown()).optional(),
});

export const graphEdgeSchema = z.object({
  from: trimmed(300),
  to: trimmed(300),
  type: trimmed(80),
  properties: z.record(z.unknown()).optional(),
});

export const jobResultSchema = z
  .object({
    status: z.enum(["succeeded", "failed"]),
    error: z
      .object({
        code: z.string().trim().max(80).optional(),
        message: z.string().trim().max(2000).optional(),
      })
      .optional(),
    summary: z.record(z.unknown()).optional(),
    artifact: z
      .object({
        path: z.string().min(1).max(1024),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        size_bytes: z.number().int().min(0).max(50 * 1024 * 1024),
      })
      .optional(),
    findings: z.array(submittedFindingSchema).max(5000).optional(),
    graph: z
      .object({
        entities: z.array(graphEntitySchema).max(5000).default([]),
        edges: z.array(graphEdgeSchema).max(10000).default([]),
      })
      .optional(),
    rea: z
      .object({
        version: z.string().max(60).optional(),
        workflow: z.string().max(80).optional(),
        duration_ms: z.number().int().min(0).max(86_400_000).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "succeeded" && !value.artifact) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A succeeded job must include an artifact reference",
        path: ["artifact"],
      });
    }
  });

export const jobProgressSchema = z.object({
  progress: z.number().int().min(0).max(99),
  message: z.string().trim().max(500).optional(),
});

export const createPairingCodeSchema = z.object({
  companion_name: z.string().trim().max(120).optional(),
});

export const exchangePairingCodeSchema = z.object({
  code: trimmed(32),
  name: trimmed(120),
  platform: z.string().trim().max(120).optional(),
  version: z.string().trim().max(60).optional(),
  capabilities: z.array(z.string().trim().max(80)).max(50).optional(),
});

export const aiChatSchema = z.object({
  question: trimmed(8000),
  finding_ids: z.array(uuid).max(20).optional(),
});

export const aiCodegenSchema = z.object({
  instructions: trimmed(8000),
  finding_ids: z.array(uuid).max(20).optional(),
  language: z.string().trim().max(60).optional(),
});

export const graphQuerySchema = z.object({
  entity_id: trimmed(300),
  depth: z.number().int().min(1).max(3).default(1),
});

export const checkoutSchema = z.object({
  product_id: trimmed(200),
});

export const artifactUploadSchema = z.object({
  content_type: z.literal("application/json").default("application/json"),
});
