-- +goose Up
-- An empty scope used to mean full access; it now means no access and "*" grants everything.
-- Keep already-approved non-admin users working by giving them "*". Pending sign-ups keep an
-- empty scope so approving one without choosing access no longer grants everything.
UPDATE users SET scope = ARRAY['*'] WHERE role <> 'admin' AND status <> 'pending' AND cardinality(scope) = 0;

-- +goose Down
UPDATE users SET scope = '{}' WHERE scope = ARRAY['*'];
