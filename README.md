
# Drug-Authentication-using-Blockchain

![Solidity](https://img.shields.io/badge/Solidity-%23363636.svg?logo=solidity&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Truffle](https://img.shields.io/badge/Truffle-3A2E24?logo=truffle&logoColor=white)

A blockchain-powered application with React frontend.

## Project Structure

project-root/
├── blockchain/          # Smart contracts and deployment scripts
│   ├── client/          # React client for blockchain interactions
├── frontend/            # Main application frontend


## Prerequisites
- Node.js (v18+)
- npm (v9+)
- Truffle Suite (`npm install -g truffle`)
- MetaMask wallet (configured for Sepolia testnet)
- for free testnet sepolia currency use Google Faucet ( 0.05 SepoliaETH )


## Blockchain Setup

### 1. Install Dependencies

cd blockchain
npm install -g truffle

### 2. Environment Configuration
Create `.env` file in the blockchain root with:

MNEMONIC="your 12-word metamask recovery phrase"
INFURA_KEY="your_infura_project_id"

- 🔒 **Security Note:** Never commit `.env` to version control!
- 🔑 Get INFURA_KEY from [Infura Dashboard](https://infura.io/)
- 🗝️ MNEMONIC can be exported from MetaMask (Account Details > Export Private Key)

### 3. Contract Deployment

truffle migrate --network sepolia

**Important:** Ensure sufficient Sepolia test ETH in your deployment account.

### 4. Client Setup

npm install
cd client
npm install


### 5. Client Environment
Create `.env` in `client/` with:

REACT_APP_CONTRACT_ADDRESS="deployed_contract_address"
REACT_APP_NETWORK_ID=11155111
REACT_APP_NETWORK_NAME=sepolia

- 📝 Contract address is displayed after successful migration
- 🌐 Sepolia Network ID: 11155111

### 6. Start Client

npm start


## Frontend Setup


cd frontend
npm install
npm run dev


## Network Configuration

Ensure MetaMask is configured for Sepolia Testnet:
- Network Name: Sepolia
- RPC URL: https://sepolia.infura.io/v3/YOUR_INFURA_KEY
- Chain ID: 11155111
- Currency: ETH
  

## Troubleshooting
- 🚨 Migration Errors: Verify .env variables and network configuration
- 🔗 Connection Issues: Ensure consistent network in MetaMask and .env
- 💸 Deployment Failures: Check Sepolia ETH balance on [Sepolia Faucet](https://sepoliafaucet.com/)
