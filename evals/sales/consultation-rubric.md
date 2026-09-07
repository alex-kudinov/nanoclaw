# Selective consultation evaluation

Run the tool-free harness with the installed Claude rotation runner. It uses
synthetic facts and conversations only; no real customer data or tools. Each
turn starts a fresh process with the actual generated earlier email included,
so continuation success does not depend on a warm session. Case expectations
are withheld from the generator. The development case illustrates the owner's
accepted behavior; holdout cases test different wording, mixed asks and turns.

Score every generated turn independently, using the case expectation and all
prior generated turns. A correct strategy label alone is not a pass.

1. Selection: direct answers are immediate; exploration is selective; mixed
   requests get concrete answers without qualification friction.
2. Understanding: questions can change advice, connected questions are allowed,
   stated goals and hypotheses remain distinct; no invented biography or goal.
3. Continuity: uses actual earlier answers, does not treat an unsent draft as
   sent, does not repeat resolved questions; changes strategy with the latest ask.
4. Advice: waits for material goal information, but recommends when enough is
   known; gives supported options/reasons, invites reactions and adjusts.
5. Boundaries: no unsupported facts, outcomes, pressure, invented concessions,
   unwanted follow-up or customer/tool actions. Internal pending-draft status
   and approval are not customer consent or delivery evidence.

Record pass/fail plus a concrete observation for each turn in a separate score
artifact. Hard failures include withheld direct answers, invented personal
goals, a premature confident recommendation, repeating answered discovery,
ignoring a changed preference/opt-out, or unsupported claims. Every case is
critical: require every generated turn of every development and holdout case to
pass these criteria before release. Do not repair expected results to fit
generated output. After a material policy change, regenerate affected cases.

Compare selected baseline cases with the candidate using the same inputs and
facts. Keep exact policy/suite hashes and generation usage. This is synthetic
behavior evidence; it is not blinded human scoring or proof of natural business
outcomes. Production validation separately verifies loaded prompts, context
retrieval boundaries, manual approval protection and service health. Assess
natural drafts as evidence arrives without manufacturing customer messages.
