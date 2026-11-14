# Shared team and canonical GitHub workflow

## What exists now

This is one shared Replit codebase. Git was already initialized. At foundation setup, no Git remote or authorized GitHub integration was available. No GitHub repository was created, no account was connected, and no push or invitations were performed.

## Connect GitHub manually

1. The repository owner signs in to the intended GitHub account.
2. In the Replit Project Editor, open **Tools → Git**.
3. Choose **Connect to GitHub** / the GitHub connection action shown. Complete GitHub's authorization dialog with the intended account/organization. Organization approval may also be required.
4. Choose/create **one** repository, for example `earthscope`. Prefer private while access and licensing are being reviewed. Do not purchase a plan or add-on. If the interface offers only creation, create the repo there; if linking an existing repo, confirm its history before pushing.
5. Confirm this project is linked to that canonical repository. Review staged files, commit and push through the Git pane. Do not force-push or overwrite an existing unrelated history.
6. Verify the commit is visible on GitHub. Until that succeeds, GitHub synchronization is **not verified**.

For a manually configured remote, use only the real owner/repository selected above:

```sh
git remote -v
# Only when origin is absent; this is a template, not an executed command:
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin HEAD
```

Authenticate through Replit/GitHub's secure authorization flow, never paste a personal access token into chat or a remote URL. If a remote already exists, review it rather than replacing it. The GitHub API integration for Agent and the Git pane's Git transport authorization are separate capabilities.

## Invite 3–5 developers

Use **Invite** in the Project Editor header to invite each intended teammate. Use named invitations rather than a broadly shared edit link; verify project access after invitation. Grant edit access needed for coding, not owner/admin rights. For organization/workspace role choices, use the least-privileged member/custom role that permits the work. Available permission controls vary by workspace; don't upgrade merely to obtain a recommended control. Only the lead/owner should manage billing, credentials, publishing and administrative settings.

Separately invite the same developers to the canonical GitHub repository using the least-privileged role that can contribute (Write where available, not Admin). Replit access does not automatically prove GitHub access. Never share login credentials.

### Roles and ownership

| Role | Main responsibility |
|---|---|
| Lead / integration | Contracts, shared configuration, coordination, reviews, integration and release approval |
| Frontend | `artifacts/earthscope/src/`, accessibility and themes |
| Backend | `backend/`, validation, source adapters and server-only credentials |
| Geospatial | Map integration, CRS/boundaries/spatial QA in coordination with frontend/backend owners |
| AI/ML / testing | Statistical validation, evidence grounding, fixtures and regression checks |

For **three people**: (1) lead + backend/integration, (2) frontend + geospatial, (3) AI/ML + testing. For four, split geospatial from frontend or backend from lead. For five, assign each role separately.

Assign real GitHub handles in `.github/CODEOWNERS.example` before renaming it to `CODEOWNERS`; no identities have been invented. One active owner per file during shared editing. Discuss shared contract/config edits before starting them.

## Concurrent editing and review-before-merge

- The live Replit project has **one working tree**. Concurrent editors see the same files and branch.
- **Never switch, checkout, reset, rebase, stash or pull a different branch while teammates are editing that same working tree.** It changes everyone's files.
- Use one agreed integration branch for shared live editing. Do not push shared experimental changes straight to protected `main`.
- For independent work/PRs, use separate local clones or isolated workspaces tied to the same canonical GitHub repository. Branch switching is safe only in those independent working trees.
- Coordinate a pause before the lead syncs/merges the shared workspace. Inspect uncommitted changes first; never discard someone else's changes.
- Require a pull request, at least one teammate's approval, passing Python/API and TypeScript checks, and resolved review comments before merging into `main`.
- Enable branch protection/rulesets in GitHub **if available on the existing account/repository plan**: block direct pushes/force pushes and require reviews/checks. If unavailable, enforce the same rules as team policy; do not buy an upgrade.
- Commit small scoped changes. Regenerate clients after contract changes. Do not edit generated files manually.
- Never commit `.env`, secrets, raw large datasets, local dependency directories or generated screenshots.

Reference documentation consulted:
- https://docs.replit.com/build/invite-teammates
- https://docs.replit.com/features/workspace-tools/git-interface
- https://docs.replit.com/features/collaboration/workspaces
- https://docs.replit.com/teams/identity-and-access-management/groups-and-permissions
