// client/src/components/LandingPage.js
import React from 'react';
import ConnectWallet from './ConnectWallet';
import { useWeb3 } from '../contexts/Web3Context';

function LandingPage() {
    const { account, networkError } = useWeb3(); // Check networkError as well

    return (
        <div className="container landing-page">
            <h2>Welcome to CarePulse</h2>
            <p>Track and trace pharmaceutical products securely and transparently on the blockchain.</p>

            {networkError && <p className="error-message">{networkError}</p>}

            {!account && !networkError && (
                 <div style={{marginTop: '30px'}}>
                    <p>Please connect your wallet to interact with the system.</p>
                    <ConnectWallet />
                 </div>
            )}
             {account && (
                 <p className="info-message">Wallet connected. Please select your role from the header menu.</p>
             )}
        </div>
    );
}

export default LandingPage;