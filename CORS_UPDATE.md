# CORS Configuration Update

## Changes Made

Updated CORS configuration to allow requests from Cloudflare deployments:

### 1. HTTP CORS (main.ts)
- Added support for `*.workers.dev` domains (Cloudflare Workers)
- Added support for `*.pages.dev` domains (Cloudflare Pages)
- Maintains existing support for localhost, LAN, and configured origins

### 2. WebSocket CORS (realtime.gateway.ts)
- Applied same Cloudflare domain patterns
- Ensures WebSocket connections work from deployed frontend

## Deployment Steps

### If Backend is on Heroku:

1. Commit and push the changes:
```bash
git add backend/src/main.ts backend/src/realtime/realtime.gateway.ts
git commit -m "Update CORS to allow Cloudflare domains"
git push heroku main
```

2. Verify deployment:
```bash
heroku logs --tail --app carefam-lab
```

### If Backend is Running Locally:

1. Restart the backend server:
```bash
cd backend
npm run start:dev
```

## Testing

After deploying the backend, test from your Cloudflare frontend:
- URL: `https://lab-frontend.dicksonhardy7.workers.dev`
- Try logging in
- Check browser console for CORS errors (should be gone)

## Allowed Origins

The backend now accepts requests from:
1. Configured origin (from `CORS_ORIGIN` env var)
2. Localhost and 127.0.0.1 (any port)
3. LAN addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
4. Cloudflare Workers domains (*.workers.dev)
5. Cloudflare Pages domains (*.pages.dev)
6. Requests with no origin (Electron, mobile apps)

## Security Note

The Cloudflare domain patterns are intentionally broad to support:
- Development deployments
- Preview deployments
- Production deployments

For stricter security in production, you can:
1. Set specific domain in `CORS_ORIGIN` environment variable
2. Remove the wildcard Cloudflare patterns
3. Use only the exact production domain
