-- Normalise margin across services with different labour costs.
-- Client still sees one simple currency ("hours"); the multiplier
-- does the economic work behind it.
update public.services set credit_multiplier = 0.75, provider_rate_cents_per_hour = 2200 where slug = 'snow-removal';
update public.services set credit_multiplier = 1.00, provider_rate_cents_per_hour = 2800 where slug = 'cleaning';
update public.services set credit_multiplier = 1.00, provider_rate_cents_per_hour = 2800 where slug = 'landscaping';
update public.services set credit_multiplier = 1.00, provider_rate_cents_per_hour = 2600 where slug = 'junk-removal';
update public.services set credit_multiplier = 1.25, provider_rate_cents_per_hour = 3200 where slug = 'gutters';
update public.services set credit_multiplier = 1.50, provider_rate_cents_per_hour = 4500,
       requires_licensed_provider = true where slug = 'handyman';
