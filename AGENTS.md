# Repository instructions

- Keep local development and the shared `gh` login on the EMU account
  `eonlee_microsoft`. Never switch or log out the shared account for a session.
- Git already loads `~/.gitconfig-eonlee-auth` for this repository. Use ordinary
  `git fetch` and `git push`; do not include that file again, because doing so
  duplicates the authentication header.
- For authorized GitHub API, PR, and merge commands, use the existing `EON-LEE`
  keyring credential as `GH_TOKEN` only in the command process. Follow the
  command-scoped authentication example in `README.md`.
- Do not change global or shared repository credential configuration. Do not
  print or store tokens. If credentials are missing, stop and ask the user.
- Work only in the assigned worktree and its feature branch. Do not edit the
  main checkout or revert another session's changes.
- Keep changes and commit messages concise. Stage only intended files, push the
  feature branch, and merge only with user authorization. Never force-push or
  bypass branch protection.
- The application uses Node 24, native HTTP/browser APIs and sharp. Run
  `npm test` and `npm run check` for application changes.
- Only Azure-managed Sunburst and explicitly configured MAI Image 2.6 edits are
  supported. Do not add external inference, hidden fallbacks, or paid retries.
- Keep inference disabled until the user approves the deployment account and
  cost. Do not change shared Azure login/defaults or deploy without authorization.
- Never log or commit photos, access tokens, Azure keys, or raw provider errors.
