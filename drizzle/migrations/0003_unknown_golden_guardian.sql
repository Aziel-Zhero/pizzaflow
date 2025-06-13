ALTER TABLE "orders" DROP CONSTRAINT "orders_delivery_person_id_delivery_persons_id_fk";
--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN IF EXISTS "delivery_person_id";