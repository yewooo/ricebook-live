# AWS demo deployment

Status (2026-10-21): EC2/S3 infrastructure creation submitted; application startup and live S3 verification pending runtime configuration and acceptance checks. Do not claim AWS deployment complete yet.

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
- Runtime secrets are intended for one Standard SecureString parameter `/ricebook-live/runtime`, encrypted with the AWS-managed SSM key. Copying existing secrets to AWS requires user authorization.

## HTTPS and endpoint lifecycle

The initial zero-domain-purchase demo uses `ricebook-live.<public-ip>.sslip.io` with a separately issued TLS certificate. This depends on an external DNS service. No wildcard certificate is used. Automatic public IP may change after stop/start; the endpoint, Atlas whitelist and Google callback must then be updated. Do not confuse reboot with stop/start.

## Provisioning

Review `infra/aws/stack.json`, especially the target account, region and default VPC, before uploading to CloudFormation. The committed template is specific to this demo environment. It contains no secrets. `infra/aws/bootstrap.sh` is the readable bootstrap source embedded in the template.

The bootstrap waits on private runtime configuration before building/running the app. If configuration is absent, systemd retries once a minute. Updating code after the initial git clone requires a pull/build/restart through SSM; no SSH key is required.

## Acceptance checks still required

1. Confirm CloudFormation completion, one instance and 8 GiB disk, Standard CPU credits, Free plan retained.
2. Confirm the runtime parameter is Standard/SecureString and scoped to the instance role.
3. Allow only the EC2 public IP in Atlas; add the exact AWS HTTPS callback to Google OAuth.
4. Verify HTTPS readiness, real sign-in, private-room permissions and realtime history after refresh.
5. Upload a synthetic avatar, confirm the private S3 object exists, authenticated image read succeeds and anonymous access is denied.
6. Reboot the application and verify history/session recovery, without confusing this with multi-instance availability.
7. Review credits/cost activity; do not claim spending figures are real-time.

## Cleanup

The media bucket has a Retain policy to protect user uploads. Deleting a stack will not delete that bucket or its data. Terminating an instance is irreversible and must be explicitly authorized; root disk deletion is enabled on termination. Identify and review retained resources and CloudFormation template storage separately. Stopping EC2 alone does not release disk storage.
