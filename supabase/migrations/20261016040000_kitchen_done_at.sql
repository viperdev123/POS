-- the kitchen "done" tab shows when each order was finished
alter table orders add column kitchen_done_at timestamptz;
