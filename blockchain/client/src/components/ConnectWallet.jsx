// client/src/components/ConnectWallet.js
import React from 'react';
import { useWeb3 } from '../contexts/Web3Context';

function ConnectWallet() {
    const { connectWallet, isLoading, error, networkError } = useWeb3();

    return (
        <div className="connect-wallet-container">
            <button
                onClick={connectWallet}
                disabled={isLoading}
                className="connect-wallet-button"
            >
                {isLoading ? 'Connecting...' : 'Connect Wallet'}
            </button>
            {/* Display connection or network errors near the button */}
            {error && !isLoading && <p className="error-message" style={{marginTop: '5px', fontSize: '0.8em'}}>{error}</p>}
            {networkError && !isLoading && <p className="error-message" style={{marginTop: '5px', fontSize: '0.8em'}}>{networkError}</p>}
        </div>
    );
}

export default ConnectWallet;