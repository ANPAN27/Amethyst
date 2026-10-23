import "server-only";

import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { getCreditProducts, serverConfig } from "@/lib/config";
import type {
  ArtifactRow,
  AiProjectOption,
  CompanionRow,
  CreditBalance,
  CreditTransaction,
  FindingRow,
  FindingWithProject,
  JobRow,
  JobWithProject,
  ProjectListItem,
  ProjectPageData,
  ProjectSummary,
  TargetRow,
  UserProfile,
} from "@/lib/types";

function emptyBalance(): CreditBalance {
  return { available: 0, reserved: 0, total: 0 };
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

  const [{ data: profile }, { data: account }] = await Promise.all([
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
  const supabase = await currentClient();
  const [{ data: account }, { data: transactions }] = await Promise.all([
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
  ]);

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
    products,
    paymentsConfigured: Boolean(
      process.env.DODO_PAYMENTS_API_KEY?.trim() &&
        process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() &&
        products.length > 0,
    ),
    chatCost: serverConfig.credits.aiChat,
    codegenCost: serverConfig.credits.codegen,
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
