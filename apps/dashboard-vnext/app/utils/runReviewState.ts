import type { WorkflowRun } from '../../shared/types/dashboard'

export function needsUserReview(run: WorkflowRun): boolean {
  return run.status === 'pass' && (run.review_status ?? 'unreviewed') === 'unreviewed'
}

export function needsReview(run: WorkflowRun): boolean {
  return run.status !== 'pass' || needsUserReview(run)
}
