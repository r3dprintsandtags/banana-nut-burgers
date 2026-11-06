-- Staff can mark a registration as collected in person at the shop.
ALTER TABLE registrations ADD COLUMN manual_shop INTEGER NOT NULL DEFAULT 0;
