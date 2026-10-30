import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  dodoConfigured,
  getCreditProducts,
  paymentConfigurationIssues,
  serverConfig,
} from "@/lib/config";
import { getCreditTotals } from "@/lib/services/credits";
import { listCreditPacks } from "@/lib/services/credit-packs";
import type {
  ArtifactRow,
  AiProjectOption,
  CompanionRow,
  CreditBalance,
  CreditPack,
  CreditTransaction,
  CreditTransactionFilter,
  FindingRow,
  FindingWithProject,
  JobRow,
  JobWithProject,
  PaymentDetail,
  PaymentRow,
  ProjectListItem,
  ProjectPageData,
  ProjectSummary,
  TargetRow,
  UserProfile,
} from "@/lib/types";

function emptyBalance(): CreditBalance {
  return { available: 0, reserved: 0, total: 0 };
}

type SupabaseOperationError = { code?: string; message?: string };

function dataFailure(operation: string, error: SupabaseOperationError): Error {
  console.error(`[server-data] ${operation} failed`, {
    code: error.code ?? "unknown",
    message: error.message ?? "Unknown database error",
  });
  return new Error(`Unable to load ${operation}`);
}

async function currentClient() {
  return createSupabaseServerClient();
}

export const getSessionUser = cache(async (): Promise<User | null> => {
  if (!hasSupabaseConfig()) return null;
  const supabase = await currentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getViewer = cache(async (): Promise<{
  user: User;
  profile: UserProfile;
  credits: CreditBalance;
} | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await currentClient();

  const [profileResult, accountResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("credit_accounts")
      .select("available, reserved")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (profileResult.error) throw dataFailure("viewer profile", profileResult.error);
  if (accountResult.error) throw dataFailure("viewer credit balance", accountResult.error);

  const profile = profileResult.data;
  const account = accountResult.data;
  const available = account?.available ?? 0;
  const reserved = account?.reserved ?? 0;

  return {
    user,
    profile: {
      id: user.id,
      email: profile?.email ?? user.email ?? null,
      display_name: profile?.display_name ?? null,
    },
    credits: { available, reserved, total: available + reserved },
  };
});

export async function getOpenJobCount(userId: string): Promise<number> {
  const supabase = await currentClient();
  const { count } = await supabase
    .from("analysis_jobs")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .in("status", ["queued", "claimed", "running"]);
  return count ?? 0;
}

export async function getCompanions(userId: string): Promise<CompanionRow[]> {
  const supabase = await currentClient();
  const { data } = await supabase
    .from("companions")
    .select(
      "id, name, platform, version, capabilities, status, paired_at, last_seen_at, revoked_at",
    )
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as CompanionRow[];
}

async function getProjects(userId: string): Promise<ProjectSummary[]> {
  const supabase = await currentClient();
  const { data } = await supabase
    .from("projects")
    .select("id, name, description, created_at, updated_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as ProjectSummary[];
}

async function getRecentJobs(userId: string, limit = 500): Promise<JobRow[]> {
  const supabase = await currentClient();
  const { data } = await supabase
    .from("analysis_jobs")
    .select(
      "id, project_id, companion_id, target_id, workflow, status, progress, error_code, error_message, result_summary, created_at, claimed_at, started_at, finished_at",
    )
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as JobRow[];
}

async function getFindingCounts(userId: string): Promise<Map<string, number>> {
  const supabase = await currentClient();
  const counts = new Map<string, number>();
  const pageSize = 1000;

  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await supabase
      .from("findings")
      .select("project_id")
      .eq("owner_id", userId)
      .range(offset, offset + pageSize - 1);
    if (error || !data) break;
    for (const row of data as { project_id: string }[]) {
      counts.set(row.project_id, (counts.get(row.project_id) ?? 0) + 1);
    }
    if (data.length < pageSize) break;
  }

  return counts;
}

function withProjectListItems(
  projects: ProjectSummary[],
  jobs: JobRow[],
  findingCounts: Map<string, number>,
): ProjectListItem[] {
  const latestByProject = new Map<string, JobRow>();
  for (const job of jobs) {
    if (!latestByProject.has(job.project_id)) latestByProject.set(job.project_id, job);
  }
  return projects.map((project) => ({
    ...project,
    finding_count: findingCounts.get(project.id) ?? 0,
    latest_job: latestByProject.get(project.id) ?? null,
  }));
}

export async function getProjectList(userId: string): Promise<ProjectListItem[]> {
  const [projects, jobs, counts] = await Promise.all([
    getProjects(userId),
    getRecentJobs(userId),
    getFindingCounts(userId),
  ]);
  return withProjectListItems(projects, jobs, counts);
}

export async function getOverviewData(userId: string) {
  const supabase = await currentClient();
  const [projects, jobs, counts, findingCounts] = await Promise.all([
    getProjects(userId),
    getRecentJobs(userId, 30),
    Promise.all([
      supabase
        .from("projects")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
      supabase
        .from("analysis_jobs")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("status", "succeeded"),
      supabase
        .from("analysis_jobs")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .in("status", ["queued", "claimed", "running"]),
      supabase
        .from("findings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId),
    ]),
    getFindingCounts(userId),
  ]);

  return {
    projects: withProjectListItems(projects, jobs, findingCounts),
    recentJobs: jobs.slice(0, 8),
    metrics: {
      projects: counts[0].count ?? projects.length,
      completed: counts[1].count ?? 0,
      open: counts[2].count ?? 0,
      findings: counts[3].count ?? 0,
    },
  };
}

export async function getProjectsView(userId: string) {
  return getProjectList(userId);
}

export async function getGlobalJobs(userId: string): Promise<{
  jobs: JobWithProject[];
  projects: ProjectSummary[];
  total: number;
  counts: { open: number; succeeded: number; failed: number };
}> {
  const supabase = await currentClient();
  const [jobs, projects, total, open, succeeded, failed] = await Promise.all([
    getRecentJobs(userId),
    getProjects(userId),
    supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
    supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .in("status", ["queued", "claimed", "running"]),
    supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "succeeded"),
    supabase
      .from("analysis_jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("status", "failed"),
  ]);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  return {
    jobs: jobs.map((job) => ({ ...job, project_name: names.get(job.project_id) ?? "Unknown project" })),
    projects,
    total: total.count ?? jobs.length,
    counts: {
      open: open.count ?? 0,
      succeeded: succeeded.count ?? 0,
      failed: failed.count ?? 0,
    },
  };
}

const FINDING_CLASS_KEYS = [
  "observed",
  "verified_relationship",
  "inferred",
  "ai_interpretation",
  "proposed_code",
] as const;

export async function getGlobalFindings(
  userId: string,
  limit = 500,
): Promise<{
  findings: FindingWithProject[];
  projects: ProjectSummary[];
  total: number;
  classCounts: Record<string, number>;
}> {
  const supabase = await currentClient();
  const [result, projects, total, ...classResults] = await Promise.all([
    supabase
      .from("findings")
      .select(
        "id, job_id, project_id, class, category, title, detail, confidence, evidence, created_at",
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    getProjects(userId),
    supabase
      .from("findings")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId),
    ...FINDING_CLASS_KEYS.map((findingClass) =>
      supabase
        .from("findings")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .eq("class", findingClass),
    ),
  ]);
  const names = new Map(projects.map((project) => [project.id, project.name]));
  return {
    findings: ((result.data ?? []) as FindingRow[]).map((finding) => ({
      ...finding,
      project_name: names.get(finding.project_id) ?? "Unknown project",
    })),
    projects,
    total: total.count ?? (result.data?.length ?? 0),
    classCounts: Object.fromEntries(
      FINDING_CLASS_KEYS.map((findingClass, index) => [
        findingClass,
        classResults[index]?.count ?? 0,
      ]),
    ),
  };
}

export async function getProjectPageData(
  userId: string,
  projectId: string,
): Promise<ProjectPageData | null> {
  const supabase = await currentClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, created_at, updated_at")
    .eq("id", projectId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!project) return null;

  const [targets, jobs, companions, findings, artifacts, account] = await Promise.all([
    supabase
      .from("analysis_targets")
      .select("id, kind, label, target_path, target_digest, metadata, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("analysis_jobs")
      .select(
        "id, project_id, companion_id, target_id, workflow, status, progress, error_code, error_message, result_summary, created_at, claimed_at, started_at, finished_at",
      )
      .eq("project_id", projectId)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("companions")
      .select(
        "id, name, platform, version, capabilities, status, paired_at, last_seen_at, revoked_at",
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("findings")
      .select(
        "id, job_id, project_id, class, category, title, detail, confidence, evidence, created_at",
      )
      .eq("project_id", projectId)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("analysis_artifacts")
      .select("job_id, project_id, sha256, size_bytes, content_type, created_at")
      .eq("project_id", projectId)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("credit_accounts")
      .select("available, reserved")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const available = account.data?.available ?? 0;
  const reserved = account.data?.reserved ?? 0;

  return {
    project: project as ProjectSummary,
    targets: (targets.data ?? []) as TargetRow[],
    jobs: (jobs.data ?? []) as JobRow[],
    companions: (companions.data ?? []) as CompanionRow[],
    findings: (findings.data ?? []) as FindingRow[],
    artifacts: (artifacts.data ?? []) as ArtifactRow[],
    credits: { available, reserved, total: available + reserved },
    chat_cost: serverConfig.credits.aiChat,
    codegen_cost: serverConfig.credits.codegen,
  };
}

export async function getFindingData(userId: string, findingId: string) {
  const supabase = await currentClient();
  const { data: finding } = await supabase
    .from("findings")
    .select(
      "id, job_id, project_id, class, category, title, detail, confidence, evidence, created_at",
    )
    .eq("id", findingId)
    .eq("owner_id", userId)
    .maybeSingle();

  if (!finding) return null;
  const typed = finding as FindingRow;

  const [{ data: project }, { data: job }, { data: artifact }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, description, created_at, updated_at")
      .eq("id", typed.project_id)
      .eq("owner_id", userId)
      .maybeSingle(),
    supabase
      .from("analysis_jobs")
      .select(
        "id, project_id, companion_id, target_id, workflow, status, progress, error_code, error_message, result_summary, created_at, claimed_at, started_at, finished_at",
      )
      .eq("id", typed.job_id)
      .eq("owner_id", userId)
      .maybeSingle(),
    supabase
      .from("analysis_artifacts")
      .select("job_id, project_id, sha256, size_bytes, content_type, created_at")
      .eq("job_id", typed.job_id)
      .eq("owner_id", userId)
      .maybeSingle(),
  ]);

  if (!project) return null;

  return {
    finding: typed,
    project: project as ProjectSummary,
    job: (job as JobRow | null) ?? null,
    artifact: (artifact as ArtifactRow | null) ?? null,
  };
}

export async function getUsageData(userId: string) {
  const supabase = getSupabaseAdmin();
  const [accountResult, transactionsResult, paymentsResult] = await Promise.all([
    supabase
      .from("credit_accounts")
      .select("available, reserved")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("credit_transactions")
      .select(
        "id, kind, amount, delta, balance_after, reference_type, reference_id, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
    supabase
      .from("payments")
      .select(
        "id, provider, provider_payment_id, checkout_session_id, product_id, credits, amount, currency, status, metadata, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  if (accountResult.error) throw dataFailure("usage credit balance", accountResult.error);
  if (transactionsResult.error) {
    throw dataFailure("usage credit transactions", transactionsResult.error);
  }
  if (paymentsResult.error) throw dataFailure("usage payments", paymentsResult.error);

  const account = accountResult.data;
  const transactions = transactionsResult.data;
  const payments = paymentsResult.data;

  let products: { id: string; credits: number }[] = [];
  try {
    products = Object.entries(getCreditProducts()).map(([id, product]) => ({
      id,
      credits: product.credits,
    }));
  } catch {
    products = [];
  }

  const available = account?.available ?? 0;
  const reserved = account?.reserved ?? 0;

  return {
    credits: { available, reserved, total: available + reserved } as CreditBalance,
    transactions: (transactions ?? []) as CreditTransaction[],
    payments: (payments ?? []) as PaymentRow[],
    products,
    paymentsConfigured: dodoConfigured(),
    chatCost: serverConfig.credits.aiChat,
    codegenCost: serverConfig.credits.codegen,
  };
}

const PAYMENT_COLUMNS =
  "id, provider, provider_payment_id, checkout_session_id, product_id, credits, amount, currency, status, metadata, created_at, updated_at";
const TRANSACTION_COLUMNS =
  "id, kind, amount, delta, balance_after, reference_type, reference_id, created_at";

function normalizeTransactionFilter(value: string | undefined): CreditTransactionFilter {
  return value === "added" || value === "consumed" ? value : "all";
}

export async function getPaymentsOverview(userId: string): Promise<{
  credits: CreditBalance;
  totals: { purchased: number; consumed: number; entries: number };
  successfulPayments: number;
  packs: CreditPack[];
  recentPayments: PaymentRow[];
  recentTransactions: CreditTransaction[];
  paymentConfigurationIssues: string[];
}> {
  const supabase = getSupabaseAdmin();
  const [account, totals, successfulPayments, packs, payments, transactions] =
    await Promise.all([
      supabase
        .from("credit_accounts")
        .select("available, reserved")
        .eq("user_id", userId)
        .maybeSingle(),
      getCreditTotals(userId),
      supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "succeeded"),
      listCreditPacks(),
      supabase
        .from("payments")
        .select(PAYMENT_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("credit_transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  if (account.error) throw dataFailure("payments overview balance", account.error);
  if (successfulPayments.error) {
    throw dataFailure("payments overview success count", successfulPayments.error);
  }
  if (payments.error) throw dataFailure("payments overview recent payments", payments.error);
  if (transactions.error) {
    throw dataFailure("payments overview recent transactions", transactions.error);
  }

  const available = account.data?.available ?? 0;
  const reserved = account.data?.reserved ?? 0;

  return {
    credits: { available, reserved, total: available + reserved },
    totals,
    successfulPayments: successfulPayments.count ?? 0,
    packs,
    recentPayments: (payments.data ?? []) as PaymentRow[],
    recentTransactions: (transactions.data ?? []) as CreditTransaction[],
    paymentConfigurationIssues: paymentConfigurationIssues(),
  };
}

export async function getPaymentHistory(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<{ payments: PaymentRow[]; total: number; limit: number; offset: number }> {
  const supabase = getSupabaseAdmin();
  const [payments, total] = await Promise.all([
    supabase
      .from("payments")
      .select(PAYMENT_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (payments.error) throw dataFailure("payment history", payments.error);
  if (total.error) throw dataFailure("payment history count", total.error);

  return {
    payments: (payments.data ?? []) as PaymentRow[],
    total: total.count ?? 0,
    limit,
    offset,
  };
}

export async function getCreditTransactionHistory(
  userId: string,
  filter: string | undefined,
  limit = 50,
  offset = 0,
): Promise<{
  transactions: CreditTransaction[];
  total: number;
  filter: CreditTransactionFilter;
  limit: number;
  offset: number;
}> {
  const normalized = normalizeTransactionFilter(filter);
  const supabase = getSupabaseAdmin();

  let rowsQuery = supabase
    .from("credit_transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("user_id", userId);
  let countQuery = supabase
    .from("credit_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (normalized === "added") {
    rowsQuery = rowsQuery.gt("delta", 0);
    countQuery = countQuery.gt("delta", 0);
  } else if (normalized === "consumed") {
    rowsQuery = rowsQuery.lt("delta", 0);
    countQuery = countQuery.lt("delta", 0);
  }

  const [transactions, total] = await Promise.all([
    rowsQuery.order("created_at", { ascending: false }).range(offset, offset + limit - 1),
    countQuery,
  ]);

  if (transactions.error) {
    throw dataFailure("credit transaction history", transactions.error);
  }
  if (total.error) throw dataFailure("credit transaction history count", total.error);

  return {
    transactions: (transactions.data ?? []) as CreditTransaction[],
    total: total.count ?? 0,
    filter: normalized,
    limit,
    offset,
  };
}

export async function getPaymentDetail(
  userId: string,
  paymentId: string,
): Promise<PaymentDetail | null> {
  const supabase = getSupabaseAdmin();
  const paymentResult = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (paymentResult.error) throw dataFailure("payment detail", paymentResult.error);
  if (!paymentResult.data) return null;
  const typedPayment = paymentResult.data as PaymentRow;

  const [checkout, transaction] = await Promise.all([
    typedPayment.checkout_session_id
      ? supabase
          .from("checkout_sessions")
          .select(
            "id, product_id, credits, expected_amount, expected_currency, status, created_at",
          )
          .eq("id", typedPayment.checkout_session_id)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    typedPayment.provider_payment_id
      ? supabase
          .from("credit_transactions")
          .select(TRANSACTION_COLUMNS)
          .eq("user_id", userId)
          .eq("reference_type", "purchase")
          .eq("reference_id", typedPayment.provider_payment_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if ("error" in checkout && checkout.error) {
    throw dataFailure("payment detail checkout", checkout.error);
  }
  if ("error" in transaction && transaction.error) {
    throw dataFailure("payment detail credit transaction", transaction.error);
  }

  return {
    payment: typedPayment,
    checkout: (checkout.data ?? null) as PaymentDetail["checkout"],
    transaction: (transaction.data ?? null) as CreditTransaction | null,
  };
}

export async function getSettingsData(userId: string) {
  const [companions, viewer] = await Promise.all([getCompanions(userId), getViewer()]);
  return {
    companions,
    credits: viewer?.credits ?? emptyBalance(),
    artifactBucket: serverConfig.artifactBucket,
    maxArtifactBytes: serverConfig.maxArtifactBytes,
  };
}

export async function getAiProjectOptions(userId: string): Promise<AiProjectOption[]> {
  const projects = await getProjects(userId);
  return projects.map((project) => ({ id: project.id, name: project.name }));
}
