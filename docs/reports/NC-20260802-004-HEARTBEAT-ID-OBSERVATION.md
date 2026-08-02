# NC-20260802-004 Heartbeat identity and title observation

- Date: 2026-08-02
- Operator: Codex
- Surface: signed-in Heartbeat course administration UI
- Mode: read-only; no approval, retry, feedback, download, upload, or other
  external write occurred

## Question 1: does the permitted UI expose a stable submission ID?

No stable submission ID was visible.

The `View Submissions` queue exposed submission date, member, exact lesson
title, text/attachment presence, and actions. The row DOM exposed column names
and a member/profile identifier, but no submission identifier or submission
detail link. Opening one record read-only preserved the course URL and exposed
the exact submission time, content, attachment state, and approval actions. The
dialog and its descendants exposed no submission identifier.

Therefore the proposed real-ID primary key fails the first required test: an ID
is not visible from the queue projection or detail view. Transition survival and
first-attempt/resubmission uniqueness cannot be proven from this surface without
performing external writes, and no such write was authorized or performed.

## Question 2: what exact assignment titles does Heartbeat render?

The course page currently renders these assignment titles:

1. `Module 1 Assignment Part 1: Knowledge Check`
2. `Module 1 Assignment Part 2: Ethical Scenario Analysis`
3. `Module 2 Assignment Part 1: Knowledge Check`
4. `Module 2 Assignment Part 2: MC Engagement Agreement`
5. `Module 3 Assignment: Managing the MC Process`
6. `Module 4 Assignment Part 1: Knowledge Check`
7. `Module 4 Assignment Part 2: Session Analysis of Recording A`
8. `Module 5 Assignment: Facilitating Client Skill Development`
9. `Module 6 Assignment: Group Mentor Coaching`

The first eight are the exact prerequisite-title candidates for Module 6. This
observation resolves the known Module 3 and Module 5 naming drift for design
purposes; a later live run must still hold on any unmatched title.

## Required owner decision

NC-004 and NC-005 remain blocked until one option is selected:

1. authorize bounded, read-only discovery of the backing Heartbeat record ID;
2. accept a locally derived opaque key from visible immutable evidence, with
   collision detection and manual holds, while explicitly dropping the claim
   that it is a Heartbeat submission ID; or
3. leave the durable index and coordinator dark.

The safest path that preserves the original requirement is option 1.
