
# Drug-Authentication-using-Blockchain

![Solidity](https://img.shields.io/badge/Solidity-%23363636.svg?logo=solidity&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Truffle](https://img.shields.io/badge/Truffle-3A2E24?logo=truffle&logoColor=white)

A blockchain-powered application with React frontend.

## Project Structure

project-root/

├── smart contracts/

├── frontend/    


## Prerequisites
- Node.js ( v20.15.1 ) 
- npm (v9+)
- Truffle Suite (`npm install -g truffle`)
- MetaMask wallet (configured for Sepolia testnet)
- for free testnet sepolia currency use Google Faucet ( 0.05 SepoliaETH )

## Blockchain Setup

### 1. Install Dependencies

- `cd "smart contracts"`
- `npm i`
- `npm install -g truffle`

### 2. Environment Configuration

- Create `.env` file in the smart contracts root with:

- MNEMONIC="your 12-word metamask recovery phrase"

- INFURA_KEY="your_infura_project_id"

- 🔑 Get INFURA_KEY from [Infura Dashboard](https://infura.io/)
- 🔑 MNEMONIC can be obtained from MetaMask ( Settings > Security & privacy > Reveal Secret Recovery Phrase )

### 3. Contract Deployment

- `truffle migrate --network sepolia`

**Important:** Ensure sufficient Sepolia test ETH in your deployment account.

- 📝 Contract address is displayed after successful migration

**Important:** Contract address will be display in the terminal of your editor.


## Frontend Setup

### 1. Install Dependencies
- `cd frontend`
- `npm install`


### 2. Environment Variable Setup
Create `.env` in `frontend/` with:

- 🔑 VITE_APP_CONTRACT_ADDRESS="deployed_contract_address"
- 🔑 VITE_APP_NETWORK_ID=11155111
- 🔑 VITE_APP_NETWORK_NAME=sepolia


### 3. local host setup

- `npm run dev`


## Network Configuration

Ensure MetaMask is configured for Sepolia Testnet:
- Network Name: Sepolia

  

## Troubleshooting
- 🚨 Migration Errors: Verify .env variables and network configuration
- 🔗 Connection Issues: Ensure consistent internet connection ( in case of time out issue or any network issue try to redeploy the contract )
- 💸 Deployment Failures: Check Sepolia ETH balance on [Sepolia Faucet](https://sepoliafaucet.com/)
