-- 169_acc_capacity_readiness.sql
--
-- Register the four published ACC Module 1 starts that predate the guarded
-- calendar-capacity readiness producer. This is configuration data only: it
-- creates no assignment, reservation, commitment, payment, message, or access.

BEGIN;
SET search_path TO business_v2, public, pg_catalog;

DO $$ BEGIN
  IF to_regclass('business_v2.academy_seat_pool_offers') IS NULL THEN
    RAISE EXCEPTION 'migration 143 must be applied before migration 169';
  END IF;
END $$;

CREATE TEMP TABLE acc_capacity_169_blocks (
  delivery_block_key text PRIMARY KEY,
  source_object_id text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  session_set_sha256 text NOT NULL,
  schedule_evidence_sha256 text NOT NULL,
  pool_key text NOT NULL UNIQUE,
  configuration_evidence_sha256 text NOT NULL
) ON COMMIT DROP;

INSERT INTO acc_capacity_169_blocks VALUES
  ('acc.module-1:2026-10-07','tandemweb-calendar:acc-m1-2026-10-07','2026-10-07T19:00:00-04:00','2026-10-28T21:00:00-04:00','0ad50aa680b552ee0ba6fcdfd1731b71e69b7791ef2fad1b979caa7122c99003','7ec5d190f6e47408ee98b4440114c8f5c4779dde958c47d62667d969af821ab7','calendar-publication:pool:acc.module-1:2026-10-07','9a105f4993b534368cdf6ec9948af7257a04dd641b73f0e11ab6429ca814c21e'),
  ('acc.module-1:2027-02-01','tandemweb-calendar:acc-m1-2027-02-01','2027-02-01T11:00:00-05:00','2027-02-22T13:00:00-05:00','fc1988d256d442d440ad7df7d4cf53cd2ffe46b29692fc1effe65410686d4c9c','ece584166afbceeacba43a7d172008d8b76a995fb04f99a6575e68a4c547aaa9','calendar-publication:pool:acc.module-1:2027-02-01','b7a235a21f8720961ae1d1f74061e4d6bc8f6a2d70f1398cc358516683996784'),
  ('acc.module-1:2027-04-05','tandemweb-calendar:acc-m1-2027-04-05','2027-04-05T16:00:00-04:00','2027-04-26T18:00:00-04:00','28cf718c6c672f49b87f7f0962dd4359dd76d9718a41c5f0a562348618079382','9722d88381e0c807e3e828389f0fc6aaafc119561891cdb36aeca822394dd040','calendar-publication:pool:acc.module-1:2027-04-05','7164cceb1e369d9a0720535657e05cf8121f9fb3d81bd281e5d48f1229f1efd3'),
  ('acc.module-1:2027-07-05','tandemweb-calendar:acc-m1-2027-07-05','2027-07-05T10:00:00-04:00','2027-07-26T12:00:00-04:00','e0cf8d27e57347f3a7c96a4dde79f15e98128b2602e6dd3f7787ed8fcfa2a66c','af1272ce5dbc0332574908c6e6f6705757284187380ddf0166f567986fec05c4','calendar-publication:pool:acc.module-1:2027-07-05','2952ab7491506358266dfcfc1b63566ccca50891596764579c6332b3daa36810');

CREATE TEMP TABLE acc_capacity_169_offers (
  delivery_block_key text NOT NULL,
  offer_key text NOT NULL,
  evidence_sha256 text NOT NULL,
  PRIMARY KEY (delivery_block_key,offer_key)
) ON COMMIT DROP;

INSERT INTO acc_capacity_169_offers VALUES
  ('acc.module-1:2026-10-07','acc-module-1','82ba6549cd1129bba57cce622cfe36ade94e3a1ec5aff9f5751f67829b85270e'),
  ('acc.module-1:2026-10-07','acc-full','41b6d8efcdc6c63f27d2e9f3e9fa79d8d423917c095b83ba1db5237d9ea066aa'),
  ('acc.module-1:2026-10-07','acc-pcc-full','862db8ed99d8a4d51bc5a479891e7fd36cfee4b480aa93643c2ba7bb796717a3'),
  ('acc.module-1:2027-02-01','acc-module-1','15ebab002fc6aec9074019b80be3a987df42637e2631106d9a8e735901a6eb51'),
  ('acc.module-1:2027-02-01','acc-full','8c2075a33bc95d4104217094069ebe3a8fb3fd73aaa992d9b5acbf5dba4a0f47'),
  ('acc.module-1:2027-02-01','acc-pcc-full','d3dcaf7cdc4f24460181402584d843bfe39a115f59805f94c42132d606f9f3dd'),
  ('acc.module-1:2027-04-05','acc-module-1','13e1c498880160267d7bf47e56600ba7dfc4c286ca5e75b658757e5a98622d8f'),
  ('acc.module-1:2027-04-05','acc-full','8b9dfdc01cf3346dff9ca49059745b8ed548f076b26ceb38b61c834783b35519'),
  ('acc.module-1:2027-04-05','acc-pcc-full','5da4132220b10ff44e7871025d8112a21b2332472993746fbb1274d6adb7f0ef'),
  ('acc.module-1:2027-07-05','acc-module-1','f0991dcef250fdb65dfa165334edae4e692cdc48d75d4041c774682ba7d7724c'),
  ('acc.module-1:2027-07-05','acc-full','0352af3ca054601384b8dbf46e061791e96ec90a342fc0d56df97e2deb879538'),
  ('acc.module-1:2027-07-05','acc-pcc-full','5d416c225391b7d3dd6a725d2308777f3712f23cbc6f1d1cd4542c57711e968d');

