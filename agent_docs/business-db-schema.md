# Schema: business.db

Generated: 2026-04-26T08:00:34Z

## clients

```
  id                        INTEGER      PK
  contract_id               INTEGER     
  name                      TEXT         NOT NULL
  email                     TEXT        
  coach_id                  INTEGER     
  start_date                TEXT        
  session_count             INTEGER      NOT NULL DEFAULT=0
  status                    TEXT         NOT NULL DEFAULT='active'
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Foreign keys:
  coach_id -> coaches(id)
  contract_id -> contracts(id)

Sample row:
```
```

## coaches

```
  id                        INTEGER      PK
  name                      TEXT         NOT NULL
  email                     TEXT        
  capacity                  INTEGER      NOT NULL DEFAULT=5
  current_clients           INTEGER      NOT NULL DEFAULT=0
  certifications            TEXT        
  status                    TEXT         NOT NULL DEFAULT='active'
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Sample row:
```
```

## contracts

```
  id                        INTEGER      PK
  proposal_id               INTEGER     
  client                    TEXT         NOT NULL
  coach_assigned            TEXT        
  start_date                TEXT        
  end_date                  TEXT        
  status                    TEXT         NOT NULL DEFAULT='active'
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Foreign keys:
  proposal_id -> proposals(id)

Sample row:
```
```

## invoices

```
  id                        INTEGER      PK
  contract_id               INTEGER     
  amount                    REAL         NOT NULL
  status                    TEXT         NOT NULL DEFAULT='pending'
  due_date                  TEXT        
  paid_at                   TEXT        
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Foreign keys:
  contract_id -> contracts(id)

Sample row:
```
```

## leads

```
  id                        INTEGER      PK
  source                    TEXT         NOT NULL
  status                    TEXT         NOT NULL DEFAULT='new'
  name                      TEXT        
  email                     TEXT        
  company                   TEXT        
  message                   TEXT        
  assigned_to               TEXT        
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Sample row:
```
```

## proposals

```
  id                        INTEGER      PK
  lead_id                   INTEGER     
  status                    TEXT         NOT NULL DEFAULT='draft'
  amount                    REAL        
  sent_at                   TEXT        
  signed_at                 TEXT        
  notes                     TEXT        
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Foreign keys:
  lead_id -> leads(id)

Sample row:
```
```

## tasks

```
  id                        INTEGER      PK
  from_agent                TEXT         NOT NULL
  to_agent                  TEXT         NOT NULL
  type                      TEXT         NOT NULL
  payload                   TEXT         NOT NULL
  status                    TEXT         NOT NULL DEFAULT='pending'
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Sample row:
```
```

## vendors

```
  id                        INTEGER      PK
  name                      TEXT         NOT NULL
  category                  TEXT        
  cost                      REAL        
  renewal_date              TEXT        
  status                    TEXT         NOT NULL DEFAULT='active'
  notes                     TEXT        
  created_at                TEXT         NOT NULL DEFAULT=datetime('now')
  updated_at                TEXT         NOT NULL DEFAULT=datetime('now')
```

Sample row:
```
```
