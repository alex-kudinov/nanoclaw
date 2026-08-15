# Chief — Learned Lessons

_Lessons that override all other knowledge. Updated via chief knowledge management._
_Each lesson was provided or approved by a human._

---

<!-- Entries appended by route_lesson IPC handler -->

### Lesson 1: [EMAIL BLOCKED] triggers automatic sales redraft — no human approval needed
**Problem:** When a content guard blocks an outbound email ([EMAIL BLOCKED] message in #gru-chief), chief was waiting for Alex/Cherie to confirm before triggering a redraft. Alex confirmed this should be fully automatic — he should not need to intervene.
**Rule:** When chief receives an [EMAIL BLOCKED] notification: (1) identify the banned phrase from the message, (2) look up the original Gmail thread to recover context, (3) immediately send a [HANDOFF: chief→sales] routing sales to redraft the email without the banned phrase, (4) route a lesson to sales about the banned phrase so it does not recur. No human approval is needed — handle end-to-end automatically.
