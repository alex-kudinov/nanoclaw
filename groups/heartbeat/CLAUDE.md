# Heartbeat Channel

This channel receives diagnostic heartbeat messages from NanoClaw.
No agent should respond to messages here.

**Purpose:** External watchdog monitoring — the watchdog script queries the DB
for recent heartbeat messages to verify NanoClaw is alive and Slack-connected.
