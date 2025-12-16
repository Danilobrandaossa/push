CREATE TYPE "public"."automation_type" AS ENUM('SUBSCRIPTION', 'RECURRING');--> statement-breakpoint
CREATE TYPE "public"."automation_frequency" AS ENUM('DAILY', 'WEEKLY');--> statement-breakpoint
CREATE TABLE "automation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"appId" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "automation_type" NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"notificationTemplate" jsonb NOT NULL,
	"delayMinutes" integer,
	"frequency" "automation_frequency",
	"timeOfDay" text,
	"daysOfWeek" jsonb,
	"startDate" timestamp(3) with time zone,
	"endDate" timestamp(3) with time zone,
	"nextRunAt" timestamp(3) with time zone,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_appId_app_id_fk" FOREIGN KEY ("appId") REFERENCES "app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "automationId" uuid;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_automationId_automation_id_fk" FOREIGN KEY ("automationId") REFERENCES "automation"("id") ON DELETE set null ON UPDATE no action;

