# Backend MVP

Simple off-chain backend for the `FreelanceEscrow` app.

## What it does

- Stores user profiles
- Stores project titles and metadata that are not persisted on-chain
- Keeps a lightweight activity log
- Exposes REST endpoints the frontend can call after on-chain actions
- Serves contract/network config from `deployments/sepolia.json`

## Stack

- Node.js built-in `http`
- JSON file persistence in `backend/data/db.json`
- No external backend dependencies required

## Run

From the repo root:

```bash
npm run backend:start
```

The API will be available at:

```text
http://127.0.0.1:8787
```

## Main endpoints

- `GET /health`
- `GET /api/config`
- `GET /api/projects?wallet=0x...`
- `POST /api/projects`
- `PATCH /api/projects/:onChainProjectId`
- `GET /api/activity?wallet=0x...`
- `POST /api/activity`
- `POST /api/users`
- `GET /api/users/:walletAddress`

## Notes

- This backend is meant for MVP/demo use.
- On-chain escrow logic still lives in the smart contract.
- The backend stores app metadata such as project titles, notes, and activity.
