---
name: open-pr
description: >
  Branch, commit, push, and open a GitHub pull request for Easy Rent against the
  user's OWN fork. Use when the task is "push my changes", "open a PR", "create a
  pull request", or "commit and push". Guards against the fork trap where
  `gh pr create` defaults the base to the upstream `nextjs/saas-starter`, and
  never stores or echoes credentials.
---

# Open a PR (safely, against the fork)

This repo is a **fork of `nextjs/saas-starter`**. The #1 hazard: `gh pr create`
defaults `--base` to the **upstream parent**, opening a public PR on the
open-source project with private code. Always pin the repo.

## Steps

### 1. Check state
```bash
git status --short
git branch --show-current
git log --oneline -5
```

### 2. Branch if on `main`
Never commit to the default branch.
```bash
git checkout -b feature/<kebab-name>
```

### 3. Stage deliberately
Add only files belonging to the change. **Exclude local tooling config** unless asked:
`.claude/settings.local.json`, `.claude/agents/`, `.claude/skills/`. Prefer explicit paths over `git add -A`.

### 4. Commit
```bash
git commit -m "$(cat <<'EOF'
<imperative subject>

<what changed and why>

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

### 5. Push
```bash
git push -u origin feature/<kebab-name>
```

### 6. Create the PR — PIN THE REPO
```bash
gh pr create \
  --repo gayanSandamal/stay-rental-supabase-boilerplate \
  --base main \
  --head feature/<kebab-name> \
  --title "<title>" \
  --body "$(cat <<'EOF'
## Summary
...

## Key changes
...

## Required before merge/deploy
- e.g. `pnpm db:migrate-all` if there is a schema migration

## Test plan
- [x] pnpm build
- [x] tsc --noEmit
- [ ] manual checks

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### 7. Verify
The printed URL must be `github.com/gayanSandamal/stay-rental-supabase-boilerplate/...`.
If it landed on `nextjs/saas-starter`, close it at once:
```bash
gh pr close <n> --repo nextjs/saas-starter --comment "Opened against fork parent by mistake."
```
then re-run step 6.

## Auth & credentials
- `gh` is already authenticated (keyring). You rarely need a token.
- If the user pastes a PAT: **never** write it to a file, remote URL, or `.claude/` config, and never echo it. Warn that it is compromised and should be revoked at https://github.com/settings/tokens.

## Easy Rent PR-body reminders
- Schema change? Call out `pnpm db:migrate-all` (numbered SQL files are the deployed schema; `db:generate` alone does not deploy).
- New admin action? Mention the new `audit_action` enum value.
- Record `pnpm build` / `tsc --noEmit` results in the Test plan.
