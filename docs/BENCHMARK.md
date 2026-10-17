# Local realtime benchmark

Measured on Apple M3 Pro, 18 GiB RAM, macOS arm64, Node v24.8.0. API, clients and MongoDB share one development machine; no TLS/WAN latency. Three repetitions per scenario.

| Clients | Run | Messages saved | Verified fanout deliveries | Ack p95 (ms) | Errors |
|---:|---:|---:|---:|---:|---:|
| 10 | 1 | 100/100 | 1000/1000 | 12.65 | 0 |
| 10 | 2 | 100/100 | 1000/1000 | 7.74 | 0 |
| 10 | 3 | 100/100 | 1000/1000 | 6.09 | 0 |
| 50 | 1 | 500/500 | 25000/25000 | 42.23 | 0 |
| 50 | 2 | 500/500 | 25000/25000 | 31.17 | 0 |
| 50 | 3 | 500/500 | 25000/25000 | 30.40 | 0 |

Every client joins one room, warms up once, then sends 10 representative ~100-byte messages sequentially while clients run concurrently. Server acknowledges after persistence; each message broadcasts to all connected room members. Acknowledgement timing includes session/membership checks and database write. Message uniqueness and bounded history queries are also verified.

Reproduce with `npm run benchmark` from the root (dependencies must be installed). The script only starts and targets loopback services using a fresh local MongoDB; it does not load the user’s database or accept a remote target. Raw per-run metrics, percentile definitions, environment and methodology are in [benchmark-results.json](benchmark-results.json).

These are bounded burst tests, not an endurance test or capacity ceiling. Simulated users share a Node process with the server. Login/password hashing is excluded. The normal message throttle remains enabled; auth endpoint throttle is raised only for test setup. No comparison baseline was measured, so no percentage improvement is claimed.
