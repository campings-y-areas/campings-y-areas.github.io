-- PRECONDICIÓN: la consulta de preflight debe devolver cero filas.
-- SELECT user_id, route_id, COUNT(*) AS copies
-- FROM route_usage
-- GROUP BY user_id, route_id
-- HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS route_usage_user_route_unique
ON route_usage(user_id, route_id);

CREATE INDEX IF NOT EXISTS route_usage_user_period
ON route_usage(user_id, billing_period);
