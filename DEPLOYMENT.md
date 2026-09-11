# Live Deployment Guide - AI-Powered Incident Intelligence & Surveillance Platform

This guide explains how to deploy and make your AI-Powered Surveillance Platform live on the web.

---

## Architecture Overview

- **Frontend**: Next.js 16 (React 19, Tailwind CSS 4)
- **Backend**: FastAPI with YOLOv8, PyTorch, OpenCV, WebSockets, and Background Simulation
- **Database & Cache**: PostgreSQL & Redis (with automatic graceful in-memory fallback if not connected)

---

## Option 1: Free Cloud Hosting (Recommended)

This approach costs **$0/month** and requires no server maintenance.

### Step 1: Push latest updates to GitHub

Make sure your repository has the latest production changes (environment variable configs, Dockerfiles, and dependency fixes):

```bash
git add .
git commit -m "Configure production deployment and dynamic API URLs"
git push origin main
```

---

### Step 2: Deploy the Backend

You can choose either **Hugging Face Spaces** (recommended for AI models: 16 GB RAM free) or **Render.com**.

#### Choice A: Hugging Face Spaces (Best for AI / PyTorch, 16 GB RAM Free)
1. Go to [huggingface.co/spaces](https://huggingface.co/spaces) and click **Create new Space**.
2. Name your space (e.g., `surveillance-backend`).
3. Select **Docker** as the Space SDK and choose the **Blank** template.
4. Set visibility to **Public**.
5. Push the backend code or link your GitHub repository.
6. Once deployed, Hugging Face gives you a public HTTPS URL (e.g., `https://yourname-surveillance-backend.hf.space`).

#### Choice B: Render.com (Free Web Service)
1. Go to [render.com](https://render.com) and log in with GitHub.
2. Click **New +** -> **Web Service**.
3. Connect your repository: `https://github.com/Raghuomkar24/AI-Powered-Surveillance-Incident-Detection-Mobile-notification-software`.
4. Configure the service:
   - **Name**: `surveillance-backend`
   - **Root Directory**: leave blank or `backend`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `backend`
   - **Instance Type**: `Free`
5. Under **Environment Variables**, add:
   - `PORT`: `8000`
   - `CORS_ORIGINS`: `*`
   - `TELEGRAM_BOT_TOKEN`: `(optional - your bot token)`
   - `TELEGRAM_CHAT_ID`: `(optional - your chat ID)`
6. Click **Deploy Web Service**.
7. Copy your backend URL (e.g. `https://surveillance-backend.onrender.com`).

---

### Step 3: Deploy the Frontend on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New...** -> **Project**.
3. Import your GitHub repository: `AI-Powered-Surveillance-Incident-Detection-Mobile-notification-software`.
4. In the configuration screen:
   - **Framework Preset**: Next.js (detected automatically).
   - **Root Directory**: Click *Edit* and select `frontend`.
5. Under **Environment Variables**, add:
   - **Key**: `NEXT_PUBLIC_API_URL`
   - **Value**: Your live backend URL from Step 2 (e.g., `https://surveillance-backend.onrender.com` or `https://yourname-surveillance-backend.hf.space`)
6. Click **Deploy**.
7. In ~60 seconds, Vercel will give you a live production URL (e.g. `https://ai-surveillance.vercel.app`).

Your application is now live worldwide! 🎉

---

## Option 2: Single Cloud VPS (AWS, DigitalOcean, Hetzner, Linode)

If you have a Linux virtual machine ($4-$6/mo on DigitalOcean / Hetzner / AWS EC2):

### 1. Connect to your server & clone the repository:
```bash
ssh user@your-server-ip
git clone https://github.com/Raghuomkar24/AI-Powered-Surveillance-Incident-Detection-Mobile-notification-software.git
cd AI-Powered-Surveillance-Incident-Detection-Mobile-notification-software
```

### 2. Launch full stack with Docker Compose:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
This spins up:
- Next.js Frontend on port `3000`
- FastAPI AI Backend on port `8000`
- Redis on port `6379`
- PostgreSQL with PostGIS on port `5432`

### 3. Expose to the web with Nginx / Caddy:
With [Caddy](https://caddyserver.com/) installed, simply create a `/etc/caddy/Caddyfile`:
```caddy
yourdomain.com {
    reverse_proxy localhost:3000
}

api.yourdomain.com {
    reverse_proxy localhost:8000
}
```
Caddy will automatically provision and renew free Let's Encrypt SSL certificates.

---

## Live Telegram Emergency Alerts Setup

To receive instant incident dispatch notifications on mobile:
1. In Telegram, message [@BotFather](https://t.me/BotFather) and send `/newbot` to create your alert bot.
2. Copy the **Bot Token** generated.
3. Start a chat with your new bot and send any message.
4. Open `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` in your browser to find your `chat.id`.
5. Enter these credentials directly in the **Police Dispatch Panel** in your live web app or set them as environment variables (`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`) on your backend host.
