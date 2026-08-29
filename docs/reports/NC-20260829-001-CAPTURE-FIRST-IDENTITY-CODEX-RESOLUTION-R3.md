# Codex resolution of capture-first identity R3 residual

Claude R3 reported no blocking defect and one source-visibility question: the
review packet did not allow reading `fn_create_party`, so it could not prove
that two checkout tokens resolving the same new email cannot create two
Parties.

Codex independently checked the authoritative live migration definition in
`data/business/migrations/nanoclaw-v2/95_fn_create_party_outbox_enqueue.sql`.
Inside the function transaction it:

1. normalizes and validates the email;
2. takes `pg_advisory_xact_lock(hashtextextended(p_email::text, 0))`;
3. re-runs `best_party_by_email(p_email)` under that lock;
4. returns the canonical existing Party when found;
5. inserts only when the locked recheck remains empty.

Therefore two different checkout-token transactions that initially observe
zero candidates serialize inside `fn_create_party`; the second returns the
first canonical Party instead of inserting another. The capture-first caller
may label that rare concurrent result `created`, but both calls receive the
same Party ID and `fn_add_party_role` remains idempotent through its active-role
constraint. No material concurrency defect remains.
