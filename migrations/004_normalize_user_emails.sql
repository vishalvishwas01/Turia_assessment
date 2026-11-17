-- Account email identity is global and case-insensitive.
UPDATE users SET email = lower(btrim(email));
CREATE UNIQUE INDEX users_email_normalized_uq ON users (lower(email));
