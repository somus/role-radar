import type { Database } from "bun:sqlite";

export type ScoreInvalidationResult = {
  deletedScores: number;
  deletedReasoning: number;
  requeuedJobs: number;
};

export function invalidateScoresAndRequeueJobs(
  db: Database,
  profileId: number,
): ScoreInvalidationResult {
  const deletedScores = Number(
    db.query("DELETE FROM scores WHERE profile_id = ?").run(profileId).changes,
  );
  const deletedReasoning = Number(
    db.query("DELETE FROM llm_reasoning WHERE profile_id = ?").run(profileId).changes,
  );
  const requeuedJobs = Number(
    db.query(
      `UPDATE jobs
       SET status = 'ready_for_scoring', updated_at = datetime('now')
       WHERE status IN ('ready', 'score_failed', 'scoring')`,
    ).run().changes,
  );

  return { deletedScores, deletedReasoning, requeuedJobs };
}
