# Contact delivery configuration

The server contact endpoint is `/api/contact/`. Its configuration belongs to the existing Site runtime, not to source control.

## Runtime settings

- `RESEND_API_KEY`: private sending credential.
- `RESEND_FROM`: verified sender configured by the owner.
- `CONTACT_EMAIL_ENABLED`: activation flag.
- `EDITOR_EMAILS`: editor access configuration, managed separately through Sites settings.

Never place credential values or private account identifiers in examples, commits, or reports. Reuse the existing verified configuration when restoring source integration.

## Behavior and validation

The server fixes the recipient to the CMS business email and validates same-origin JSON, fields, quotas, and idempotency. A provider acceptance response is distinct from inbox delivery. Failure keeps the visitor's text available for retry or copying.

Use the mocked contact tests for code changes. Tests must not send real mail or modify production data. Any real delivery check is a separate, explicitly authorized action. See `docs/release.md` for the relevant checks.
