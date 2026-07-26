import { describe, expect, it } from 'vitest'
import { buildVSCodeFolderUri } from '../server/utils/vscodeLauncher'

describe('VS Code launcher', () => {
  it('builds a local VS Code folder URI that preserves the Windows drive', () => {
    expect(buildVSCodeFolderUri('C:\\Users\\example\\Documents\\voice'))
      .toBe('vscode://file/C:/Users/example/Documents/voice')
  })

  it('encodes spaces and non-ASCII folder names', () => {
    expect(buildVSCodeFolderUri('C:\\작업 폴더\\새 프로젝트'))
      .toBe('vscode://file/C:/%EC%9E%91%EC%97%85%20%ED%8F%B4%EB%8D%94/%EC%83%88%20%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8')
  })
})
