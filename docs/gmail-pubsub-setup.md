# Gmail Pub/Sub Push Setup

Replaces the 30-second polling loop in `src/channels/gmail.ts` with Google
Cloud Pub/Sub push notifications. On each notification NanoClaw fetches a
`users.history.list` delta from the last-seen `historyId` and delivers new
messages to the mailman agent.

## Current deployment: coexistence with Hive

This environment already has a Hive Firebase project consuming Gmail push
notifications on the `hive-gmail-push` topic. Relevant facts:

- **Topic:** `projects/tandem-infrastructure-claude/topics/hive-gmail-push`
  (IAM publisher role already granted to `gmail-api-push@system.gserviceaccount.com`)
- **Watch owner:** Hive's `renew_watch` Cloud Function manages
  `users.watch({labelIds: ['INBOX']})` on a schedule — NanoClaw does **not**
  touch the watch
- **Existing subscriber:** Firebase Functions `onGmailPush` via a Firestore-
  backed Cloud Run service at `ongmailpush-uciwklnyoa-uc.a.run.app`

NanoClaw adds a **second** push subscription on the same topic. Both Hive
and NanoClaw receive every notification. NanoClaw runs in **passive-subscriber
mode** (`GMAIL_PUSH_OWN_WATCH=false`, the default) and seeds its baseline
`historyId` via `users.getProfile()` at connect time.

## Architecture

```
Gmail → hive-gmail-push topic
      ├── eventarc sub → Hive Cloud Run (existing, untouched)
      └── gmail-push-nanoclaw → webhooks.tandemcoach.co/webhook/gmail-push (n8n)
                              → 100.115.115.206:8088/hook/gmail-push (NanoClaw)
                              → GmailChannel.handlePushNotification
                              → users.history.list → fetchIfRelevant → mailman
```

A slow safety-net poll (default 10 min) catches dropped pushes and verifies
the channel is healthy.

## 1. Create the NanoClaw push subscription

Topic and IAM are already in place. Only the NanoClaw-specific subscription
is new:

```sh
gcloud pubsub subscriptions create gmail-push-nanoclaw \
  --topic=hive-gmail-push \
  --push-endpoint="https://webhooks.tandemcoach.co/webhook/gmail-push" \
  --ack-deadline=30 \
  --project=tandem-infrastructure-claude
```

- The domain `tandemcoach.co` is already verified in Google Search Console
  under the `info@tandemcoaching.academy` account, so no extra verification
  is required.
- No OIDC auth is configured on the subscription — authentication is via
  `X-Webhook-Secret` on the hop from n8n to NanoClaw, matching the existing
  Trafft pattern.

## 2. Import the n8n workflow

In the n8n UI at `ops.tandemcoach.co`:

1. **Workflows → Import from File**
2. Select `setup/n8n/gmail-push-workflow.json` from this repo
3. Open the **POST to NanoClaw** node and replace
   `REPLACE_WITH_GMAIL_PUSH_WEBHOOK_SECRET` with the value you'll put into
   NanoClaw's `.env` (next step)
4. **Save** and **Activate** the workflow

The workflow exposes `POST /webhook/gmail-push`, extracts the Pub/Sub
envelope from the request body, and forwards it verbatim to NanoClaw's
`/hook/gmail-push`. The base64-decoded payload is parsed on the NanoClaw
side.

## 3. Configure NanoClaw .env (Mac Mini)

Add to `~/dev/NanoClaw/.env`:

```
GMAIL_PUSH_ENABLED=true
GMAIL_PUSH_WEBHOOK_SECRET=<paste the same secret you put into n8n>
# Defaults (do not need to be set unless you want to override):
# GMAIL_PUSH_OWN_WATCH=false
# GMAIL_PUBSUB_TOPIC=    (only used if OWN_WATCH=true)
# GMAIL_PUSH_SAFETY_POLL_INTERVAL=600000
```

Generate the secret:

```sh
openssl rand -hex 24
```

Paste the same value into both `.env` and the **POST to NanoClaw** node
header in n8n.

## 4. Build and restart

```sh
cd ~/dev/NanoClaw
/opt/homebrew/bin/node node_modules/.bin/tsc
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Expected log lines on startup:

```
Gmail history baseline seeded from users.getProfile { historyId: ... }
Gmail push mode active { safetyPollMs: 600000, ownWatch: false }
```

## 5. Verify

Send a labeled test email to `info@tandemcoaching.academy`. Within a few
seconds NanoClaw should log:

```
Gmail push delivered messages { newCount: 1, ... }
```

In n8n, check the **Gmail Pub/Sub Push → NanoClaw** workflow's execution
history to confirm the push arrived and was forwarded with a 204.

## Rollback

Set `GMAIL_PUSH_ENABLED=false` in `.env`, rebuild, and restart. The channel
reverts to the legacy 30-second poll. The Pub/Sub subscription keeps
delivering (harmlessly) to a now-unregistered endpoint — Pub/Sub will retry
and eventually drop after 7 days. To stop delivery cleanly, pause or delete
the subscription:

```sh
gcloud pubsub subscriptions delete gmail-push-nanoclaw \
  --project=tandem-infrastructure-claude
```

The Hive eventarc subscription is untouched throughout.

## Advanced: standalone mode (without Hive)

If you deploy NanoClaw in an environment without Hive, set:

```
GMAIL_PUSH_OWN_WATCH=true
GMAIL_PUBSUB_TOPIC=projects/<your-project>/topics/<your-topic>
```

NanoClaw will then call `users.watch({labelIds: ['INBOX']})` at startup and
refresh it hourly (renewing when <24h remaining). Only one `users.watch` can
exist per mailbox at a time — never enable this alongside Hive, or the two
will fight over the watch config.

## State keys in `router_state`

- `gmail_history_id` — last processed historyId (advances after each delta)
- `gmail_watch_expires_at` — ms epoch; only populated when `OWN_WATCH=true`
- `gmail_last_check` — ms epoch of legacy fast-poll (used when push disabled)

## Gotchas

- **History TTL is ~7 days.** If NanoClaw is down longer than that,
  `users.history.list` returns 404. NanoClaw logs `Gmail history expired`
  and re-anchors from the current notification's historyId — messages in
  the gap are not backfilled.
- **Pub/Sub is at-least-once.** The `pushQueue` in `GmailChannel` serializes
  handlers, and `fetchIfRelevant` checks `processedIds` + DB dedup to skip
  already-delivered messages. Duplicates are safe.
- **`/hook/gmail-push` is a reserved webhook ID.** Do not register a custom
  webhook with that id — the Pub/Sub receiver intercepts it first.
- **Replies into labeled threads arrive unlabeled.** Push mode detects this
  in `fetchIfRelevant` by checking the thread's label membership and
  applies the label to the new message, replacing the legacy
  `pollThreadReplies()` band-aid when push mode is active.
- **Hive also processes every notification.** If you change what Hive writes
  to Firestore, double-check it doesn't conflict with NanoClaw's behavior
  (currently they act independently — Hive updates conversation docs,
  NanoClaw routes to the mailman agent).
