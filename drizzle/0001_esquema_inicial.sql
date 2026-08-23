-- ANIME VAULT · migracion 0001 · esquema inicial
--
-- Generada por drizzle-kit y REVISADA A MANO.
-- 15 tablas · 16 CHECK · 14 ON DELETE CASCADE · 0 sentencias destructivas.
--
-- DEPENDE de la migracion 0000: usa citext, gin_trgm_ops y gen_random_uuid(),
-- que drizzle-kit no crea por su cuenta.
--
-- Piezas criticas que NO se pueden perder al editar este fichero:
--   · uq_anime_user_title_norm  — ultima linea de defensa de la deduplicacion
--   · idx_anime_title_norm_trgm — sostiene la similitud difusa (umbral 0.55)
--   · las 14 cascadas desde users y anime — el borrado de cuenta debe ser real
--
-- REVERSION (destructiva, solo sobre base vacia; el orden respeta las FK):
--   DROP TABLE IF EXISTS ai_job, import_job, streaming_mirror, streaming_site,
--     anime_genre, genre, continue_link, progress, anime_cover, anime,
--     password_reset_tokens, verification_tokens, sessions, accounts, users
--     CASCADE;

CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_accounts" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"display_name" text,
	"avatar_url" text,
	"email_verified" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "pk_verification_tokens" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "anime" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_normalized" text NOT NULL,
	"title_english" text,
	"title_native" text,
	"synonyms" text[],
	"synopsis" text,
	"year" integer,
	"format" text,
	"total_episodes" integer,
	"total_seasons" integer,
	"status" text NOT NULL,
	"score" numeric(3, 1),
	"is_favorite" boolean DEFAULT false NOT NULL,
	"notes" text,
	"anilist_id" integer,
	"mal_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_anime_status" CHECK ("anime"."status" IN ('VISTO','VIENDO','EN_ESPERA','ABANDONADO','PENDIENTE')),
	CONSTRAINT "ck_anime_format" CHECK ("anime"."format" IS NULL OR "anime"."format" IN ('TV','MOVIE','OVA','ONA','SPECIAL')),
	CONSTRAINT "ck_anime_score" CHECK ("anime"."score" IS NULL OR ("anime"."score" >= 0 AND "anime"."score" <= 10)),
	CONSTRAINT "ck_anime_year" CHECK ("anime"."year" IS NULL OR ("anime"."year" >= 1900 AND "anime"."year" <= 2200))
);
--> statement-breakpoint
CREATE TABLE "anime_cover" (
	"anime_id" uuid PRIMARY KEY NOT NULL,
	"mime" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"thumb_bytes" "bytea",
	"width" integer,
	"height" integer,
	"size_bytes" integer,
	"source_url" text,
	"checksum" text NOT NULL,
	"drive_file_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_anime_cover_mime" CHECK ("anime_cover"."mime" IN ('image/webp','image/jpeg','image/png','image/avif'))
);
--> statement-breakpoint
CREATE TABLE "continue_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"anime_id" uuid NOT NULL,
	"site_id" uuid,
	"url" text NOT NULL,
	"label" text,
	"season" integer,
	"episode" integer,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_continue_link_url" CHECK ("continue_link"."url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"anime_id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"season" integer,
	"episode" integer,
	"percent" integer,
	"label" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_progress_kind" CHECK ("progress"."kind" IN ('COMPLETO','TEMPORADA','EPISODIO','PORCENTAJE','CUSTOM')),
	CONSTRAINT "ck_progress_percent" CHECK ("progress"."percent" IS NULL OR ("progress"."percent" >= 0 AND "progress"."percent" <= 100)),
	CONSTRAINT "ck_progress_season" CHECK ("progress"."season" IS NULL OR "progress"."season" >= 0),
	CONSTRAINT "ck_progress_episode" CHECK ("progress"."episode" IS NULL OR "progress"."episode" >= 0)
);
--> statement-breakpoint
CREATE TABLE "anime_genre" (
	"anime_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	"confidence" numeric(4, 3),
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_anime_genre" PRIMARY KEY("anime_id","genre_id"),
	CONSTRAINT "ck_anime_genre_confidence" CHECK ("anime_genre"."confidence" IS NULL OR ("anime_genre"."confidence" >= 0 AND "anime_genre"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "genre" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_genre_kind" CHECK ("genre"."kind" IN ('OFICIAL','IA','USUARIO'))
);
--> statement-breakpoint
CREATE TABLE "streaming_mirror" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_streaming_mirror_url" CHECK ("streaming_mirror"."url" ~* '^https?://')
);
--> statement-breakpoint
CREATE TABLE "streaming_site" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"brand_color" text,
	"icon_key" text,
	"is_global" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_streaming_site_kind" CHECK ("streaming_site"."kind" IN ('GRATIS','PAGO','MIXTO')),
	CONSTRAINT "ck_streaming_site_propiedad" CHECK (("streaming_site"."is_global" = true AND "streaming_site"."user_id" IS NULL) OR ("streaming_site"."is_global" = false AND "streaming_site"."user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "ai_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"anime_id" uuid,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ai_job_status" CHECK ("ai_job"."status" IN ('PENDIENTE','OK','ERROR','OMITIDO'))
);
--> statement-breakpoint
CREATE TABLE "import_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"rows_total" integer DEFAULT 0 NOT NULL,
	"rows_created" integer DEFAULT 0 NOT NULL,
	"rows_duplicate" integer DEFAULT 0 NOT NULL,
	"rows_error" integer DEFAULT 0 NOT NULL,
	"report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime" ADD CONSTRAINT "anime_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_cover" ADD CONSTRAINT "anime_cover_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continue_link" ADD CONSTRAINT "continue_link_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genre" ADD CONSTRAINT "anime_genre_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genre" ADD CONSTRAINT "anime_genre_genre_id_genre_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaming_mirror" ADD CONSTRAINT "streaming_mirror_site_id_streaming_site_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."streaming_site"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaming_site" ADD CONSTRAINT "streaming_site_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_job" ADD CONSTRAINT "ai_job_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job" ADD CONSTRAINT "import_job_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_password_reset_token_hash" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_password_reset_expires" ON "password_reset_tokens" USING btree ("expires_at") WHERE "password_reset_tokens"."used_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_password_reset_user" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_deleted_at" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_anime_user_title_norm" ON "anime" USING btree ("user_id","title_normalized");--> statement-breakpoint
CREATE INDEX "idx_anime_title_norm_trgm" ON "anime" USING gin ("title_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_anime_user_status" ON "anime" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_anime_user_updated" ON "anime" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_anime_user_created" ON "anime" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_anime_user_year" ON "anime" USING btree ("user_id","year");--> statement-breakpoint
CREATE INDEX "idx_anime_user_anilist" ON "anime" USING btree ("user_id","anilist_id") WHERE "anime"."anilist_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_anime_user_favorito" ON "anime" USING btree ("user_id") WHERE "anime"."is_favorite" = true;--> statement-breakpoint
CREATE INDEX "idx_anime_cover_checksum" ON "anime_cover" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "idx_continue_link_anime_used" ON "continue_link" USING btree ("anime_id","last_used_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_anime_genre_genre" ON "anime_genre" USING btree ("genre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_genre_slug" ON "genre" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_genre_kind" ON "genre" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_streaming_mirror_site" ON "streaming_mirror" USING btree ("site_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_streaming_site_slug" ON "streaming_site" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_streaming_site_user" ON "streaming_site" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ai_job_user" ON "ai_job" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ai_job_anime" ON "ai_job" USING btree ("anime_id");--> statement-breakpoint
CREATE INDEX "idx_import_job_user" ON "import_job" USING btree ("user_id","created_at" DESC NULLS LAST);