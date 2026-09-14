# Security policy

## Reporting a vulnerability

Please report security problems privately to **contact@webkio.com**, with "Security" in the subject,
rather than in a public issue. Include what you found, how to reproduce it, and which version of
`n8n-nodes-webkio` you used. We aim to reply within three working days, and will credit you when the
fix is released if you would like.

This covers the n8n nodes in this repository. Problems with the Webkio platform itself or its public
API (https://api.webkio.com/v1) go to the same address.

## Supported versions

Only the latest published version of `n8n-nodes-webkio` receives fixes.

## What these nodes do with your data

- Your Webkio API key is stored by n8n as a credential and sent only to the Webkio API, in the
  `Authorization` header.
- The Webkio Trigger checks every webhook delivery's signature (`X-Webkio-Signature`, HMAC-SHA256 with
  the webhook's secret) and drops a delivery whose signature is wrong or more than five minutes old.
- The package has no runtime dependencies, and is published from GitHub Actions with npm provenance.
