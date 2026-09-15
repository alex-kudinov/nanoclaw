# NC-20260915-003 gateway subject readback waiting

Date: 2026-09-15

State: waiting on owner Google Cloud passkey verification

## Result

Fresh minimum-sufficient review returned `KEEP` for one path-mounted Tailscale
Funnel route into the existing NanoClaw HTTP process, using Google-signed
service-account identity and migration-167. Tailscale 1.96.2 is present on the
Mac Mini, the peer is online, Funnel is available with an empty current
configuration, and no Cloudflare Tunnel is installed or running.

The reviewer required the Cloud Run runtime service account's immutable numeric
Google subject to be independently read and pinned before endpoint
implementation or public ingress. The current host has no Google Cloud CLI.
Google Cloud Console is authenticated as the Tandem owner account but requires
fresh passkey verification before displaying IAM service-account details. A
visible browser tab is waiting for the owner to complete that verification.

No endpoint, source implementation, IAM, Tailscale Funnel, network, Firebase
user, auth binding, Party, entitlement, provider, deployment or runtime state
changed.
