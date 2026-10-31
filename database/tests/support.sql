-- Assertion helpers shared by the database tests. Include inside the test's
-- own transaction with \ir so they disappear on ROLLBACK.
CREATE SCHEMA test_support;
GRANT USAGE ON SCHEMA test_support TO anon, authenticated, service_role;
CREATE FUNCTION test_support.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', message; END IF;
END $$;
CREATE FUNCTION test_support.assert_rejected(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected rejection: %', statement;
END $$;
-- Same as assert_rejected, but the message must match too, because one SQLSTATE
-- (such as 23514) covers several different rules.
CREATE FUNCTION test_support.assert_rejected_like(statement text, expected_state text, message_pattern text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state AND SQLERRM LIKE message_pattern THEN RETURN; END IF;
    RAISE EXCEPTION 'FAIL: expected % like "%", got % "%" for: %', expected_state, message_pattern, SQLSTATE, SQLERRM, statement;
  END;
  RAISE EXCEPTION 'Expected rejection: %', statement;
END $$;
