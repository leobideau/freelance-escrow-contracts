# FreelanceEscrow Contracts

Smart contracts for the FreelanceEscrow capstone project at HEC/UNIL.

This repository contains the Solidity contracts, Hardhat configuration, deployment script, and automated test suite for the escrow logic used by the rest of the team.

## Current status

- Core escrow flow implemented
- Milestone flow implemented
- Auto-release implemented
- Cancel/refund implemented
- Dispute flow implemented
- Local test suite passing
- Frontend prototype included under `frontend/`
- Backend MVP included under `backend/`

## Stack

- Solidity `0.8.28`
- Hardhat `^2.22.0`
- OpenZeppelin `^5.1.0`
- ethers v6 via Hardhat Toolbox

## Project structure

```text
freelance-escrow-contracts/
├── contracts/
│   ├── FreelanceEscrow.sol
│   └── mocks/MockUSDC.sol
├── scripts/
│   └── deploy.js
├── test/
│   ├── unit/
│   ├── integration/
│   └── helpers.js
├── docs/
│   ├── FOR_FRONTEND.md
│   ├── FOR_INTEGRATION.md
│   └── FOR_TESTING.md
├── hardhat.config.js
├── package.json
└── .env.example
```

## Install

Use Node.js 20.x.

```bash
npm install
```

## Run the app layers

Backend API:

```bash
npm run backend:start
```

Frontend static app:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/frontend/
```

## Run tests

```bash
npx hardhat test
```

## Coverage

```bash
npm run coverage
```

Latest local result:

- Statements: `100%`
- Branches: `95.38%`
- Functions: `100%`
- Lines: `100%`

## Deploy

Local:

```bash
npx hardhat run scripts/deploy.js
```

Sepolia:

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

Before Sepolia deployment, create a `.env` from `.env.example`.

## Sepolia deployment

Current deployed contracts:

- `MockUSDC`: `0xe0Be1a63F2A12F23b4304262494E4CCeFe6F95E9`
- `FreelanceEscrow`: `0xEda5541b44F17B727285f56E2C82bB8e08C2A82c`

Verification links:

- `MockUSDC`: <https://sepolia.etherscan.io/address/0xe0Be1a63F2A12F23b4304262494E4CCeFe6F95E9#code>
- `FreelanceEscrow`: <https://sepolia.etherscan.io/address/0xEda5541b44F17B727285f56E2C82bB8e08C2A82c#code>

Deployment metadata is stored in [deployments/sepolia.json](deployments/sepolia.json).

## Sepolia smoke test

The main escrow flow was manually validated on Sepolia with real transactions:

1. `faucet()` on `MockUSDC`
2. `approve()` from client to `FreelanceEscrow`
3. `createProject()` with 2 milestones
4. `completeMilestone(0, 0)` by the freelancer
5. `approveMilestone(0, 0)` by the client

Result observed:

- milestone `0` completed and approved on-chain
- freelancer received `98 USDC` net
- platform fee accumulated: `2 USDC`
- project remained `Active` because milestone `1` is still unresolved

Full transaction hashes and notes: [docs/SEPOLIA_SMOKE_TEST.md](docs/SEPOLIA_SMOKE_TEST.md)

## Main contract flows

### Client

- Approve MockUSDC to the escrow contract
- Call `createProject`
- Approve completed milestones with `approveMilestone`
- Cancel inactive work with `cancelProject`
- Raise dispute with `raiseDispute`

### Freelancer

- Call `completeMilestone`
- Claim expired milestone after 14 days with `claimExpiredMilestone`
- Raise dispute with `raiseDispute`

### Owner

- Resolve disputes with `resolveDispute`
- Withdraw fees with `withdrawFees`
- Pause/unpause contract

## Useful docs for the team

- Frontend handoff: [docs/FOR_FRONTEND.md](docs/FOR_FRONTEND.md)
- Integration handoff: [docs/FOR_INTEGRATION.md](docs/FOR_INTEGRATION.md)
- Testing handoff: [docs/FOR_TESTING.md](docs/FOR_TESTING.md)
- Sepolia smoke test: [docs/SEPOLIA_SMOKE_TEST.md](docs/SEPOLIA_SMOKE_TEST.md)
- Design decisions: [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)
- Security review: [SECURITY.md](SECURITY.md)

## Notes

- Payments use a single ERC-20 token set at deployment time.
- `MockUSDC` uses 6 decimals to mimic USDC-style amounts.
- The repository currently focuses on Person 1 scope: smart contracts, tests, deployment, and technical handoff.
