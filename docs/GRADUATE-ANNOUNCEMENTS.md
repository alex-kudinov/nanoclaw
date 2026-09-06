# Graduate announcement delivery

Status: deployed and live-verified under `NC-20260906-001`
Provider channel: Heartbeat `Our Graduates`
Channel ID: `845b7ebb-d7b9-47de-be58-119de3614ab7`
Channel type: `POSTS`

## Outcome

Every newly issued public Sertifier credential can produce two independently
verified participant-facing outcomes:

1. the existing direct recipient delivery/Heartbeat message; and
2. one short congratulations thread in `Our Graduates` with the participant's
   rendered certificate image and branded verification link.

Neither outcome is inferred from the other. A certificate remains valid when
the announcement fails; the failure is reported as an announcement exception.

## Provider capability

Sertifier's reconciled credential row supplies a person-specific
`certificateImageLink`. A live read-only proof downloaded one active credential
as a valid 1584x1224 PNG; the same credential also produced a temporary PDF
link through the established `generate-pdf` operation.

Heartbeat's documented `PUT /threads` request accepts rich-text `text`, one
`channelID`, and optional iframe `embeds`. It does not document a native file or
image field in the create request. The Heartbeat UI's native attachment path
uses a separately authenticated web-client contract unavailable to the public
API key, so the workflow never extracts a browser token or depends on that
private upload path.

The shared automation downloads and validates the Sertifier PNG, then embeds a
minimal Tandem-hosted card at `/certificate-embed/{certificate-number}/`. That
public, noindex view contains only the responsive certificate image and a
clickable branded registrar link. Its CSP permits framing only from the Tandem
Heartbeat community. This avoids all registrar-page chrome and keeps the
external anchor out of the post body, where Heartbeat would otherwise generate
a second preview card.

References:

- https://heartbeat.readme.io/reference/createthread
- https://heartbeat.readme.io/reference/rich-text
- https://help.heartbeat.chat/hc/en-us/articles/33257828679569-How-to-Add-a-File-to-a-Thread

## Guarded operation

`sertifier/announce-graduate` takes one exact credential UUID and owns the
cross-provider verification:

1. read the credential and reconcile its exact campaign when the direct getter
   omits `campaignId`;
2. require active status, `isPublic:true`, recipient name, certificate number,
   campaign, and an approved Sertifier PNG host/path;
3. read campaign and Detail to obtain the provider-owned credential title;
4. download the PNG and verify its signature and 10 MB ceiling;
5. require the exact channel ID, exact `Our Graduates` name, and `POSTS` type;
6. resolve the exact Heartbeat member by credential email and scan recent
   threads for the same exact member mention plus credential title, while
   retaining the legacy registrar-URL duplicate check;
7. create the thread only with `--execute --confirm ANNOUNCE-GRADUATE`;
8. read the thread back and require the exact channel, member mention, and
   credential title.

Dry-run is the default. `already_announced` is an idempotent recovery receipt,
not a second post.

## Message contract

```text
🎓 Please join us in congratulating @RECIPIENT on completing CREDENTIAL TITLE!

We are delighted to celebrate this achievement with our community.
```

The recipient and credential title come from Sertifier, not caller prose. The
recipient is an actual Heartbeat member mention resolved by the credential's
exact email. The only embed is the Tandem certificate card; its link opens the
branded registrar outside the iframe. There is no external anchor in the post
body, so Heartbeat has nothing to turn into a link-preview card.

## Callers and eligibility

- Gru Certifier runs the operation only after `status:issued`, `created:true`,
  `emailConfirmed:true`, and `credential.isPublic:true`.
- The Heartbeat grading skill runs the same shared operation after its direct
  recipient message is visibly verified.
- Private credentials, including MCS partial-completion records, are never
  announced.
- `already_issued` reconciliation never triggers a post. Historical or missed
  announcements require a separate explicit owner request.
- An uncertain post is reconciled once through a dry run. If the branded URL is
  not found, the workflow records an exception and does not blindly retry.

## Verification boundary

Local mocks prove dry-run, exact channel/type, PNG validation, live confirmation,
payload shape, successful readback, duplicate recovery, and private/invalid
image/wrong-channel refusal. A live dry run verifies the actual channel and a
real public credential without posting. The owner then explicitly authorized
Michelle Ambrose's existing public MCS Practicum credential as the one-person
live test: one post was created and a second dry run returned
`already_announced`. Browser inspection exposed the raw PNG iframe failure and
the oversized registrar-page fallback. After the owner's layout refinement,
Tandemweb `583b240a0` deployed the narrowly reviewed certificate-card route.
The post now uses an inline `@Michelle Ambrose` member mention and that compact
card; live browser inspection confirms the complete certificate image plus its
clickable verification link and no separate Heartbeat preview. Toolbox
`c252fd3` produces the same structure for future announcements.

## Rollback

Remove the Gru and grading-skill follow-through instructions or remove the
`announce-graduate` operation from the mounted Sertifier toolbox. Existing
certificates, direct messages, and prior community posts remain untouched. The
Tandem certificate-card route can be removed independently after no post embeds
reference it.
