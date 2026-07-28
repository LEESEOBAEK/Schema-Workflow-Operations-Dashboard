import { describe, expect, it } from 'vitest'
import type { WorkflowRun } from '../shared/types/dashboard'
import { needsReview, needsUserReview } from '../app/utils/runReviewState'

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    run_id: 'run-1',
    status: 'pass',
    platform: 'codex',
    next_action: 'none',
    evidence_count: 1,
    artifact_count: 1,
    ...overrides,
  } as WorkflowRun
}

describe('run review state', () => {
  it('counts a passed but unreviewed run as needing review', () => {
    expect(needsUserReview(run())).toBe(true)
    expect(needsReview(run())).toBe(true)
  })

  it('does not keep an approved passed run in the review queue', () => {
    expect(needsUserReview(run({ review_status: 'approved' }))).toBe(false)
    expect(needsReview(run({ review_status: 'approved' }))).toBe(false)
  })

  it('keeps non-pass runs in the review queue regardless of user review metadata', () => {
    expect(needsUserReview(run({ status: 'evidence_insufficient', review_status: 'approved' }))).toBe(false)
    expect(needsReview(run({ status: 'evidence_insufficient', review_status: 'approved' }))).toBe(true)
  })
})
