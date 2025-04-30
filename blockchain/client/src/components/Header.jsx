// client/src/components/Header.js
import React, { useState } from 'react';
import { useWeb3 } from '../contexts/Web3Context';
import { ROLES, ROLE_NAMES_MAP, AVAILABLE_LOGIN_ROLES, getRoleName } from '../constants/roles';
import ConnectWallet from './ConnectWallet';

function Header() {
    const { account, selectedRole, setSelectedRole, hasRole, disconnectWallet } = useWeb3();
    const [showRoles, setShowRoles] = useState(false);

    const handleRoleSelect = (roleHash) => {
        setSelectedRole(roleHash);
        setShowRoles(false); // Close dropdown after selection
    };

    const handleClearSelection = () => {
        setSelectedRole(null);
        setShowRoles(false);
    }

    const toggleRoles = () => setShowRoles(!showRoles);

    return (
        <header className="app-header">
            <h1>CarePulse</h1>
            <div className="header-controls">
                {account ? (
                    <div className="account-info">
                        <span>Connected: {account.substring(0, 6)}...{account.substring(account.length - 4)}</span>
                        <div className="role-selector">
                            <button onClick={toggleRoles} className="role-button">
                                Role: {selectedRole ? getRoleName(selectedRole) : "Select"} {showRoles ? '▲' : '▼'}
                            </button>
                            {showRoles && (
                                <ul className="role-dropdown">
                                    {AVAILABLE_LOGIN_ROLES.map(roleHash => (
                                        <li key={roleHash}>
                                            <button
                                                onClick={() => handleRoleSelect(roleHash)}
                                                disabled={!hasRole(roleHash)} // Disable if user doesn't have the role
                                                title={!hasRole(roleHash) ? "Your account does not have this role" : `Select ${getRoleName(roleHash)} role`}
                                            >
                                                {getRoleName(roleHash)} {!hasRole(roleHash) ? ' (No Access)' : ''}
                                            </button>
                                        </li>
                                    ))}
                                     <li><hr/></li>
                                     <li>
                                         <button onClick={handleClearSelection} title="Clear current role selection">Clear Selection</button>
                                     </li>
                                     <li>
                                         <button onClick={disconnectWallet} title="Disconnect wallet (clear app state)" className="secondary">Disconnect</button>
                                     </li>
                                </ul>
                            )}
                        </div>
                    </div>
                ) : (
                    <ConnectWallet />
                )}
            </div>
        </header>
    );
}

export default Header;