-- Minimal setup to create the sequence and the orders table with display_id

-- Create the sequence for order display IDs
CREATE SEQUENCE IF NOT EXISTS "order_display_id_seq"
    INCREMENT BY 1
    MINVALUE 1
    START WITH 1
    NO CYCLE;

-- Create a minimal orders table for testing display_id
CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT PRIMARY KEY,
    "display_id" VARCHAR(50),
    "customer_name" VARCHAR(255) NOT NULL,
    "customer_address" TEXT NOT NULL,
    "total_amount" DECIMAL(10, 2) NOT NULL,
    "status" VARCHAR(50) DEFAULT 'Pendente' NOT NULL, -- Simplified status for this minimal setup
    "created_at" TIMESTAMPTZ DEFAULT now() NOT NULL,
    "updated_at" TIMESTAMPTZ DEFAULT now() NOT NULL
);
