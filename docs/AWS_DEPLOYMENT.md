# AWS demo deployment

Status (2026-10-21): AWS demo is live at https://ricebook-live.18.219.2.85.sslip.io. HTTPS readiness, real Google login, private S3 avatar storage and WebSocket messaging were verified against the deployed service.

## Resources and cost boundary

The user authorized one t3.micro, an 8 GiB encrypted gp3 root disk, one private media bucket and a scoped EC2 role, only within the account's Free plan. Do not upgrade the account or enable paid-only services. Free-plan credits are consumed by usage; they are not a claim that EC2, IPv4, or S3 are permanently free. The console showed $100 credit before provisioning, with Free plan ending April 21, 2027 or when credits run out. Billing figures can lag.

No load balancer, NAT Gateway, Elastic IP, Route 53 hosted zone, paid domain, customer-managed KMS key, advanced parameter tier or detailed monitoring is provisioned. CPU credit mode is Standard, not Unlimited. Docker logs are bounded. Avatar objects are overwritten per account instead of accumulating upload versions.

## Architecture

- CloudFormation describes the EC2 instance, launch template, security group, IAM role/profile and S3 bucket.
- Amazon Linux 2023 with Docker runs the existing full-stack app; Caddy terminates HTTPS and proxies WebSockets.
- Ports 80/443 are open for website traffic and ACME; SSH is not open. Administration uses Systems Manager.
- Bucket public access is fully blocked; SSE-S3 encryption is enabled. The instance role can put/get only the avatar prefix in the project bucket, plus read the one runtime parameter.
- The backend uses the AWS SDK credential provider chain and IMDSv2 through the instance role. No persistent AWS access key is created or shipped.
- `S3_BUCKET` opts into S3 avatar storage. A validated PNG/JPEG/WebP/GIF data URL is decoded, bounded to 500 KiB, signature-checked and written before the profile receives its storage reference. Images are served through authenticated app routes.
- `COLLECTION_PREFIX=aws_` separates demo collections within the authorized Atlas database, leaving the Render dataset separate.
- Runtime secrets are stored in one Standard SecureString parameter `/ricebook-live/runtime`, encrypted with the AWS-managed SSM key. Copying existing secrets to AWS requires user authorization.

## HTTPS and endpoint lifecycle

The initial zero-domain-purchase demo uses `ricebook-live.<public-ip>.sslip.io` with a separately issued TLS certificate. This depends on an external DNS service. No wildcard certificate is used. Automatic public IP may change after stop/start; the endpoint, Atlas whitelist and Google callback must then be updated. Do not confuse reboot with stop/start.

## Provisioning

Review `infra/aws/stack.json`, especially the target account, region and default VPC, before uploading to CloudFormation. The committed template is specific to this demo environment. It contains no secrets. `infra/aws/bootstrap.sh` is the readable bootstrap source embedded in the template.

The bootstrap waits on private runtime configuration before building/running the app. If configuration is absent, systemd retries once a minute. Updating code after the initial git clone requires a pull/build/restart through SSM; no SSH key is required.

## Acceptance results (2026-10-21)

- CloudFormation completed; one t3.micro with 8 GiB encrypted disk and Standard CPU credits. No paid-plan upgrade was performed.
- Runtime configuration is Standard/SecureString; Atlas allows the EC2 address /32 and the exact Google callback is saved.
- Nine low-volume live acceptance checks passed: HTTPS/Atlas readiness, registration with Secure/HttpOnly cookie, S3 avatar reference, authenticated image retrieval, anonymous proxy denial, direct S3 denial (403), WebSocket delivery with idempotent retry, persisted history read, and logout revocation.
- Real Google account sign-in reached the feed. After restarting the application container, HTTPS readiness recovered and a browser reload retained the Google session. This is a container restart check, not an EC2 reboot or availability benchmark.
- Backend tests: 36 passed, including signature/size validation and S3 upload failure behavior.
- No AWS load test, multi-instance failover or long-duration availability test was performed. Billing/credit usage can lag and was not treated as real-time cost evidence.

## Cleanup

The media bucket has a Retain policy to protect user uploads. Deleting a stack will not delete that bucket or its data. Terminating an instance is irreversible and must be explicitly authorized; root disk deletion is enabled on termination. Identify and review retained resources and CloudFormation template storage separately. Stopping EC2 alone does not release disk storage.

## Provisioned environment

- Region: `us-east-2`
- Stack: `ricebook-live-aws`
- Instance: `i-0fe1e13c5dc8a1ea8`
- Initial public IPv4: `18.219.2.85`
- Verified HTTPS origin: `https://ricebook-live.18.219.2.85.sslip.io`
- Private media bucket: `ricebook-live-media-172679943008-us-east-2`
- SSM instance management confirmed; SSH remains closed.
- The runtime parameter was created as Standard / SecureString, using `alias/aws/ssm`.
