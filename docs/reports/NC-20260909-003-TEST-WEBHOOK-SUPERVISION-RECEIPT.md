# NC-20260909-003 TEST webhook supervision receipt

- Correction: the earlier completion claim was invalid because it proved Adyen
  payment acceptance but not Tandem webhook delivery while the receiver stack
  was offline.
- Release: `a14b679cdc1e10363137c78871f0f34d0afeafff`; compiled artifact
  `9dd630a49139071c75add9d9de939454f5530aabfc7e8bfde9f01982dba9f3d0`;
  archive `abf20aade99bd2fa408c913eaec77aa2a3ac3b2d89c4f22966cfd1afe1a21143`.
- Review and tests: focused66/66, broader508/508, typecheck, release805/805,
  runner45/45; independent Claude Sonnet/high reported no material findings.
- Deployment: Studio launchd supervises backend, filtering edge and reverse SSH
  tunnel. Forced restart replaced PIDs66982/66984/66986 with
  67280/67282/67284 and restored listeners127.0.0.1:3443,
  127.0.0.1:3444 and VPS127.0.0.1:15679. An unsigned public request reached
  the chain and was correctly rejected HTTP403.
- Provider receipt: Adyen TEST event `WHEL4293G22322235PXZSNM2DQ4D4J`, PSP
  `XK4P3Z94BWW5KG75`, merchant reference
  `tandem-poc-tsv1-638d2161-3abb-4b8e-9c8d-2fde220dabb7`, Tandem URL,
  HTTP202 Accepted.
- Post-restart provider proof: retrying a previously failed Adyen delivery for
  PSP `XH38KKJ9HKW9PPV5` created event `WHEL4299N2...V5MDDQ63JK` at
  19:49:40.524 CDT with status Accepted for the Tandem URL.
- Durable readback: attempt `638d2161-3abb-4b8e-9c8d-2fde220dabb7` is
  `authorization_recorded`, with one payment event, zero provider optimization
  evidence rows and zero admissions.
- Remaining boundary: the accepted webhook contains no ESD validation result.
  Level 3 fields were sent and the card payment was Authorised, but Level 3
  scheme submission is not proven until Adyen returns provider validation
  evidence such as `enhancedSchemeDataSubmitted=L3`.
