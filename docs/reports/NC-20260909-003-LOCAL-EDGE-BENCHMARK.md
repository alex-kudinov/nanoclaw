# NC-20260909-003 local TEST edge benchmark

Date: 2026-09-10
Runtime: Node 22.23.2, loopback HTTP, synthetic signed foreign-only Adyen batches
Command: `./scripts/with-pinned-node.sh npx tsx scripts/benchmark-adyen-test-edge-ingress.ts`

This is a deterministic local source benchmark, not proof of VPS gateway, TLS,
network, n8n, NanoClaw durable intake or production capacity. No provider, live
service, database, workflow, customer or external system was contacted.

## Result

```json
{
  "requests": 500,
  "concurrency": 25,
  "durationMs": 146.48,
  "throughputPerSecond": 3413.38,
  "p50Ms": 4.97,
  "p95Ms": 27,
  "rssBeforeBytes": 75808768,
  "rssAfterBytes": 122388480,
  "rssDeltaBytes": 46579712,
  "upstreamCalls": 0,
  "counters": {
    "requests": 500,
    "foreignOnly": 500,
    "ownedBatchesForwarded": 0,
    "ownedEventsForwarded": 0,
    "rejected": 0,
    "upstreamFailures": 0,
    "busy": 0
  }
}
```

All 500 whole-batch-HMAC-verified foreign requests received the exact local
`202 [accepted]` response. The fixed synthetic upstream received zero calls.
Counters contain only aggregate numbers and retain no provider/customer IDs.
RSS delta includes Node/Undici connection-pool and benchmark-client allocation;
it is a one-run process measurement, not a leak slope or capacity threshold.

Required next proof remains a bounded end-to-end TEST deployment benchmark at
the actual pre-workflow edge, including TLS, predominantly foreign and mixed
batches, invalid signatures, downstream outage, burst backpressure, exact
upstream acknowledgement and zero foreign n8n/database persistence readback.

Independent coordinator rerun:6 HTTP tests passed;500 requests at25 concurrency
again produced0 upstream calls, p50 4.91ms, p95 27.77ms and RSS delta45,056,000
bytes. Sonnet/high R1 found no material issue. Its completed final response was
captured in Peri output/mcs-ready/edge-review/RESPONSE.md after the reviewer
omitted the requested file write; no redundant review was run for that omission.
