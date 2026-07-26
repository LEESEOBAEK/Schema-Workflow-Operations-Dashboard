import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { addProject, ProjectCatalogError, readProjectCatalog, removeProject, selectProject } from '../server/utils/projectCatalogStore'

const roots: string[] = []

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'project-catalog-'))
  roots.push(root)
  return { root, catalog: join(root, 'dashboard', 'project-catalog.json') }
}

afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('project catalog store', () => {
  it('merges environment roots with catalog roots without duplicates', async () => {
    const { root, catalog } = await fixture()
    const environmentRoot = join(root, 'environment-project')
    await mkdir(environmentRoot)
    await addProject(catalog, { source_root: environmentRoot, display_name: 'Duplicate' }, [environmentRoot])
    const state = await readProjectCatalog(catalog, [environmentRoot])
    expect(state.projects).toHaveLength(1)
    expect(state.projects[0]).toMatchObject({ source_root: resolve(environmentRoot), origin: 'environment' })
  })

  it('creates a project workspace and selects it as active', async () => {
    const { root, catalog } = await fixture()
    const projectRoot = join(root, 'new-project')
    const state = await addProject(catalog, { source_root: projectRoot, display_name: '새 프로젝트', create_directory: true })
    await access(join(projectRoot, 'outputs', 'workflows'))
    expect(state.active_project_root).toBe(resolve(projectRoot))
    expect(state.projects[0]?.display_name).toBe('새 프로젝트')
  })

  it('changes the active project without touching project contents', async () => {
    const { root, catalog } = await fixture()
    const first = join(root, 'first')
    const second = join(root, 'second')
    await mkdir(first); await mkdir(second)
    await addProject(catalog, { source_root: first })
    await addProject(catalog, { source_root: second })
    const state = await selectProject(catalog, first)
    expect(state.active_project_root).toBe(resolve(first))
  })

  it('removes only the catalog entry and never deletes the project folder', async () => {
    const { root, catalog } = await fixture()
    const projectRoot = join(root, 'removable')
    await mkdir(projectRoot)
    await addProject(catalog, { source_root: projectRoot })
    const state = await removeProject(catalog, projectRoot)
    expect(state.projects).toHaveLength(0)
    await access(projectRoot)
    expect(JSON.parse(await readFile(catalog, 'utf8')).projects).toHaveLength(0)
  })

  it('does not remove an environment-owned project', async () => {
    const { root, catalog } = await fixture()
    const environmentRoot = join(root, 'environment-project')
    await mkdir(environmentRoot)
    await expect(removeProject(catalog, environmentRoot, [environmentRoot])).rejects.toBeInstanceOf(ProjectCatalogError)
  })
})
