# Sprint 2 local performance probe

An ad-hoc single-machine Node HTTP probe was run with 500 distinct authenticated fixture users, 500 distinct slots and 500 concurrent reservation requests against one local Express process and disposable MongoDB. Production rate limits were relaxed by `NODE_ENV=test`; this is **not** a production-like measurement or a JMeter run.

Observed on the local Windows test environment:

- HTTP 201: 232 requests; persisted reservations: 232.
- Connection errors: 268 (`ECONNREFUSED`).
- Successful-response p90: 1,323 ms. This excludes failed connection attempts and cannot establish the overall p90 target.
- Total elapsed time: 1,389 ms.

The burst did not meet the 500-user acceptance criterion. Investigate the local server/listen backlog, operating-system connection limits and client connection strategy, then repeat with a representative deployment and JMeter ramp-up and concurrency. JMeter was not installed at the time of this initial probe; subsequent JMeter runs are reported below. Run the reproducible supplemental probe with `node backend/scripts/load-local.cjs`; it uses disposable data and exits nonzero when fewer than 500 reservations succeed.

A second ad-hoc probe established 500 HTTP keep-alive connections in batches of 20 before issuing 500 reservation requests simultaneously. All 500 returned HTTP 201 and were persisted, with no warmup or transport failures. Successful-response p90 was **6,971 ms**, and total elapsed time was **7,235 ms**. This exceeds the 3-second response-time target and is not a JMeter result. It uses the same single-process, test-mode setup and requires further investigation under representative conditions. Reproduce with `node backend/scripts/load-warm-local.cjs`.

To reduce client/server event-loop interference, a third probe used separate local Node processes for the load generator and API, with 500 prewarmed connections and pre-generated test JWTs. Before optimizing slot-lock acquisition, it returned 500 HTTP 201 responses with a **4,570 ms p90**. Slot-lock acquisition was then changed from an initial lookup plus insert to one atomic upsert, retaining the unique slot-ID conflict behavior. Two subsequent runs each returned 500 HTTP 201 responses with **1,451 ms** and **3,030 ms** p90 respectively. The second run still exceeds the target, and this limited local sample does not establish performance acceptance. Reproduce with `node backend/scripts/load-separated-local.cjs`. All runs use disposable MongoDB and relaxed test-mode rate limits; production-like verification remains outstanding.

## Apache JMeter 5.6.3 local runs

Using Java 21, `backend/performance/reservation-500.jmx` and `backend/scripts/run-jmeter-local.cjs`, three additional isolated runs used a separate JMeter process, one local Express worker, disposable MongoDB, distinct fixture users/slots, a synchronized release after ramp-up, and relaxed test-mode rate limits. These first runs did not prewarm connections; the current plan includes warmup, as detailed below. No real credentials or shared databases were used.

| Concurrent threads | HTTP 201 | Connection errors | p90 for all samples | p90 for successful responses |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 0 | 1,427 ms | 1,427 ms |
| 200 | 200 | 0 | 2,436 ms | 2,436 ms |
| 500 | 252 | 248 `HttpHostConnectException` | 3,041 ms | 3,070 ms |

The 500-thread run **failed**: 49.6% of requests failed before reaching the application, and p90 was over three seconds. This single local Windows host is not production-like; the result cannot isolate application capacity from local network/listener limits. A representative multi-host deployment test and investigation of the connection failures are still required. JMeter's temporary raw logs/fixture files are deleted after each run; only this sanitized summary is retained.

The JMeter plan was then extended to warm each HTTP connection before the synchronized reservation burst. With the API's default keep-alive timeout, 500 warmups succeeded but **141 of 500 reservations** still failed with `HttpHostConnectException`; successful-response p90 was **2,968 ms**. A diagnostic rerun set the **test worker only** to a 30-second keep-alive timeout: all 500 reservations succeeded, with **5,291 ms p90**. This supports idle-connection expiry as a contributor to the connection failures, but still fails the latency target. It does not justify silently changing production connection settings: proxy limits, resource consumption, rate limiting and a representative deployment need evaluation.

A further instrumented diagnostic with the same 30-second test-only keep-alive returned all 500 HTTP 201s. JMeter measured **5,404 ms p90**, while the API worker measured **4,888 ms p90** from request receipt to completed response for the same 500 successful reservations. This indicates substantial time inside the local API/database path as well as client/network overhead. The instrumentation is limited to the disposable load worker and is not production monitoring.

An additional experiment parallelized two booking database reads while keeping the same diagnostic setup. All 500 requests returned HTTP 201, but JMeter p90 was **6,331 ms** and API-worker p90 was **5,731 ms** in that run. Because the experiment did not improve the measured result, that parallel-query change was reverted; no performance improvement is claimed from it.

To reproduce, set `JMETER_HOME` to a local JMeter 5.6.3 installation and `JMETER_JAVA` to a compatible Java 17 or 21 executable, then run `node backend/scripts/run-jmeter-local.cjs`. Set `VPS_JMETER_USERS` to 100, 200 or 500; the runner uses an ephemeral local MongoDB and generates temporary fixture credentials in memory. Do not point the script at a shared or production environment.
