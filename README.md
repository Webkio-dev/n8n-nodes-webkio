# n8n-nodes-webkio

[n8n](https://n8n.io) community nodes for [Webkio](https://webkio.com): start a workflow the moment
something happens on your Webkio sites, and add or look things up on them from any workflow.

## Webkio Trigger

Pick an event, and optionally one site:

| Event | When it fires |
|---|---|
| New Order | An order is placed. Card payment may still be pending. |
| Order Paid | Payment for an order is confirmed. |
| New Booking | A customer books an appointment. |
| New Rental Reservation | A customer reserves a rental item. |
| New Subscriber | Someone joins your email list. |
| New Property Enquiry | A visitor enquires about a property listing. |
| New Product Review | A customer reviews a product. |

Activating the workflow registers its webhook with Webkio; deactivating removes it. Every delivery is
checked against the webhook's signing secret, and one with a wrong or stale signature is dropped.
Each item carries the record's fields at the top level (its id as `record_id`), plus `event` and the
`project` (site) with its `timezone`. Timestamps are ISO 8601 in UTC.

## Webkio

| Resource | Operations |
|---|---|
| Contact | Create or Update (matched on email within a site), Get, Get Many (by site or email) |
| Subscriber | Add, optionally to an email list |
| Email List | Get Many |
| Blog Post | Create Draft (published from the Webkio dashboard, never from here) |
| Order | Get, Get Many (by number, customer email, status or site) |

Blank fields are not sent, and the API leaves what is stored alone for any field it does not get.
Contacts need a Webkio plan with the CRM. Adding someone who unsubscribed leaves them unsubscribed.

## Credentials

Create an API key in Webkio under **Settings > API & webhooks**, or in the
[developer console](https://developer.webkio.com/console), and paste it into a **Webkio API**
credential. Your plan needs integrations (Starter and up).

## Links

- [Webkio API reference](https://developer.webkio.com/docs)
- [n8n community nodes](https://docs.n8n.io/integrations/community-nodes/)

## Develop

```bash
npm install
npm run lint
npm test        # builds, then runs the signature tests
npm run dev     # an n8n instance with this node loaded
```

## Release

This folder lives in the Webkio monorepo and is mirrored to https://github.com/Webkio-dev/n8n-nodes-webkio,
which publishes it to npm from GitHub Actions (n8n verifies only packages published with provenance).
Bump the version in `package.json` and `CHANGELOG.md`, commit, then run `./mirror.sh --release`.
