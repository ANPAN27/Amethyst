import type { NextRequest } from "next/server";
import { authenticateCompanion } from "@/lib/services/companions";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return withRouteHandler(async () => {
    const companion = await authenticateCompanion(request);
    await enforceRateLimit(companion.id, "companion:claim", 3600, 3600);

    const admin = getSupabaseAdmin();
    const { data, error } = await admin.rpc("claim_next_job", {
      p_companion_id: companion.id,
      p_owner_id: companion.owner_id,
    });

    if (error) throw error;

    const job = Array.isArray(data) ? data[0] : null;
    if (!job) return jsonOk({ job: null });

    const { data: target, error: targetError } = job.target_id
      ? await admin
          .from("analysis_targets")
          .select("id, kind, label, target_path")
          .eq("id", job.target_id)
          .eq("project_id", job.project_id)
          .maybeSingle()
      : { data: null, error: null };

    if (targetError) throw targetError;

    return jsonOk({
      job: {
        id: job.id,
        project_id: job.project_id,
        workflow: job.workflow,
        params: job.params,
        target: target
          ? { id: target.id, kind: target.kind, label: target.label, path: target.target_path }
          : null,
        created_at: job.created_at,
      },
    });
  });
}
