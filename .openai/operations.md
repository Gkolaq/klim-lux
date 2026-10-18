# Klim-Lux: technical operations

The existing Site identity and persistent bindings are defined in `.openai/hosting.json`. Keep that Site, public audience, D1 `DB`, R2 `BUCKET`, and the owner's content and media.

## Source and release

- Read `AGENTS.md`, `docs/project-context.md`, `docs/work-state.json`, and `docs/release.md` before work.
- Resolve the current successful publication and its source commit through the supported Sites workflow. Static documentation is a dated checkpoint.
- Verify the exact project and commit before testing a published source. Keep new, unpublished work explicitly separate.
- Use checks appropriate to the change. Keep credentials in the runtime configuration; never place credentials, personal session identifiers, or raw visitor data in source or reports.

## Data and integrations

- Source files contain default content. D1 stores saved CMS content and revisions; R2 stores uploads. A source archive does not back up all runtime data.
- Manage editor accounts and mail credentials through Sites settings. Contact tests use isolated storage and a mocked provider.
- Preserve PL, RU, and EN. Retired BE/UK routes redirect to the corresponding RU route with their query parameters.

## Public source import

Import only an approved sanitized file tree onto the existing GitHub history. This local candidate inherits Sites history and must not be pushed with that ancestry. See `docs/work-state.json` for its unpublished status and remaining work.
