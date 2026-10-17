# Resume wording

Use these after you have run the demo, read the implementation and can explain its decisions. Distinguish your original HW7, the reference team's ideas, and the work completed with coding assistance. Do not claim the reference repository as solely yours.

**RiceBook Live — Full-Stack Social & Realtime Collaboration Platform**  
Angular, TypeScript, Node.js, Express, MongoDB, Socket.IO

- Extended an Angular/Express social application with authenticated public and private chat rooms, connecting feed posts to persistent group discussions through a unified account system.
- Implemented MongoDB-backed message history with cursor pagination and a compound unique index for idempotent retries, plus reconnect recovery and client-side message deduplication.
- Enforced room membership and owner permissions across REST and realtime events, and validated authorization, multi-client delivery, session revocation, pagination and retry behavior with 33 backend integration tests and 25 frontend regression tests.

中文讲法：

“我在自己的 HW7 社交网站上增加了实时协作功能。原来用户只能看动态和评论，现在可以从组队动态进入讨论室，邀请其他人实时沟通。我复用了账号和 MongoDB 数据层，重点解决了 HTTP 与 socket 权限一致、消息重试重复、历史分页以及踢人或退出后权限撤销的问题。”

Do not add fabricated concurrent-user counts, latency reductions, uptime, adoption, deployment, or test coverage percentages. Performance bullets require a documented workload and measured results first.

Optional measured-performance bullet (keep the local-workload qualification):

- Validated a 50-client local WebSocket workload across three 500-message runs, observing 30.40–42.23 ms p95 acknowledgement latency with all messages persisted and fanout delivery verified.

This measures a bounded loopback workload on Apple M3 Pro hardware; do not recast it as sustained production throughput or real-user scale. See `BENCHMARK.md` for workload, limits and raw results.
