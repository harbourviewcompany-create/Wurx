-- Seed subscription plans. stripe_price_id stays NULL until the
-- corresponding Stripe Prices are created, then backfilled.
insert into public.plans (slug, name, description, monthly_minutes, price_cents, sort_order)
values
  ('starter', 'Starter', '4 hours of home services every month. Great for upkeep.',   240, 17900, 1),
  ('home',    'Home',    '8 hours a month. Our most popular plan.',                   480, 33900, 2),
  ('plus',    'Plus',    '16 hours a month. For larger homes and busy households.',   960, 62900, 3)
on conflict (slug) do update set
  name            = excluded.name,
  description     = excluded.description,
  monthly_minutes = excluded.monthly_minutes,
  price_cents     = excluded.price_cents,
  sort_order      = excluded.sort_order;

-- Seed service catalogue
insert into public.services (slug, name, description, icon, default_duration_minutes, sort_order)
values
  ('cleaning',      'Home Cleaning',   'Kitchens, bathrooms, floors, and general tidying.',        'sparkles',   180, 1),
  ('snow-removal',  'Snow Removal',    'Driveways, walkways, and steps cleared after snowfall.',   'snowflake',   60, 2),
  ('landscaping',   'Lawn & Garden',   'Mowing, trimming, weeding, and seasonal cleanup.',         'leaf',       120, 3),
  ('handyman',      'Handyman',        'Small repairs, mounting, assembly, and odd jobs.',         'wrench',     120, 4),
  ('junk-removal',  'Junk Removal',    'Hauling away unwanted items and clearing space.',          'trash',      120, 5),
  ('gutters',       'Gutter Cleaning', 'Clearing downspouts and gutters before the seasons turn.', 'home',       120, 6)
on conflict (slug) do update set
  name                     = excluded.name,
  description              = excluded.description,
  icon                     = excluded.icon,
  default_duration_minutes = excluded.default_duration_minutes,
  sort_order               = excluded.sort_order;
