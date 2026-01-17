# GitHub Actions CI/CD for Backend API

This workflow automatically deploys the Event Horizon Backend API to your VPS when you push to the `master` branch.

## Setup Instructions

### 1. Add GitHub Secrets

Go to: `https://github.com/EventHorizon6626/BE/settings/secrets/actions`

Add these secrets (same as other repos):

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `SSH_HOST` | Your VPS IP address | `123.45.67.89` |
| `SSH_USERNAME` | SSH username | `vytrieu` |
| `SSH_PRIVATE_KEY` | SSH private key | Content from `~/.ssh/github_actions` |
| `SSH_PORT` | SSH port | `22` |
| `DEPLOY_PATH` | Path to EventHorizon directory | `/home/vytrieu/EventHorizon` |

### 2. Configure Environment Variables on Server

Before first deployment, create `.env` file on your VPS:

```bash
cd ~/EventHorizon/BE
cp .env.example .env
nano .env
```

Required environment variables:
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - Random secure string for JWT
- `SESSION_SECRET` - Random secure string for sessions
- `ALLOWED_ORIGINS` - Comma-separated list of allowed origins

### 3. How It Works

**Triggers:**
- Push to `master` branch
- Manual trigger via GitHub Actions UI

**What it does:**
1. Connects to VPS via SSH
2. Navigates to `BE` directory
3. Pulls latest code from `master` branch
4. Stops existing backend container
5. Rebuilds and starts backend API on port 4000
6. Tests health endpoint
7. Cleans up old Docker images

### 4. Verify Deployment

After deployment completes:
- Health check: `http://your-vps-ip:4000/healthz`
- Auth API: `http://your-vps-ip:4000/api/auth`

### 5. Monitor

View deployment logs:
1. Go to `https://github.com/EventHorizon6626/BE/actions`
2. Click on the latest workflow run
3. View real-time deployment logs

## Troubleshooting

**SSH Connection Failed:**
- Verify secrets are set correctly
- Check server firewall allows SSH

**Port 4000 in use:**
- Workflow stops existing container first
- If issue persists, manually stop: `docker stop eventhorizon-backend-api`

**MongoDB connection failed:**
- Verify `MONGO_URI` in `.env` file
- Check MongoDB is running: `docker ps | grep mongo`
- Test connection: `curl mongodb://localhost:27017`

**Build failed:**
- Check Node.js dependencies in `package.json`
- Verify `.env` file exists on server
- Check logs: `docker-compose logs backend-api`

## Testing

After deployment:
```bash
# Test health
curl http://your-vps-ip:4000/healthz

# Should return: {"ok":true,"ts":1234567890}
```
