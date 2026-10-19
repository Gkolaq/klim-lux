# Klim-Lux: technical context

Klim-Lux / Klim & Co is the furniture workshop website at https://www.klim-lux.com. Public business details are maintained in `src/config/site.ts` and the CMS content.

## Application

- Astro with the Cloudflare adapter, TypeScript, Zod, and Drizzle. Use `package.json` and the lockfile for exact versions and commands.
- PL, RU, and EN are active. Retired BE/UK addresses redirect to RU. Preserve existing routes, authored text, real photographs, and intentional visibility settings.
- `.openai/hosting.json` identifies the existing Site and the D1 `DB` / R2 `BUCKET` bindings. Do not create a replacement Site to synchronize source code.
- `src/data/content.ts` supplies defaults when no saved CMS content exists. Saved content and uploads are runtime data and require separate backups.

## Source status

`docs/work-state.json` records the verified source snapshot of Sites v41 used for this public export. Application code, real photographs and asset metadata match that source exactly; seven operational documents are sanitized for publication. This snapshot is not a permanent live-version pointer. Resolve the native Sites publication and GitHub branch head before future work. GitHub import preserves the existing GitHub ancestry and does not publish or migrate the Site.

Follow `AGENTS.md` and `docs/release.md` for source verification, targeted checks, and releases. Keep credentials and personal or account history outside public source documents.
