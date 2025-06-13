DO $$ BEGIN
 CREATE TYPE "public"."discount_type" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."order_status" AS ENUM('Pendente', 'EmPreparo', 'AguardandoRetirada', 'SaiuParaEntrega', 'Entregue', 'Cancelado');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_status" AS ENUM('Pendente', 'Pago');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_type" AS ENUM('Dinheiro', 'Cartao', 'Online');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"is_active" boolean NOT NULL,
	"expires_at" timestamp with time zone,
	"usage_limit" integer,
	"times_used" integer NOT NULL,
	"min_order_amount" numeric(10, 2),
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_persons" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"vehicle_details" varchar(255),
	"license_plate" varchar(20),
	"is_active" boolean NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text,
	"image_url" text,
	"is_promotion" boolean,
	"data_ai_hint" varchar(255),
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"item_notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_address" text NOT NULL,
	"customer_cep" varchar(20),
	"customer_reference_point" text,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" "order_status" NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"estimated_delivery_time" varchar(100),
	"delivery_person" varchar(255),
	"delivery_person_id" text,
	"payment_type" "payment_type",
	"payment_status" "payment_status" NOT NULL,
	"notes" text,
	"optimized_route" text,
	"nfe_link" text,
	"applied_coupon_code" varchar(100),
	"applied_coupon_discount" numeric(10, 2),
	"coupon_id" text
);
