-- brute-force throttle for the shared cashier PIN (columns not granted to authenticated/anon)
alter table settings
  add column pin_fail_count int not null default 0,
  add column pin_locked_until timestamptz;
