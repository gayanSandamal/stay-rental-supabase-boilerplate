# Easy Rent MCP server & Claude connector

Easy Rent runs a remote [Model Context Protocol](https://modelcontextprotocol.io)
server **inside the same Next.js app on Vercel** as the website. Anyone with an
Easy Rent account can add it to Claude as a **custom connector** and then just
ask: *"find me a 2-bedroom house in Nugegoda under LKR 80,000 with a
generator"*, *"how are my listings doing this week?"*, *"list my apartment in
Kandy for 65k"*.

| | |
|---|---|
| Connector URL | `https://easyrent.lk/mcp` |
| Transport | Streamable HTTP, stateless, JSON responses (no SSE, no sessions) |
| Protocol versions | `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` |
| Auth | OAuth 2.1 — Easy Rent is its own authorization server |
| Feature flag | `enableMcpConnector` (OFF by default; Back Office → Settings) |
| Migration | `0067_mcp_connector.sql` |

## Turning it on

1. **Migrate production first** (CLAUDE.md: before the deploy lands):
   `pnpm db:migrate-all` against prod, then `pnpm db:check-drift`. It adds three
   tables (`mcp_oauth_clients`, `mcp_oauth_grants`, `mcp_oauth_codes`) and two
   `audit_action` values. Nothing existing is touched.
2. Deploy. No new environment variables are needed.
3. Back Office → Settings → **MCP connector (Claude)** → ON.
4. Check discovery from a terminal:
   ```
   curl -s https://easyrent.lk/.well-known/oauth-protected-resource/mcp
   curl -s https://easyrent.lk/.well-known/oauth-authorization-server
   curl -si -X POST https://easyrent.lk/mcp -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'   # → 401 + WWW-Authenticate
   ```

## Connecting Claude (what users do)

Also shown in the app at **Dashboard → Connected apps**.

1. Claude → **Settings → Connectors → Add custom connector**.
2. Name: `Easy Rent`. URL: `https://easyrent.lk/mcp`. Leave the OAuth client
   fields empty (Claude registers itself).
3. **Connect** → Easy Rent's sign-in page (if not signed in) → the consent screen
   → **Approve and connect**.

On Team/Enterprise plans an owner adds the connector once for the org; each
member still connects their own Easy Rent account. Claude Code:
`claude mcp add --transport http easyrent https://easyrent.lk/mcp`, then `/mcp`
to sign in.

## How auth works

```
Claude                       easyrent.lk
  │ POST /mcp (no token) ───────▶ 401  WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/mcp"
  │ GET  protected-resource ─────▶ { authorization_servers: ["https://easyrent.lk"] }
  │ GET  /.well-known/oauth-authorization-server
  │ POST /api/oauth/register ────▶ client_id            (RFC 7591, open registration)
  │ browser → /oauth/authorize ──▶ sign in (existing Supabase session) → consent screen
  │                              ◀ 303 redirect_uri?code=…&state=…&iss=…
  │ POST /api/oauth/token ───────▶ access_token (1 h) + refresh_token (60 d, rotating)
  │ POST /mcp  Authorization: Bearer er_at_… ▶ tools
```

- **PKCE S256 is mandatory**; `plain` and the implicit flow do not exist.
- **Every secret is stored as sha256** — client secrets, codes, access and
  refresh tokens. Tokens are prefixed (`er_at_`, `er_rt_`, `er_ac_`) so a leaked
  one is recognisable.
- **Refresh tokens rotate.** Presenting a rotated-away refresh token is treated
  as theft and revokes the whole grant (OAuth 2.1 §4.3.1). So is replaying an
  authorization code.
- **Tokens are audience-bound** to the host they were minted on (RFC 8707): a
  preview-deployment token is refused by production.
- **A ban or soft delete takes effect on the next call** — the token lookup joins
  a live, unbanned user, the same promise `getUser()` makes for browsers.
- **No grant while impersonating.** The consent POST refuses, so a token can only
  ever act as the person who approved it.
- **The consent screen leads with the redirect host**, not the client name: open
  registration means `client_name` is whatever the registrant typed.
- **CSRF**: the decision POST (`/api/oauth/authorize`) requires a same-origin
  `Origin`/`Referer`, and Supabase cookies are `SameSite=Lax` anyway.

### Scopes

| Scope | Grants |
|---|---|
| `read` | Search, listing details, your account, listings, stats, saved alerts, notifications |
| `write` | Create/edit/archive your listings, saved alerts, contact numbers, notification state |
| `admin` | Back-office tools. **Offered only to ops/admin, never pre-ticked**, and the role is still checked on every call |

The user can untick `write` / `admin` on the consent screen.

## How tools are built — the one rule

**Tools call the app's own route handlers in-process; they never re-implement a
business rule.** `lib/mcp/call-route.ts` builds the same request the dashboard
sends and hands it to the same handler (`POST /api/listings`,
`PUT|PATCH /api/listings/[id]`, `/api/saved-searches`, the visibility routes…).

The bridge is `lib/mcp/principal.ts`: `/mcp` resolves the bearer token, then
runs everything inside `runAsMcpUser(user, …)` (AsyncLocalStorage), and
`getUser()` checks that store **before** cookies. So every route handler
underneath sees the connector's user exactly as if they were in the browser —
same role checks, same ownership checks, same moderation queueing, re-approval
on edit, duplicate detection, tenant→landlord upgrade, audit logging and owner
notices. A new rule added to a route handler applies to the connector for free.

Consequences worth knowing:

- **Rate limits are per user, not per IP.** Every Claude call comes from a few
  Anthropic IPs; `callRoute` sets `x-forwarded-for: mcp-user-<id>` so each user
  gets their own bucket at browser limits. `/mcp` itself is limited to the
  default 60 requests/min per user.
- **Search goes through `/api/listings/paginated`**, so the paid-visibility
  ranking, premium/exclusive and early-access rules, impressions and demand
  logging all apply. Results label promoted listings (`promoted: ["featured"]`)
  so the model can say which are paid placements.
- **Photos cannot be added through MCP.** They must live in Easy Rent storage
  (next/image refuses other hosts; moderation reads the stored original) and an
  MCP client cannot upload a file. `create_listing` returns the edit URL.
- **Listings are never hard-deleted** through MCP — `archive_listing` only.
- **Visibility activation stays manual**: `admin_activate_visibility` requires
  `paymentConfirmed: true` and the underlying routes are ops/admin-only.

## Tools

| Tool | Scope | Who | What |
|---|---|---|---|
| `search_listings` | read | all | Search with every rental filter (power backup, water, fibre, deposit months…) |
| `get_listing` | read | all | Full details + landlord's published numbers; owner/staff see non-active ones |
| `search_locations` | read | all | Sri Lankan town lookup for exact city names |
| `get_my_account` | read | all | Who the connection acts as, role, plan, scopes |
| `list_saved_searches` | read | all | Saved alerts |
| `create_saved_search` | write | all | Save an alert (warns when the account has no real email) |
| `delete_saved_search` | write | all | |
| `list_notifications` | read | all | In-app notifications |
| `mark_notifications_read` | write | all | One or all |
| `list_my_listings` | read | all | Own listings + views, contact taps, rent comparison |
| `list_my_contact_numbers` | read | all | |
| `add_contact_number` | write | all | |
| `create_listing` | write | all | Free; lands `pending`; upgrades tenant → landlord like the web form |
| `update_listing` | write | all | Partial edit; a live listing goes back to review |
| `archive_listing` | write | all | Also pulls it from Easy Rent's social accounts |
| `request_listing_review` | write | all | Re-submit a rejected listing |
| `renew_listings` | write | all | Agency plan bulk renew |
| `admin_platform_stats` | admin | ops, admin | Counts by status/role |
| `admin_list_listings` | admin | ops, admin | Review queue and any status |
| `admin_review_listing` | admin | ops, admin | Approve / reject, verified / visited |
| `admin_activate_visibility` | admin | ops, admin | Boost / Feature / Urgent / bundle after offline payment |
| `admin_recent_audit_log` | admin | admin | |

Adding a tool: write it with `defineTool` in `lib/mcp/tools/*.ts`, give it a
zod `input` (it is both validator and advertised JSON Schema — see
`lib/mcp/json-schema.ts`, which throws on unsupported zod types), the right
`scope`, honest `annotations`, and route any write through `ctx.callRoute`.
`tests/unit/mcp-server.test.ts` checks every registered tool.

## Operating it

- **Kill switch**: `enableMcpConnector` OFF → `/mcp`, `/api/oauth/register` and
  `/api/oauth/token` answer 503 and the consent screen refuses. Grants are kept,
  so turning it back on needs nobody to reconnect. Revocation keeps working.
- **Users disconnect** at Dashboard → Connected apps (audit:
  `mcp_connector_revoked`). New connections log `mcp_connector_authorized`.
- **Revoke everything for one user** (e.g. compromised account):
  `UPDATE mcp_oauth_grants SET revoked_at = now() WHERE user_id = <id> AND revoked_at IS NULL;`
- Spent/expired authorization codes are purged opportunistically by the token
  endpoint. Client rows are tiny and kept.

## Files

```
app/mcp/route.ts                         MCP endpoint
app/oauth/authorize/page.tsx             consent screen
app/api/oauth/{register,token,revoke,authorize}/route.ts
app/api/oauth/{authorization-server,protected-resource}-metadata/route.ts   (.well-known rewrites in next.config.ts)
app/(dashboard)/dashboard/connected-apps/ Connected apps page
lib/mcp/server.ts                        JSON-RPC dispatch, protocol negotiation
lib/mcp/principal.ts                     getUser() bridge (AsyncLocalStorage)
lib/mcp/call-route.ts                    in-process route-handler calls
lib/mcp/oauth/{config,store,authorize,metadata}.ts
lib/mcp/tools/{renter,landlord,admin,shared,index}.ts
```