INSERT INTO business_v2.academy_delivery_blocks
  (delivery_block_key,component_key,source_scope,source_object_id,starts_at,
   ends_at,timezone,session_set_sha256,schedule_evidence_sha256,state,version,
   created_at,updated_at,updated_by)
SELECT delivery_block_key,'acc.module-1','tandemweb.google_calendar_projection',
       source_object_id,starts_at,ends_at,'America/New_York',session_set_sha256,
       schedule_evidence_sha256,'scheduled',0,'2026-09-16T00:15:00Z',
       '2026-09-16T00:15:00Z','migration:169_acc_capacity_readiness'
FROM acc_capacity_169_blocks
ON CONFLICT (delivery_block_key) DO NOTHING;

INSERT INTO business_v2.academy_seat_pools
  (pool_key,delivery_block_id,capacity,operational_state,close_reason,
   configuration_evidence_sha256,version,created_at,updated_at,updated_by)
SELECT e.pool_key,d.id,12,'open',NULL,e.configuration_evidence_sha256,0,
       '2026-09-16T00:15:00Z','2026-09-16T00:15:00Z',
       'migration:169_acc_capacity_readiness'
FROM acc_capacity_169_blocks e
JOIN business_v2.academy_delivery_blocks d USING (delivery_block_key)
ON CONFLICT (pool_key) DO NOTHING;

INSERT INTO business_v2.academy_seat_pool_offers
  (mapping_key,pool_id,offer_key,catalog_revision,state,version,
   evidence_sha256,created_at,updated_at,updated_by)
SELECT 'calendar-publication:mapping:' || o.delivery_block_key || ':' || o.offer_key,
       p.id,o.offer_key,1,'active',0,o.evidence_sha256,
       '2026-09-16T00:15:00Z','2026-09-16T00:15:00Z',
       'migration:169_acc_capacity_readiness'
FROM acc_capacity_169_offers o
JOIN acc_capacity_169_blocks e USING (delivery_block_key)
JOIN business_v2.academy_seat_pools p ON p.pool_key=e.pool_key
ON CONFLICT (mapping_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM acc_capacity_169_blocks e
    LEFT JOIN business_v2.academy_delivery_blocks d USING (delivery_block_key)
    WHERE d.id IS NULL OR d.component_key <> 'acc.module-1'
       OR d.source_scope <> 'tandemweb.google_calendar_projection'
       OR d.source_object_id <> e.source_object_id OR d.starts_at <> e.starts_at
       OR d.ends_at <> e.ends_at OR d.timezone <> 'America/New_York'
       OR d.session_set_sha256 <> e.session_set_sha256
       OR d.schedule_evidence_sha256 <> e.schedule_evidence_sha256
       OR d.state <> 'scheduled'
  ) THEN RAISE EXCEPTION 'migration 169 delivery-block conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM acc_capacity_169_blocks e
    LEFT JOIN business_v2.academy_seat_pools p ON p.pool_key=e.pool_key
    LEFT JOIN business_v2.academy_delivery_blocks d ON d.id=p.delivery_block_id
    WHERE p.id IS NULL OR d.delivery_block_key <> e.delivery_block_key
       OR p.capacity <> 12 OR p.operational_state <> 'open'
       OR p.close_reason IS NOT NULL
       OR p.configuration_evidence_sha256 <> e.configuration_evidence_sha256
  ) THEN RAISE EXCEPTION 'migration 169 seat-pool conflict'; END IF;

  IF EXISTS (
    SELECT 1 FROM acc_capacity_169_offers e
    LEFT JOIN business_v2.academy_delivery_blocks d ON d.delivery_block_key=e.delivery_block_key
    LEFT JOIN business_v2.academy_seat_pools p ON p.delivery_block_id=d.id
    LEFT JOIN business_v2.academy_seat_pool_offers m
      ON m.pool_id=p.id AND m.offer_key=e.offer_key AND m.catalog_revision=1
    WHERE m.id IS NULL OR m.state <> 'active'
       OR m.evidence_sha256 <> e.evidence_sha256
  ) THEN RAISE EXCEPTION 'migration 169 offer-mapping conflict'; END IF;
END $$;

COMMIT;
