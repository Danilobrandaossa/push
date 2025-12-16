-- Criar tabela device se não existir
CREATE TABLE IF NOT EXISTS "device" (
	"id" uuid PRIMARY KEY NOT NULL,
	"appId" uuid NOT NULL,
	"token" text NOT NULL,
	"category" "category",
	"platform" "platform" NOT NULL,
	"userId" text,
	"status" "device_status" DEFAULT 'ACTIVE' NOT NULL,
	"metadata" jsonb,
	"webPushP256dh" text,
	"webPushAuth" text,
	"lastSeenAt" timestamp(3) with time zone,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_appId_token_userId_unique" UNIQUE("appId","token","userId")
);--> statement-breakpoint

-- Criar tabela deliveryLog se não existir
CREATE TABLE IF NOT EXISTS "deliveryLog" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notificationId" uuid NOT NULL,
	"deviceId" uuid NOT NULL,
	"status" "delivery_status" NOT NULL,
	"providerResponse" jsonb,
	"errorMessage" text,
	"attemptCount" integer DEFAULT 1,
	"sentAt" timestamp(3) with time zone,
	"deliveredAt" timestamp(3) with time zone,
	"openedAt" timestamp(3) with time zone,
	"clickedAt" timestamp(3) with time zone,
	"platform" text,
	"userAgent" text,
	"appVersion" text,
	"osVersion" text,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveryLog_notificationId_deviceId_unique" UNIQUE("notificationId","deviceId")
);--> statement-breakpoint

-- Adicionar foreign keys se não existirem
DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'device_appId_app_id_fk'
	) THEN
		ALTER TABLE "device" ADD CONSTRAINT "device_appId_app_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."app"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'deliveryLog_notificationId_notification_id_fk'
	) THEN
		ALTER TABLE "deliveryLog" ADD CONSTRAINT "deliveryLog_notificationId_notification_id_fk" FOREIGN KEY ("notificationId") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

DO $$ 
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint WHERE conname = 'deliveryLog_deviceId_device_id_fk'
	) THEN
		ALTER TABLE "deliveryLog" ADD CONSTRAINT "deliveryLog_deviceId_device_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint

-- Criar índices se não existirem
CREATE INDEX IF NOT EXISTS "idx_device_app" ON "device"("appId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveryLog_notification" ON "deliveryLog"("notificationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveryLog_device" ON "deliveryLog"("deviceId");

