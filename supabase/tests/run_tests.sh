#!/usr/bin/env bash
# Runs the schema tests against a local Postgres 16.
#   PGHOST=/tmp PGPORT=5499 PGUSER=postgres supabase/tests/run_tests.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
db=arrively_test
psql -q -c "drop database if exists $db" -c "create database $db" >/dev/null
psql -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql -q -d "$db" -v ON_ERROR_STOP=1 -f "$f"; done
psql -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/flow_test.sql
