type Row = Record<string, unknown>;

/** A contact's ten most used fields, for the Simplify option. */
export function simplifyContact(c: Row): Row {
	return {
		id: c.id,
		project_id: c.project_id,
		name: c.name,
		email: c.email,
		phone: c.phone,
		tags: c.tags,
		orders_count: c.orders_count,
		total_spent: c.total_spent,
		currency: c.currency,
		last_seen_at: c.last_seen_at,
	};
}

/** An order's ten most used fields, with the customer flattened, for the Simplify option. */
export function simplifyOrder(o: Row): Row {
	const customer = (o.customer ?? {}) as Row;
	return {
		id: o.id,
		project_id: o.project_id,
		number: o.number,
		status: o.status,
		total: o.total,
		currency: o.currency,
		customer_name: customer.name ?? null,
		customer_email: customer.email ?? null,
		item_count: Array.isArray(o.items) ? o.items.length : 0,
		created_at: o.created_at,
	};
}
