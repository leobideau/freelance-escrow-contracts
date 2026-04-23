# Frontend Prototype

Static frontend prototype for the `FreelanceEscrow` smart contract, designed around the aesthetic reference provided for the app.

## What it does

- Connects to MetaMask
- Targets Sepolia
- Reads `MockUSDC` balance
- Lists projects for the connected wallet as client and freelancer
- Creates a project with milestone amounts in 6-decimal USDC units
- Supports:
  - `approve` for ERC-20 allowance
  - `createProject`
  - `completeMilestone`
  - `approveMilestone`
  - `cancelProject`
  - `raiseDispute`
  - `claimExpiredMilestone`

## Run locally

From the repo root:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173/frontend/
```

## Notes

- This frontend uses the deployed Sepolia addresses from `deployments/sepolia.json`.
- The smart contract does not store a project title on-chain.
- For UX only, project titles entered during creation are saved in browser `localStorage`.
