const SECONDS_PER_MINUTE = 60;

/** «N minutos» (o «1 minuto») de espera, redondeado hacia arriba y nunca menos de uno. */
export const minutesText = (retryAfterSeconds: number): string => {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / SECONDS_PER_MINUTE));
  return minutes === 1 ? '1 minuto' : `${String(minutes)} minutos`;
};
