#!/bin/bash
set -euo pipefail
dnf install -y docker git
systemctl enable --now docker
if [ ! -f /swapfile ]; then
 fallocate -l 2G /swapfile
 chmod 600 /swapfile
 mkswap /swapfile
 swapon /swapfile
 echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
mkdir -p /opt/ricebook-live
cd /opt/ricebook-live
git clone https://github.com/yewooo/ricebook-live.git source
cat > /opt/ricebook-live/start.sh <<'START'
#!/bin/bash
set -euo pipefail
cd /opt/ricebook-live
umask 077
aws ssm get-parameter --name /ricebook-live/runtime --with-decryption --region us-east-2 --query Parameter.Value --output text > runtime.env
TOKEN=$(curl -fsS -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
PUBLIC_IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
DOMAIN=ricebook-live.$PUBLIC_IP.sslip.io
BUCKET=ricebook-live-media-172679943008-us-east-2
# Fixed deployment values override local-origin settings in the private parameter.
printf '\nNODE_ENV=production\nTRUST_PROXY=1\nPORT=3000\nWEB_ROOT=/app/web\nAWS_REGION=us-east-2\nS3_BUCKET=%s\nFRONTEND_ORIGIN=https://%s\nGOOGLE_CALLBACK_URL=https://%s/api/auth/google/callback\n' "$BUCKET" "$DOMAIN" "$DOMAIN" >> runtime.env
if ! docker image inspect ricebook-live:aws >/dev/null 2>&1; then
 docker build -t ricebook-live:aws source
fi
docker rm -f ricebook-app >/dev/null 2>&1 || true
docker run -d --name ricebook-app --restart unless-stopped --network host --env-file runtime.env --log-opt max-size=5m --log-opt max-file=2 ricebook-live:aws
printf '%s {\n reverse_proxy 127.0.0.1:3000\n}\n' "$DOMAIN" > Caddyfile
docker rm -f ricebook-proxy >/dev/null 2>&1 || true
docker run -d --name ricebook-proxy --restart unless-stopped --network host -v /opt/ricebook-live/Caddyfile:/etc/caddy/Caddyfile:ro -v ricebook-caddy-data:/data -v ricebook-caddy-config:/config --log-opt max-size=5m --log-opt max-file=2 caddy:2
START
chmod 700 /opt/ricebook-live/start.sh
cat > /etc/systemd/system/ricebook-live.service <<'SERVICE'
[Unit]
Description=RiceBook Live bootstrap and containers
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/ricebook-live
ExecStart=/opt/ricebook-live/start.sh
Restart=on-failure
RestartSec=60
TimeoutStartSec=1800
[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --now ricebook-live
