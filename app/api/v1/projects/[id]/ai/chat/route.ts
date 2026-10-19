import type { NextRequest } from "next/server";
import { requireProject, requireUser } from "@/lib/api/auth";
import { jsonOk, withRouteHandler } from "@/lib/api/errors";
import { parseJson, parseUuid } from "@/lib/api/request";
import { aiChatSchema } from "@/lib/validation/schemas";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { answerWithEvidence, type EvidenceInput } from "@/lib/services/ai";
import { commitCredits, releaseCredits, reserveCredits } from "@/lib/services/credits";
import { serverConfig } from "@/lib/config";
import { enforceRateLimit } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  return withRouteHandler(async () => {
    const user = await requireUser(request);
    const projectId = parseUuid((await context.params).id, "project id");
    await requireProject(user, projectId);
    await enforceRateLimit(user.id, "ai:chat", 20, 3600);
    const body = await parseJson(request, aiChatSchema);
    const admin = getSupabaseAdmin();

    let query = admin
      .from("findings")
      .select("id, class, category, title, detail, evidence")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(body.finding_ids?.length ?? 30);

    if (body.finding_ids && body.finding_ids.length > 0) {
      query = query.in("id", body.finding_ids);
    }

    const { data: findingRows, error } = await query;
    if (error) throw error;

    const evidence: EvidenceInput[] = (findingRows ?? []).map((row) => ({
      id: row.id,
      class: row.class,
      category: row.category,
      title: row.title,
      detail: row.detail,
      evidence: row.evidence,
    }));

    const runId = crypto.randomUUID();
    const amount = serverConfig.credits.aiChat;
    const reservationId = await reserveCredits({
      userId: user.id,
      amount,
      idempotencyKey: `ai-run:${runId}`,
      referenceType: "ai_chat",
      referenceId: runId,
    });

    const { error: runError } = await admin.from("ai_runs").insert({
      id: runId,
      project_id: projectId,
      owner_id: user.id,
      kind: "chat",
      model: serverConfig.ai.model,
      question: body.question,
      reservation_id: reservationId,
      credits_charged: amount,
    });

    if (runError) {
      await releaseCredits(reservationId).catch(() => undefined);
      throw runError;
    }

    let creditsCommitted = false;
    try {
      const result = await answerWithEvidence({ question: body.question, evidence });
      await commitCredits(reservationId);
      creditsCommitted = true;

      const evidenceRefs = evidence
        .filter((item) => result.usedEvidenceIds.includes(item.id))
        .map((item) => ({ id: item.id, title: item.title, class: item.class }));

      const { error: updateError } = await admin
        .from("ai_runs")
        .update({
          answer: result.answer,
          grounding: result.grounding,
          evidence_refs: evidenceRefs,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
        })
        .eq("id", runId);

      if (updateError) {
        console.error("[ai] failed to persist run metadata", updateError.code);
      }

      return jsonOk({
        id: runId,
        answer: result.answer,
        grounding: result.grounding,
        cited_evidence_ids: result.citedEvidenceIds,
        assumptions: result.assumptions,
        evidence: evidenceRefs,
        credits_charged: amount,
      });
    } catch (error) {
      if (!creditsCommitted) {
        await releaseCredits(reservationId).catch(() => undefined);
      }
      throw error;
    }
  });
}
