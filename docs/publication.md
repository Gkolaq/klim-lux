# Klim-Lux: publication and source synchronization

The public origin is https://www.klim-lux.com. Active locales are PL, RU, and EN; retired BE/UK routes redirect to RU. The existing Site and persistent bindings are identified by `.openai/hosting.json`.

## Source synchronization

- Keep a verified production source baseline and a reviewed diff.
- Prepare public source in a separate local copy. Import only the approved sanitized tree onto `recovery/klim-lux-2-20261016` with its existing GitHub parent. Preserve the `main` branch; review the source import through its pull request before any later merge.
- Do not publish Sites ancestry or private operational history. A GitHub source import does not deploy the Site or migrate its data.
- Keep runtime credentials and editor access settings in the existing Sites configuration.

## Site releases

Use the supported Sites source workflow for the same project. Verify the exact successful publication and source commit before auditing production. Run the checks appropriate to the change, save the exact source version, and deploy only when the release is authorized.

Follow `docs/release.md` for verification and smoke checks. Preserve existing DNS and verified integrations unless a specific required change has been reviewed.

## Recovery scope

Source files, saved CMS content, and uploaded media are distinct recovery inputs. A source archive or CMS JSON alone is not a complete backup of the other inputs. Read `docs/work-state.json` for the status of the current local proposal.
