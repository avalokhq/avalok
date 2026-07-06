-- +goose Up

CREATE TABLE standalone_environments (
    name        TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    config      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE standalone_services (
    name        TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    provider    TEXT NOT NULL DEFAULT '',
    config      JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down

DROP TABLE IF EXISTS standalone_services;
DROP TABLE IF EXISTS standalone_environments;
