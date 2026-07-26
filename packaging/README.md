# Schema Workflow Windows Portable Bundle

The bundle contains:

- a manifest-verified Python Engine release,
- the user-scoped Engine installer,
- the Nuxt Dashboard source, lockfile, and prebuilt server,
- production Dashboard install and start scripts.

## Requirements

- Windows PowerShell 5.1 or PowerShell 7
- Python 3.10 or newer
- Node.js

The installer checks these requirements and the bundle manifest before it
changes the user-scoped Engine installation.
Corepack is needed only as a fallback when a development bundle has no
prebuilt Dashboard.

## Install

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\Install-SchemaWorkflowBundle.ps1 `
  -Channel candidate `
  -WorkspaceRoot 'C:\SchemaWorkflowData' `
  -ProfileName default `
  -Approved
```

## Start

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\Start-SchemaWorkflowDashboard.ps1 `
  -Port 3215 `
  -ProfileName default
```

The default browser opens after the server is ready. Add `-NoBrowser` for
terminal-only operation. Use another `-ProfileName` to select a separately
installed data workspace. If the port is occupied, the launcher reports the
owning process and asks for another port.

For an isolated test installation, pass the same `-InstallRoot` to both the
install and start scripts.

The Engine remains in the current user's profile. Project Skills are installed
only after the user selects a ProjectRoot and confirms installation in the
Dashboard.
