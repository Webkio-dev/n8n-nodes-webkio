/**
 * The fields that were filled in. The API already treats a blank field as "not sent"; leaving them
 * out keeps requests, and the execution log, to what the user actually set.
 */
export function compact(fields: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		out[key] = value;
	}
	return out;
}
