ALTER TABLE "orders" ADD COLUMN "delivery_person_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_person_id_delivery_persons_id_fk" FOREIGN KEY ("delivery_person_id") REFERENCES "public"."delivery_persons"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
