# NC-20260915-003 Cloud Run caller subject readback

Date: 2026-09-15

Mode: read-only Google Cloud IAM console

The dedicated development runtime service account
`tandem-identity-runtime-dev@tandem-identity-dev-2026.iam.gserviceaccount.com`
is enabled, has no user-managed keys, and has immutable OAuth 2 / service-account
subject ID `114536406241819905948`.

This value was independently read from Google Cloud IAM before gateway source or
ingress activation. It is not learned from an incoming token. The gateway policy
must pin issuer, exact audience, service-account email, verified-email flag and
this subject.

No IAM, key, credential, service account, project or runtime state changed.
