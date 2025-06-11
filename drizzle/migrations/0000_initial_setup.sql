
-- Drizzle ORM SQL Migration File
-- Migration Number: 0000
-- Migration Timestamp: YYYYMMDDHHMMSS (Drizzle will fill this)

-- Create Enums
DO $$ BEGIN
    CREATE TYPE "order_status" AS ENUM ('Pendente', 'EmPreparo', 'AguardandoRetirada', 'SaiuParaEntrega', 'Entregue', 'Cancelado');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "payment_type" AS ENUM ('Dinheiro', 'Cartao', 'Online');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "payment_status" AS ENUM ('Pendente', 'Pago');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "discount_type" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Sequence for Order Display ID
CREATE SEQUENCE IF NOT EXISTS "order_display_id_seq" START WITH 1 INCREMENT BY 1;

-- Create Tables
CREATE TABLE IF NOT EXISTS "menu_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"category" varchar(100) NOT NULL,
	"description" text,
	"image_url" text,
	"is_promotion" boolean DEFAULT false,
	"data_ai_hint" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL UNIQUE,
	"description" text,
	"discount_type" "discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"usage_limit" integer,
	"times_used" integer DEFAULT 0 NOT NULL,
	"min_order_amount" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "delivery_persons" (
    "id" text PRIMARY KEY NOT NULL,
    "name" varchar(255) NOT NULL,
    "vehicle_details" varchar(255),
    "license_plate" varchar(20),
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "orders" (
	"id" text PRIMARY KEY NOT NULL,
    "display_id" varchar(50), -- Added display_id
	"customer_name" varchar(255) NOT NULL,
	"customer_address" text NOT NULL,
	"customer_cep" varchar(20),
	"customer_reference_point" text,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" "order_status" DEFAULT 'Pendente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"estimated_delivery_time" varchar(100),
	"delivery_person" varchar(255),
    "delivery_person_id" text,
	"payment_type" "payment_type",
	"payment_status" "payment_status" DEFAULT 'Pendente' NOT NULL,
	"notes" text,
	"optimized_route" text,
    "nfe_link" text,
	"applied_coupon_code" varchar(100),
	"applied_coupon_discount" numeric(10, 2),
	"coupon_id" text,
    CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE no action,
    CONSTRAINT "orders_delivery_person_id_fkey" FOREIGN KEY ("delivery_person_id") REFERENCES "delivery_persons"("id") ON DELETE SET NULL ON UPDATE no action
);

CREATE TABLE IF NOT EXISTS "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"quantity" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"item_notes" text,
    CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action,
    CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE restrict ON UPDATE no action
);

-- Add Indexes if necessary, e.g. for frequently queried columns
-- CREATE INDEX IF NOT EXISTS "idx_order_status" ON "orders" ("status");
-- CREATE INDEX IF NOT EXISTS "idx_order_created_at" ON "orders" ("created_at");

COMMENT ON COLUMN "orders"."display_id" IS 'User-friendly sequential ID for orders, e.g., P0001';
