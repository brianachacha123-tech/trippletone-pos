-- Migration: Add selling_price to kegs table
-- Keg now has buying_price (cost) and selling_price (target revenue)
-- profit_target = selling_price - buying_price

ALTER TABLE kegs ADD COLUMN IF NOT EXISTS selling_price DECIMAL(12,2) DEFAULT 0;

-- Migrate existing target_price data to selling_price if target_price was used
UPDATE kegs SET selling_price = target_price WHERE selling_price = 0 AND target_price > 0;
