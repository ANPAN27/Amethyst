-- Supabase's default privileges grant anon broad access to public tables. RLS
-- already returns no rows because there is no anon policy, but anonymous
-- clients have no reason to hold table privileges at all. Revoke them and stop
-- future tables created by migrations from inheriting the same grants.
revoke all on all tables in schema public from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;
