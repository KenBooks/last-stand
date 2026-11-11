// A key's time waiting before its DOM handler, without recording which key or anything the player typed.
export function keyDeliveryDelay(stamped: number, now: number): number {
  const delay = now - stamped;
  return stamped > 0 && Number.isFinite(delay) && delay >= 0 && delay < 3_600_000 ? delay : 0;
}
