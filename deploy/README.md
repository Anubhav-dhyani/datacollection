# Deploy mktreport.geu.ac.in on one EC2 instance

These steps assume Ubuntu 24.04 LTS on an x86_64 EC2 instance in `ap-south-1`, the repository copied to `/opt/mktreport`, MongoDB on the same instance, Nginx for HTTPS/static files, and a private S3 bucket for event pictures. A `t3.micro` is suitable only for a small pilot; use `t3.medium` (4 GiB RAM) for a more dependable production starting point. The exact capacity requires load testing with real photos and user patterns.

## 1. Create AWS resources

1. Launch EC2 with Ubuntu Server 24.04 LTS (x86_64), `t3.micro` if testing the smallest size or `t3.medium` for production. Start with at least 30 GiB gp3 EBS storage. Enable EBS encryption and automatic EBS snapshots.
2. Security group inbound: TCP 22 from your own office/VPN IP only; TCP 80 and 443 from users who need the portal. Do not open 27017 or 4000. Outbound HTTPS must reach S3.
3. Allocate and attach an Elastic IP. Ask the administrator of `geu.ac.in` DNS to create an `A` record for `mktreport.geu.ac.in` pointing to that address. This DNS may not be hosted in Route 53.
4. Create a general-purpose S3 bucket in `ap-south-1`, for example `geu-mktreport-photos-ACCOUNTID`. Keep **Block all public access** enabled. Use bucket-owner-enforced object ownership, default SSE-S3 encryption, and enable versioning. Never create a public bucket policy.
5. In S3 **Management > Lifecycle rules**, create a rule scoped to prefix `attachments/` and object tag `state=pending`, expiring current objects after 8 days. Add a second rule to expire noncurrent versions under `attachments/` after 30 days. The example configuration is [s3-lifecycle.example.json](s3-lifecycle.example.json). Do not set an expiration rule for all `attachments/` objects: submitted report pictures must remain.
6. Create an IAM role with trusted service **EC2**. Replace the bucket placeholder in [s3-iam-policy.example.json](s3-iam-policy.example.json) and attach that policy to the role. Attach the role to the EC2 instance using **Actions > Security > Modify IAM role**. The app needs no AWS access key in `.env`.

## 2. Install the server software

Connect with SSH as `ubuntu`, then run:

```bash
sudo apt update
sudo apt install -y curl gnupg nginx snapd
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo -E bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node --version
```

Install the official MongoDB 8.0 package for Ubuntu Noble:

```bash
curl -fsSL https://pgp.mongodb.com/server-8.0.asc | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo 'deb [ arch=amd64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse' | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod
```

On a micro instance, add 2 GiB swap as an emergency buffer. Swap does not replace RAM:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Secure local MongoDB

Keep `/etc/mongod.conf` bound to `127.0.0.1`. Before enabling authentication, open `mongosh` and create an administrator account plus a separate application account. Use different long passwords for the two accounts:

```javascript
use admin
db.createUser({ user: 'mongoAdmin', pwd: passwordPrompt(), roles: [{ role: 'userAdminAnyDatabase', db: 'admin' }, { role: 'readWriteAnyDatabase', db: 'admin' }] })
use geu_complaint_portal
db.createUser({ user: 'mktreport', pwd: passwordPrompt(), roles: [{ role: 'readWrite', db: 'geu_complaint_portal' }] })
```

Use a long random password. In `/etc/mongod.conf`, add:

```yaml
security:
  authorization: enabled
```

Then run `sudo systemctl restart mongod`. Confirm `net.bindIp: 127.0.0.1` remains set. The application URI will be `mongodb://mktreport:PASSWORD@127.0.0.1:27017/geu_complaint_portal?authSource=geu_complaint_portal`; URL-encode special characters in `PASSWORD`.

## 4. Copy and configure the app

On EC2:

```bash
sudo mkdir -p /opt/mktreport /var/www/mktreport
sudo chown ubuntu:ubuntu /opt/mktreport
```

From your Mac, inside this repository, copy the current workspace. This works even before the changes are committed to Git:

