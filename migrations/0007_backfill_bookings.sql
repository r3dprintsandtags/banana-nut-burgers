-- Backfill CRM bookings from submitted registrations that never got a bookings row.
INSERT INTO bookings (created_at,name,first_name,last_name,contact,email,guests,date,time,service,divers,cruise,note,ip_hash)
SELECT r.created_at,
  trim(coalesce(json_extract(r.data,'$.firstName'),c.first_name,'') || ' ' || coalesce(json_extract(r.data,'$.lastName'),c.last_name,'')),
  coalesce(json_extract(r.data,'$.firstName'),c.first_name,''),
  coalesce(json_extract(r.data,'$.lastName'),c.last_name,''),
  coalesce(json_extract(r.data,'$.phone'),c.phone,''),
  coalesce(json_extract(r.data,'$.email'),c.email,''),
  coalesce(r.participants,1),
  coalesce(nullif(r.planned_date,''), json_extract(r.data,'$.plannedDate'), ''),
  coalesce(json_extract(r.data,'$.plannedTime'), ''),
  coalesce(nullif(r.activity,''), json_extract(r.data,'$.activity'), ''),
  '[]', NULL,
  'From registration ' || r.ref,
  coalesce(r.ip_hash,'')
FROM registrations r
LEFT JOIN customers c ON c.id = r.customer_id
WHERE r.status = 'submitted'
  AND (r.booking_ref IS NULL OR r.booking_ref = '')
  AND coalesce(nullif(r.planned_date,''), json_extract(r.data,'$.plannedDate'), '') <> '';

UPDATE registrations
SET booking_ref = (
  SELECT CAST(b.id AS TEXT) FROM bookings b
  WHERE b.note LIKE '%' || registrations.ref || '%'
  ORDER BY b.id DESC LIMIT 1
)
WHERE status = 'submitted'
  AND (booking_ref IS NULL OR booking_ref = '')
  AND EXISTS (
    SELECT 1 FROM bookings b WHERE b.note LIKE '%' || registrations.ref || '%'
  );
