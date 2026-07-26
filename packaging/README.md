# Schema Workflow Windows Portable Bundle

The bundle contains:

- a manifest-verified Python Engine release,
- the user-scoped Engine installer,
- the Nuxt Dashboard source and lockfile,
- production Dashboard install and start scripts.

## Requirements

- Windows PowerShell 5.1 or PowerShell 7
- Python 3.10 or newer
- Node.js with Corepack

The installer checks all three requirements and the bundle manifest before it
changes the user-scoped Engine installation.

## Install

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\Install-SchemaWorkflowBundle.ps1 `
  -Channel candidate `
  -Approved
```

## Start

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
  .\Start-SchemaWorkflowDashboard.ps1 `
  -Port 3215
```

Open `http://127.0.0.1:3215/hybrid`.

For an isolated test installation, pass the same `-InstallRoot` to both the
install and start scripts.

The Engine remains in the current user's profile. Project Skills are installed
only after the user selects a ProjectRoot and confirms installation in the
Dashboard.
