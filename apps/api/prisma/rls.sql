-- Row Level Security: last line of defence for organization isolation.
-- Apply after Prisma migrations:
--   psql "$DATABASE_URL" -f prisma/rls.sql
--
-- The runtime DB role must NOT be a superuser and should not own the tables.
-- FORCE is used so even the owner obeys policies.

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations',
    'memberships',
    'social_accounts',
    'posts',
    'post_targets',
    'brand_voices',
    'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS org_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (organization_id = app_current_org() OR current_setting(''app.system'', true) = ''on'') WITH CHECK (organization_id = app_current_org() OR current_setting(''app.system'', true) = ''on'')',
      t
    );
  END LOOP;
END $$;

-- Special cases: organizations and users have no organization_id column.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_self ON organizations;
CREATE POLICY org_self ON organizations
  USING (id = app_current_org() OR current_setting('app.system', true) = 'on')
  WITH CHECK (id = app_current_org() OR current_setting('app.system', true) = 'on');

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_self ON users;
CREATE POLICY user_self ON users
  USING (
    current_setting('app.system', true) = 'on'
    OR id IN (SELECT user_id FROM memberships WHERE organization_id = app_current_org())
  );
