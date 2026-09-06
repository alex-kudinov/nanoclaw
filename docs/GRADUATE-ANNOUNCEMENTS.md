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
image field in the create request. The Heartbeat UI separately supports native
file attachments up to 10 MB. The shared automation therefore downloads and
validates the Sertifier PNG, then embeds the branded registrar verification
page that visibly renders that same certificate image. The first authorized
live test proved that embedding the raw Google Storage PNG is blocked by Brave
because the provider serves it as `application/octet-stream`; the registrar
page is embeddable and rendered the certificate successfully. The workflow
never depends on an undocumented Heartbeat upload endpoint.

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
6. scan the documented recent-thread surface for the same branded registrar
   URL before creating anything;
7. create the thread only with `--execute --confirm ANNOUNCE-GRADUATE`;
8. read the thread back and require the exact channel and credential URL.

Dry-run is the default. `already_announced` is an idempotent recovery receipt,
not a second post.

## Message contract

```text
🎓 Please join us in congratulating RECIPIENT on completing CREDENTIAL TITLE!

We are delighted to celebrate this achievement with our community. View the
verified certificate.
```

The recipient and credential title come from Sertifier, not from caller prose.
The final sentence links to the branded Tandem registrar. The only embed is the
same credential's registrar verification page, which renders the certificate
image and its provider-owned verification details.

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
live test: one post was created, its exact registrar URL was read back, a second
dry run returned `already_announced`, and browser inspection exposed the raw
PNG iframe failure. The post was corrected in place to embed the registrar
verification page; browser inspection then visibly confirmed Michelle's
certificate image and verification details inside the `Our Graduates` thread.

## Rollback

Remove the Gru and grading-skill follow-through instructions or remove the
`announce-graduate` operation from the mounted Sertifier toolbox. Existing
certificates, direct messages, and prior community posts remain untouched.