```bash
rsync -av --exclude node_modules --exclude .git --exclude .env --exclude dist ./ ubuntu@ELASTIC_IP:/opt/mktreport/
```

On EC2, create `/opt/mktreport/backend/.env` with these values, using your own MongoDB password, bucket name, and first admin password:

```dotenv
MONGODB_URI=mongodb://mktreport:PASSWORD@127.0.0.1:27017/geu_complaint_portal?authSource=geu_complaint_portal
MONGODB_DB_NAME=geu_complaint_portal
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=true
FRONTEND_ORIGIN=https://mktreport.geu.ac.in
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
AWS_REGION=ap-south-1
S3_BUCKET=YOUR_PRIVATE_BUCKET
SEED_ADMIN_NAME=Super Admin
SEED_ADMIN_EMAIL=YOUR_ADMIN_EMAIL
SEED_ADMIN_PASSWORD=YOUR_LONG_INITIAL_PASSWORD
```

Run `chmod 600 /opt/mktreport/backend/.env`. The admin seed values create the first admin only when the database is empty. Back up and restore any existing MongoDB database before starting this app if you need existing accounts and reports. After restoring older reports, run the photo migration in step 7.

Install dependencies and build:

```bash
cd /opt/mktreport/backend
npm ci --omit=dev
cd /opt/mktreport/frontend
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/mktreport/
sudo chown -R www-data:www-data /var/www/mktreport
```

On a micro instance, dependency installation and the frontend build can be slow. If memory is insufficient, build `frontend/dist` on your Mac and copy only the built files to `/var/www/mktreport` on EC2.

## 5. Start the API and Nginx

Copy [mktreport.service](mktreport.service) to `/etc/systemd/system/mktreport.service`, then:

```bash
sudo cp /opt/mktreport/deploy/mktreport.service /etc/systemd/system/mktreport.service
sudo systemctl daemon-reload
sudo systemctl enable --now mktreport
sudo systemctl status mktreport
```

Copy [nginx-mktreport.conf](nginx-mktreport.conf) to `/etc/nginx/sites-available/mktreport`, enable it, and validate:

```bash
sudo cp /opt/mktreport/deploy/nginx-mktreport.conf /etc/nginx/sites-available/mktreport
sudo ln -s /etc/nginx/sites-available/mktreport /etc/nginx/sites-enabled/mktreport
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Install HTTPS after the DNS `A` record resolves to the Elastic IP and port 80 is reachable:

```bash
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx -d mktreport.geu.ac.in
sudo certbot renew --dry-run
```

Check `https://mktreport.geu.ac.in/api/v1/health` returns `{"status":"ok"}`. Sign in and submit a test report with one picture. Confirm its S3 object is under `attachments/` and tagged `state=attached`. The bucket stays private; users view pictures through authenticated `/api/v1/uploads/:id` requests.

## 6. Backups and capacity

Back up MongoDB **outside this EC2 instance** with scheduled `mongodump` archives or EBS snapshots copied to another location. Enable S3 versioning and review its lifecycle/retention. Test a restore before relying on the backup. One EC2 instance is a single point of failure; a stopped, failed, or out-of-disk instance takes the portal and database offline.

Monitor free RAM (`free -h`), disk (`df -h`), MongoDB logs (`journalctl -u mongod`), app logs (`journalctl -u mktreport -f`), CPU credits, and 5xx responses. The micro has 1 GiB RAM for MongoDB, Node, Nginx, and the OS. Start with a small pilot and stagger submissions; move to at least `t3.medium` if users submit photos concurrently or memory/swap usage rises. Count of registered accounts is less important than simultaneous uploads, photo views, and report queries.

## 7. Migrate existing MongoDB photos (only if you have them)

Back up MongoDB first. On EC2, after `.env` and IAM access are ready:

```bash
cd /opt/mktreport/backend
npm run migrate:photos:s3
npm run migrate:photos:s3 -- --apply
```

The first command is a dry run. The second uploads old MongoDB photo bytes to S3 and removes their byte buffers from MongoDB after each successful upload. Run it once before enabling the portal for users. Keep the backup until you have verified historical report pictures load. Existing report links do not change.
