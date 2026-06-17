export function now(): number {
  return Date.now();
}

export function secondsToMs(
  seconds: number
): number {
  return seconds * 1000;
}

export function isExpired(
  renewTime: string,
  leaseDurationSeconds: number
): boolean {
  const renewedAt =
    new Date(renewTime).getTime();

  const expiresAt =
    renewedAt +
    secondsToMs(
      leaseDurationSeconds
    );

  return now() > expiresAt;
}