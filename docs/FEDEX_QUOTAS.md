# FedEx API: Quotas & Rate Limits

FedEx uses three throttling mechanisms. This doc summarizes them and how we handle them in ResellDashboard.

## Quota limits (numbers)

| Limit | Scope | Value |
|-------|--------|--------|
| **Org daily quota** | All projects in the organization | Set per org (e.g. 500,000 requests/day in FedEx’s example). Once hit, 429 until 12:00 AM GMT. |
| **Track per project** | Track capability, per project | Default **100,000 requests/day**. All 6 Track endpoints share this. |
| **Rate limit** | Per project, rolling window | **1,400 transactions per 10 seconds** across all APIs in the project. |
| **Auth threshold (burst)** | Per public IP | 3 auth requests per second, sustained 5 seconds → 10‑min penalty (403). |
| **Auth threshold (average)** | Per public IP | 1 auth request per second, sustained 2 minutes → 10‑min penalty (403). |

## 1. Quotas per organization

- **What:** Max API requests from the **entire organization** per day (all projects combined). Exact number is set by FedEx for your org.
- **When exceeded:** `429 Too many requests – Daily transaction quota exceeded. Retry after 12:00AM GMT`
- **Action:** No retry same day; resume after midnight GMT.

## 2. Quotas per API project (Track capability)

- **What:** Track capability (e.g. 6 endpoints) has a **per-project** daily limit (default **100K requests/day**). All Track endpoints share this limit.
- **When exceeded:** `429 Too many requests: Per project daily quota exceeded. Retry after 12:00 AM GMT`
- **Action:** Same as org quota; retry after 12:00 AM GMT.

## 3. Rate limits (per project)

- **What:** **1,400 transactions per 10 seconds** across all APIs in the project.
- **When exceeded:** `429 Too many requests: We have received too many requests in a short duration. Please wait a while to try again.` (retry after 10 seconds.)
- **Action:** Back off and retry after the 10-second window (we surface this in errors so callers can retry).

## 4. Thresholds (Auth only, per IP)

- **Burst:** 3 auth requests per second, sustained for 5 seconds → 10-minute penalty (403 Forbidden).
- **Average:** 1 auth request per second, sustained for 2 minutes → 10-minute penalty.
- **Best practice:** Request an OAuth token once and **reuse it for the full hour**; only request a new token when the current one is about to expire. Our `FedExAuthService` caches the token and refreshes with a 5-minute buffer to avoid hitting this threshold.

## Identifying the violation (429)

| Violation           | Error message |
|---------------------|----------------------------------------------------------------|
| Org daily quota     | `Daily transaction quota exceeded. Retry after 12:00AM GMT`   |
| Project daily quota | `Per project daily quota exceeded. Retry after 12:00 AM GMT`   |
| Rate limit          | `Rate limit threshold exceeded. Retry after 10 seconds` / `too many requests in a short duration` |

## How we fetch tracking status (no constant polling)

- We **do not** poll FedEx on a fixed interval or constantly in the background.
- **When:** Statuses are fetched **on demand** when the user opens the Deliveries screen or pulls to refresh. The client (web or iOS) calls `GET` or `POST` `/api/deliveries/sync`; the server then calls the FedEx (and UPS) APIs once for that sync.
- **Data sources:**
  - **Firebase (Firestore):** We use Firebase to load the list of **purchases** and their **tracking numbers** (and other order fields). Firebase does not provide live carrier status.
  - **FedEx API (and UPS API):** We use these **only** to get the **live status** (shipped, in_transit, out_for_delivery, delivered, exception, unknown) and events for each tracking number. There is no Google Cloud or Firebase service used to “get” tracking status; status comes from the carrier APIs.
- **Per refresh:** One sync can trigger one FedEx (or UPS) request per tracking number in that batch. If you have hundreds of packages, one refresh can send hundreds of requests in a short time, which can hit the **1,400 per 10 seconds** rate limit. We surface 429 with a retry hint; we do not yet throttle or batch requests automatically.

## How we handle it in code

- **fedexApi.ts:** On `429`, we parse the response body and throw an error that includes FedEx’s message and a short hint (e.g. “Retry after 10 seconds” or “Daily quota exceeded; retry after 12:00 AM GMT”). Callers (e.g. deliveries sync) can show this to users or implement retry with backoff for rate-limit responses.
- **fedexAuth.ts:** We request a token only when needed and reuse it until it’s near expiry (5-minute buffer), which keeps us under the auth threshold.

## References

- FedEx developer portal: quotas & rate limits guide (per organization, per project, rate limits, thresholds).
