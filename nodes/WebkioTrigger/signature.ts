import { createHmac, timingSafeEqual } from 'crypto';

/** How old a delivery's timestamp may be before it is treated as a replay. */
export const TOLERANCE_SECONDS = 300;

/**
 * Check a Webkio delivery's X-Webkio-Signature: "v1=" + hex HMAC-SHA256 of "{timestamp}.{raw body}"
 * keyed with the webhook's secret (returned when the trigger subscribed).
 *
 * Returns true when it verifies, false when it is wrong or stale, and null when there is nothing to
 * check against (no secret, raw body or signature).
 */
export function verifySignature(
	rawBody: string | undefined,
	signature: string | undefined,
	timestamp: string | undefined,
	secret: string | undefined,
	nowSeconds: number = Date.now() / 1000,
): boolean | null {
	if (!secret || !rawBody || !signature || !timestamp) {
		return null;
	}
	const expected =
		'v1=' + createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
	const fresh = Math.abs(nowSeconds - Number(timestamp)) <= TOLERANCE_SECONDS;
	return (
		fresh &&
		signature.length === expected.length &&
		timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
	);
}
