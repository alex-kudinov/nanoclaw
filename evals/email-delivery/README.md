# Approved-email incident replay corpus

`incidents.json` is the scrubbed, non-sending regression corpus for the
Sales-to-Mailman approval and Gmail boundary. It contains two kinds of proof:

- executable approval-card and host-execution cases run through the production
  parsers and rehydration function; and
- required integration regressions whose test file and identifying contract
  must remain inside the serial email-critical release gate.

All identities and content are synthetic. Replays must not open Gmail, Slack,
or a production database. A new email-delivery incident is incomplete until a
scrubbed case or required regression is added here and the failing behavior is
reproduced before the repair is accepted.

Run only this corpus with:

```bash
npm run test:email-replay
```

The authoritative release path is still `npm run test:email-critical`, which
includes the replay test and all linked integration regressions.
