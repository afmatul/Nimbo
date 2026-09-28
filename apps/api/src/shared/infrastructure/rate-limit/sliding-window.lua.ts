/**
 * Ventana deslizante atómica (001 plan §6.7). Un *sorted set* por regla, con la marca de tiempo como puntaje.
 *
 * - `KEYS[i]`: `<key>:<windowSeconds>` de la regla `i`.
 * - `ARGV[1]`: ahora en ms (del `IClock`); `ARGV[2]`: miembro único de esta solicitud.
 * - `ARGV[3 + 2(i-1)]`, `ARGV[4 + 2(i-1)]`: límite y ventana en ms de la regla `i`.
 *
 * Primero limpia las entradas viejas y decide para **todas** las reglas; solo si todas permiten agrega la
 * solicitud (las rechazadas no cuentan) y renueva el `PEXPIRE` con la ventana. Devuelve `0` si se permite o los ms
 * que faltan para reintentar: el máximo, entre las reglas violadas, de (entrada más vieja + ventana − ahora).
 */
export const SLIDING_WINDOW_SCRIPT = `
local now = tonumber(ARGV[1])
local member = ARGV[2]
local retry_after = 0

for i, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[1 + 2 * i])
  local window = tonumber(ARGV[2 + 2 * i])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
  if redis.call('ZCARD', key) >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local wait = tonumber(oldest[2]) + window - now
    if wait > retry_after then
      retry_after = wait
    end
  end
end

if retry_after > 0 then
  return retry_after
end

for i, key in ipairs(KEYS) do
  local window = tonumber(ARGV[2 + 2 * i])
  redis.call('ZADD', key, now, member)
  redis.call('PEXPIRE', key, window)
end

return 0
`;
