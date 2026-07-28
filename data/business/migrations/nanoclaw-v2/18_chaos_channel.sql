-- 18_chaos_channel.sql — add the 'chaos' interaction channel.
--
-- Chaos verified-visitor activity is logged via fn_log_interaction_dedup with
-- channel='chaos' by the host-side handler (src/chaos-activity.ts). The channel
-- key must exist in the interaction_channels taxonomy or the interaction insert
-- fails its FK check. See docs/chaos-activity-handler-plan.md.

INSERT INTO business_v2.interaction_channels (key, label) VALUES
  ('chaos', 'Chaos Visitor')
ON CONFLICT (key) DO NOTHING;
