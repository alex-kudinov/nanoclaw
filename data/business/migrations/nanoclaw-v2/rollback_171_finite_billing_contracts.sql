DO $$ BEGIN
  RAISE EXCEPTION 'finite billing rollback refused: preserve financial contract and receipt evidence; disable the runtime instead';
END $$;
