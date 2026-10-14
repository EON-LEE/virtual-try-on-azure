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
- Application scope and architecture are not decided. Do not select a framework,
  install dependencies, or deploy Azure resources as part of Git setup.
