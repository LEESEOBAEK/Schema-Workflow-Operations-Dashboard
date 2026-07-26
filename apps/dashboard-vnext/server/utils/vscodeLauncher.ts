export function buildVSCodeFolderUri(projectRoot: string): string {
  const normalized = projectRoot.replaceAll('\\', '/')
  return `vscode://file/${encodeURI(normalized)}`
}
