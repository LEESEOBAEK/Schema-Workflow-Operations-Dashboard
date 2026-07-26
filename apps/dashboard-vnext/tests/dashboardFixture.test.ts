import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
const fixture = JSON.parse(readFileSync(resolve(process.cwd(), '../../fixtures/dashboard_mock_state.json'), 'utf8'))
describe('dashboard mock fixture', () => {
  it('keeps project-session-run hierarchy', () => { expect(fixture.projects).toHaveLength(1); expect(fixture.projects[0].sessions).toHaveLength(2); expect(fixture.projects[0].sessions.flatMap((session: { runs: unknown[] }) => session.runs)).toHaveLength(3) })
  it('includes confirmed, unresolved, and conflict', () => { const states = fixture.projects[0].sessions.map((session: { relation_status: string }) => session.relation_status); expect(states).toContain('confirmed'); expect(states).toContain('unresolved'); expect(fixture.conflicts).toHaveLength(1) })
})