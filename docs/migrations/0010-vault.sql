CREATE TABLE IF NOT EXISTS "vault_entries" (
  "id" uuid NOT NULL,
  "owner" character varying(255) NOT NULL,
  "name" character varying(128) NOT NULL,
  "description" text,
  "tags" text,
  "url" text,
  "host" character varying(255),
  "port" integer,
  "image" text,
  "accounts" text NOT NULL,
  "tokens" text,
  "starred" boolean NOT NULL DEFAULT false,
  "encryptedSecrets" text NOT NULL,
  "createdAt" character varying(30) NOT NULL,
  "updatedAt" character varying(30) NOT NULL,
  CONSTRAINT "PK_vault_entries" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IDX_vault_entries_owner" ON "vault_entries" ("owner");

ALTER TABLE system_config ADD COLUMN IF NOT EXISTS "vaultMcpTools" boolean;
