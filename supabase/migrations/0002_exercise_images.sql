-- Exercise thumbnails. Nullable on purpose: an unmatched exercise renders a
-- muscle-group initial tile instead, and no flow ever waits on an image.
-- Images live in public/exercises/ and are served by Vercel, not hotlinked.

alter table public.exercises
  add column if not exists image_url text;
