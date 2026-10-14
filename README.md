# virtual-try-on-azure

Virtual try-on on Azure. Application scope and architecture are not decided yet.
This initial setup establishes the Git workflow only.

## Accounts

| Purpose | Account |
| --- | --- |
| Local development and the shared Copilot/`gh` session | `eonlee_microsoft` (EMU) |
| Authorized writes to this personal repository | `EON-LEE` |

Keep the shared login unchanged. Do not run `gh auth switch`, `gh auth logout`,
`gh auth setup-git`, or change global Git credential settings for a session.
If authentication is missing, stop and coordinate with the user before logging in.
Never print, persist, or commit tokens.

## Git workflow

1. Work on the session's feature branch, not in the main checkout.
2. Review the diff and run the checks relevant to the change.
3. Commit only the intended files with a short, descriptive message.
4. Push the feature branch using the existing URL-scoped `EON-LEE` Git configuration.
5. Merge only when the user authorizes it. Prefer a pull request and squash merge
   for application changes. For an explicitly authorized initial setup, a
   non-force fast-forward push of the feature commit to `main` is sufficient.
6. Confirm the remote contains the expected commit and the working tree is clean.

Git already loads the URL-scoped authentication header from
`~/.gitconfig-eonlee-auth` for this repository. Use ordinary `git fetch` and
`git push`; do not add a second `include.path` for that file. Including it twice
produces a duplicate `Authorization` header and an HTTP 400 error.

The following PowerShell example checks the command-scoped GitHub write identity
and pushes the current branch through the existing Git configuration. It requires
an `EON-LEE` credential in the `gh` keyring. It leaves both the shared login and
the existing authentication file unchanged.

```powershell
$previousToken = $env:GH_TOKEN
try {
    $authConfig = Join-Path $HOME '.gitconfig-eonlee-auth'
    if (-not (Test-Path $authConfig)) {
        throw 'Existing EON-LEE Git authentication file is unavailable.'
    }
    $token = gh auth token --hostname github.com --user EON-LEE
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
        throw 'EON-LEE credentials are unavailable. Do not change the shared login.'
    }
    $env:GH_TOKEN = $token
    $login = gh api user --jq .login
    if ($LASTEXITCODE -ne 0 -or $login -ne 'EON-LEE') {
        throw 'Unexpected GitHub write identity.'
    }
    git push --set-upstream origin HEAD
    if ($LASTEXITCODE -ne 0) {
        throw 'Feature branch push failed.'
    }
}
finally {
    $env:GH_TOKEN = $previousToken
    Remove-Variable token -ErrorAction SilentlyContinue
}
```

Use the same command-scoped identity for authorized PR and merge operations.
If permissions or branch protection block a write, report the error; do not
switch the shared account, force-push, or bypass protection.