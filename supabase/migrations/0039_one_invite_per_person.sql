-- 0039: one invite code per person, enforced rather than intended.
--
-- `src/lib/social.ts` and `mobile/src/services/crew.ts` both implement
-- "get or create", both document one code per person, and both are read-then-
-- write with nothing between the read and the write:
--
--   select code from invites where user_id = me      -- none
--   insert into invites (user_id, code) values (...)
--
-- `invites_pkey` is on `code`. Nothing is unique on `user_id`. So two calls
-- that interleave both find no row, both generate a DIFFERENT code, and both
-- inserts succeed. One person, two live invite links.
--
-- That breaks the property the comments claim. From `social.ts`:
--
--   A new code per share would leave a trail of live links nobody can account
--   for; one code means "revoke my invite link" is a single delete.
--
-- With two rows it is not a single delete, and the second link keeps working
-- after the first is revoked, which is the exact failure the design was chosen
-- to avoid.
--
-- Reachable in ordinary use: the web and the phone both call it, a slow first
-- request followed by a retry calls it twice, and the button's `disabled`
-- guard is React state, which is asynchronous and cannot be relied on to
-- serialise a network call.
--
-- Measured before applying: 2 invite rows, 0 users holding more than one. So
-- this constraint can be added without repairing anything, which is the cheap
-- moment to add it and the reason not to wait until it has bitten.
--
-- The clients are updated in the same commit to treat a unique violation as
-- "somebody else won the race", re-read, and return the winning code. Without
-- that the constraint turns a silent duplicate into a visible error, which is
-- better but still not right.
create unique index if not exists invites_one_per_user on public.invites (user_id);

comment on index public.invites_one_per_user is
  'One code per person. The get-or-create in social.ts and crew.ts is a '
  'read-then-write with no lock, so without this two interleaved calls each '
  'insert a different code and "revoke my invite" stops being a single delete.';
