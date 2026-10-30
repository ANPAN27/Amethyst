export type CreditBalance = {
  available: number;
  reserved: number;
  total: number;
};

export type UserProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectListItem = ProjectSummary & {
  finding_count: number;
  latest_job: JobRow | null;
};

export type TargetRow = {
  id: string;
  kind: string;
  label: string;
  target_path: string;
  target_digest: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type JobRow = {
  id: string;
  project_id: string;
  companion_id: string | null;
  target_id: string | null;
  workflow: string;
  status: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  result_summary: Record<string, unknown> | null;
  created_at: string;
  claimed_at: string | null;
  started_at: string | null;
  finished_at: string | null;
};

export type JobWithProject = JobRow & {
  project_name: string;
};

export type FindingClass =
  | "observed"
  | "verified_relationship"
  | "inferred"
  | "ai_interpretation"
  | "proposed_code"
  | string;

export type FindingRow = {
  id: string;
  job_id: string;
  project_id: string;
  class: FindingClass;
  category: string | null;
  title: string;
  detail: string | null;
  confidence: number | null;
  evidence: unknown;
  created_at: string;
};

export type FindingWithProject = FindingRow & {
  project_name: string;
};

export type ArtifactRow = {
  job_id: string;
  project_id: string;
  sha256: string;
  size_bytes: number;
  content_type: string;
  created_at: string;
};

export type CompanionRow = {
  id: string;
  name: string;
  platform: string | null;
  version: string | null;
  capabilities: string[];
  status: string;
  paired_at: string;
  last_seen_at: string | null;
  revoked_at: string | null;
};

export type CreditTransaction = {
  id: string;
  kind: string;
  amount: number;
  delta: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
};

export type PaymentRow = {
  id: string;
  provider: string;
  provider_payment_id: string | null;
  checkout_session_id: string | null;
  product_id: string | null;
  credits: number | null;
  amount: number | null;
  currency: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
};

export type PaymentDetail = {
  payment: PaymentRow;
  checkout: {
    id: string;
    product_id: string;
    credits: number;
    expected_amount: number | null;
    expected_currency: string | null;
    status: string;
    created_at: string;
  } | null;
  transaction: CreditTransaction | null;
};

export type CreditPack = {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price: number | null;
  currency: string | null;
  displayOrder: number;
  recommended: boolean;
  active: boolean;
  checkoutReady: boolean;
  unavailableReason: string | null;
};

export type CreditTransactionFilter = "all" | "added" | "consumed";

export type GraphSyncRow = {
  status: string;
  vertices_upserted: number;
  edges_upserted: number;
  error_message: string | null;
  completed_at: string | null;
};

export type JobDetail = {
  job: JobRow;
  target: {
    id: string;
    kind: string;
    label: string;
    target_path?: string;
    created_at: string;
  } | null;
  graph_sync: GraphSyncRow | null;
  artifact: {
    sha256: string;
    size_bytes: number;
    content_type: string;
    created_at: string;
  } | null;
};

export type ProjectPageData = {
  project: ProjectSummary;
  targets: TargetRow[];
  jobs: JobRow[];
  companions: CompanionRow[];
  findings: FindingRow[];
  artifacts: ArtifactRow[];
  credits: CreditBalance;
  chat_cost: number;
  codegen_cost: number;
};

export type AiProjectOption = {
  id: string;
  name: string;
};
