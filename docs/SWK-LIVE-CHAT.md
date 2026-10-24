# SWK’s own live chat

The widget, API and operator inbox are SWK code. No third-party chat widget or external chatbot account is required. Messages use persistent Redis-compatible REST storage, which can be supplied by Upstash or an equivalent authenticated HTTPS service. The property assistant remains deterministic and runs locally; it does not claim to be an LLM.

## Activate on Vercel

1. Provision persistent Redis storage and obtain its HTTPS REST URL and token. Choose an appropriate storage region and review the provider’s processing terms. This is infrastructure for SWK’s chat, not a hosted chat widget.
2. Run `node tools/generate-chat-env.cjs` privately on your own machine. It creates private settings and an operator password file without printing credentials. Keep them out of version control.
3. Add these private environment variables in the Vercel project’s Production and Preview environments:

| Setting | Value |
| --- | --- |
| `SWK_CHAT_REDIS_URL` | Database HTTPS REST URL |
| `SWK_CHAT_REDIS_TOKEN` | Database REST token |
| `SWK_CHAT_ADMIN_PASSWORD_SHA256` | Generated password digest |
| `SWK_CHAT_SESSION_SECRET` | Generated random signing secret |
| `SWK_CHAT_ORIGIN` | `https://www.swkpropertiesuae.com` (or the exact production origin if different) |

4. Redeploy. Visit `/swk-inbox/` and use the generated operator password. Enable **Available for live chat** while actively monitoring the inbox. The deployed Vercel URL is also permitted for preview-origin requests.
5. Test from a separate browser session: open SWK Live Chat, give consent, send a message and reply from the inbox. Confirm the reply arrives. Do not perform this test using real identity documents or confidential client details.

Nothing is enabled with a placeholder password. Before configuration the public status is unavailable, sending returns an error, and WhatsApp remains available. A successful local test does not mean production settings have been supplied.

## Behaviour

- Operator sessions use signed, HttpOnly, SameSite=Strict cookies, Secure in Vercel. Sessions expire after eight hours. Rotating the signing secret invalidates them.
- The inbox uses a shared operator account in this version; it does not provide individual staff accounts, roles or staff audit trails. Restrict the password to authorised SWK operators. Use a separate identity service before expanding to a large multi-agent support team.
- Each visitor receives an unguessable conversation token, held in session storage. One visitor cannot read another conversation without that token. Conversation tokens are stored hashed on the server.
- Presence lasts 45 seconds and is refreshed by an available operator viewing the inbox. This is actual session presence; the widget never invents an online agent.
- Messages expire seven days after the most recent message. Closed conversations remain readable until expiration but reject new messages. A conversation accepts at most 200 messages; each message accepts at most 2,000 characters.
- Request validation, same-origin checks, login/visitor rate limits and safe text rendering are included. The server does not expose database tokens or internal errors. Configure Vercel request/firewall limits appropriate to traffic and monitor storage usage.
- Inbox pages are excluded from the sitemap and carry `noindex, nofollow`. The page shell is public; all customer data and actions require API authentication.
- The system polls while a conversation is open. It is not WebSocket streaming. Normal delivery takes several seconds and depends on network/database availability. Staff must keep the inbox open and monitor it; there are no background email or push alerts yet.

## Verification

`node --test tools/chat.test.cjs` verifies authentication, conversation isolation, origin and length checks, login rate limits, expiry, closed threads and honest unconfigured behaviour. `CHROMIUM_PATH=/path/to/chromium node tools/chat-integration.cjs` tests the real browser widget and operator inbox together against an in-memory **test-only** datastore. API entry points never use that datastore in production.

References: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [Upstash REST API](https://upstash.com/docs/redis/features/restapi).
