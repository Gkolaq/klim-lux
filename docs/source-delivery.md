# Controlled GitHub → Sites delivery

Use the existing `Gkolaq/klim-lux` repository and the Site identified by
`.openai/hosting.json`. GitHub stores the public development history. Sites
keeps its own source history and remains the production publishing mechanism.

## Verified baseline — 18 October 2026

| Source | Verified identifier |
| --- | --- |
| Published Sites version | v41, source `09e1674048ca63452a6db7c7f779dc700ab4fd35` |
| Approved public snapshot | `89274ceb9cd97b48bc898064568767086b7e32ce` |
| GitHub development branch | `recovery/klim-lux-2-20261016`, PR #1 |
| GitHub main before integration | `87fbd9147837cd7151896015af22c682cb560fb7` |

These are dated baseline identifiers, not permanent live pointers. Both source
trees contain 1073 files. Their 1066 application, asset and shared instruction
files match exactly. The following seven operational documents intentionally
differ in the public export:

- `.openai/operations.md`
- `docs/contact-email-setup.md`
- `docs/launch-roadmap.md`
- `docs/project-context.md`
- `docs/publication.md`
- `docs/refactor-plan.md`
- `docs/work-state.json`

Preserve the Sites copies. A change to any of these documents needs an explicit
content review; do not silently exclude a changed file or copy the entire public
tree over Sites. Never merge the two repositories' Git histories or push private
Sites history to GitHub.

## Prepare one reviewed delta

1. Resolve the current native Site, successful publication, source commit and
   runtime revision. Open that Site with the supported Sites source helper,
   using an ordinary short-lived credential through hidden stdin. Do not opt in
   to publication on push. Preserve the existing audience and DB/BUCKET bindings.
2. In the returned Sites checkout run the existing `verify:source` command with
   the exact native project ID and published commit. Stop on a dirty checkout,
   wrong project, different source HEAD or unpublished remote changes. Keep
   owner changes and reconcile the baseline before proceeding.
3. Resolve the GitHub branch HEAD and pin the reviewed candidate and its approved
   base by full commit SHA. Require a clean GitHub checkout and confirm the base
   is an ancestor of the candidate. Confirm that this public base corresponds
   to the current Sites source, accounting only for the seven reviewed document
   differences above. Additional unexplained differences stop delivery.
4. Inspect the complete base-to-candidate diff, including additions, deletions,
   file modes and binary assets. Changes to Site identity, hosting configuration,
   bindings, dependencies, schema, permissions or runtime data require their own
   risk review. Do not use a path filter to hide unreviewed changes.
5. From the GitHub checkout create a binary-safe patch outside either source
   tree, using literal, verified SHAs and an absolute output path:

   ```text
   git diff --binary --full-index --no-ext-diff --no-textconv <base-sha> <candidate-sha>
   ```

   Capture stdout directly to the patch file. Record both SHAs, the current
   Sites source, patch SHA256 and the approved changed paths in the checkpoint.
   Never put credentials or private file contents into the public record.
6. Run `git apply --check --index /absolute/change.patch` from the clean Sites
   checkout. Recheck the guards immediately before
   `git apply --index /absolute/change.patch`. Inspect both `git diff HEAD` and
   `git status`; additions must be included in the reviewed diff. Confirm that
   the seven private documents,
   hosting configuration and unrelated files were preserved. A preparation
   check is not a remote delivery, saved Sites version or deployment.

For a documentation transfer proof, use a separate detached worktree at the
verified Sites source. With no application delta, stop after the local patch
check, exact diff and preservation checks. Do not push Sites source, save a
version or deploy for this proof; keep the main Sites checkout clean.

## Validate and release when a real change is ready

Use `docs/release.md` for checks appropriate to the actual delta. Reuse passing
checks with unchanged inputs. The supported Sites source helper owns committing,
normal push and packaging from the returned Sites checkout. Before that push,
confirm that no earlier automatic publication window remains active. Minting an
ordinary credential does not cancel an earlier window; stop before pushing if
its state is unknown. Do not use GitHub
credentials for the private Sites repository or force a rejected push.

Record the helper's exact source commit and unchanged artifact. Save that version
in the same Site. A saved version without deployment is an unpublished candidate;
publication is a separate explicit native operation under the approved release
scope. After a necessary production release, use the existing bounded smoke test
once and record its source/version/deployment mapping and rollback predecessor.

An isolated Sites Preview and runtime binding isolation have not been verified.
`current_preview_url` was null at baseline. Sites deployment URLs are production;
Vercel PR previews do not prove Sites runtime behavior. Do not deploy merely to
demonstrate integration.

Before merging PR #1 into `main`, determine the effect of the existing Vercel
integrations (`klim-lux` and `klim-lux2`) and agree the production delivery policy.
Until then, use the reviewed recovery branch, keep the PR in draft and avoid an
automatic production trigger. Do not change hosting, DNS or integrations as part
of source transfer.
