-- In-app notification center
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text,
  "link" varchar(500),
  "read_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications"("user_id");
CREATE INDEX IF NOT EXISTS "notifications_read_at_idx" ON "notifications"("read_at");
