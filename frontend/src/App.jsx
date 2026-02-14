/**
 * SyncScript Frontend - Main Application Component
 * 
 * This React app demonstrates:
 * - Collaborative research vault management
 * - Simulated Role-Based Access Control (RBAC)
 * - Simulated real-time collaboration via polling
 * 
 * PRODUCTION NOTES:
 * - Polling would be replaced with WebSocket connections
 * - Authentication would be added (JWT tokens)
 * - State management would use Redux/Zustand for complex apps
 */

import { useState, useEffect } from 'react';
import './App.css';

const API_BASE_URL = 'http://localhost:3000';

function App() {
    // State management
    const [vaults, setVaults] = useState([]);
    const [selectedVault, setSelectedVault] = useState(null);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form states
    const [newVaultName, setNewVaultName] = useState('');
    const [newSourceTitle, setNewSourceTitle] = useState('');
    const [newSourceUrl, setNewSourceUrl] = useState('');

    /**
     * Fetch all vaults from API
     * PRODUCTION: Would include JWT token in Authorization header
     */
    const fetchVaults = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/vaults`);
            const data = await response.json();
            if (data.success) {
                setVaults(data.data);
            }
        } catch (err) {
            console.error('Error fetching vaults:', err);
            setError('Failed to load vaults. Make sure the backend is running on port 3000.');
        }
    };

    /**
     * Fetch sources for selected vault
     * PRODUCTION: Would include JWT token and verify user has access
     */
    const fetchSources = async (vaultId) => {
        try {
            const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/sources`);
            const data = await response.json();
            if (data.success) {
                setSources(data.data);
            }
        } catch (err) {
            console.error('Error fetching sources:', err);
            setError('Failed to load sources');
        }
    };

    /**
     * Create a new vault
     * PRODUCTION: Would include JWT token, validate on server
     */
    const createVault = async (e) => {
        e.preventDefault();
        if (!newVaultName.trim()) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/vaults`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: newVaultName }),
            });

            const data = await response.json();
            if (data.success) {
                setNewVaultName('');
                fetchVaults(); // Refresh vault list
            }
        } catch (err) {
            console.error('Error creating vault:', err);
            setError('Failed to create vault');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Add a source to the selected vault
     * PRODUCTION: Would verify user has CONTRIBUTOR or OWNER role
     */
    const addSource = async (e) => {
        e.preventDefault();
        if (!newSourceTitle.trim() || !newSourceUrl.trim() || !selectedVault) return;

        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/vaults/${selectedVault.id}/sources`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    title: newSourceTitle,
                    url: newSourceUrl,
                }),
            });

            const data = await response.json();
            if (data.success) {
                setNewSourceTitle('');
                setNewSourceUrl('');
                fetchSources(selectedVault.id); // Refresh sources
            }
        } catch (err) {
            console.error('Error adding source:', err);
            setError('Failed to add source');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Handle vault selection
     */
    const handleVaultSelect = (vault) => {
        setSelectedVault(vault);
        fetchSources(vault.id);
    };

    /**
     * Initial data load
     */
    useEffect(() => {
        fetchVaults();
    }, []);

    /**
     * SIMULATED REAL-TIME COLLABORATION
     * Poll for updates every 3 seconds
     * 
     * PRODUCTION: This would be replaced with WebSocket connections
     * - Client connects to WebSocket server on mount
     * - Server pushes updates when data changes
     * - Much more efficient than polling
     */
    useEffect(() => {
        const pollInterval = setInterval(() => {
            fetchVaults();
            if (selectedVault) {
                fetchSources(selectedVault.id);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(pollInterval);
    }, [selectedVault]);

    /**
     * Check if user can add sources (simulated RBAC)
     * PRODUCTION: Role would come from JWT token and VaultMembers table
     */
    const canAddSources = () => {
        if (!selectedVault) return false;
        // In this MVP, all vaults have OWNER role
        // In production: return ['OWNER', 'CONTRIBUTOR'].includes(selectedVault.role);
        return selectedVault.role === 'OWNER' || selectedVault.role === 'CONTRIBUTOR';
    };

    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <h1>🔬 SyncScript</h1>
                <p className="subtitle">Collaborative Research Platform</p>
            </header>

            {/* Error Display */}
            {error && (
                <div className="error-banner">
                    {error}
                    <button onClick={() => setError(null)}>✕</button>
                </div>
            )}

            {/* Main Content */}
            <div className="main-content">
                {/* Sidebar - Vault List */}
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <h2>Knowledge Vaults</h2>
                    </div>

                    {/* Create Vault Form */}
                    <form onSubmit={createVault} className="create-vault-form">
                        <input
                            type="text"
                            placeholder="New vault name..."
                            value={newVaultName}
                            onChange={(e) => setNewVaultName(e.target.value)}
                            disabled={loading}
                        />
                        <button type="submit" disabled={loading || !newVaultName.trim()}>
                            + Create
                        </button>
                    </form>

                    {/* Vault List */}
                    <div className="vault-list">
                        {vaults.length === 0 ? (
                            <p className="empty-state">No vaults yet. Create one to get started!</p>
                        ) : (
                            vaults.map((vault) => (
                                <div
                                    key={vault.id}
                                    className={`vault-item ${selectedVault?.id === vault.id ? 'active' : ''}`}
                                    onClick={() => handleVaultSelect(vault)}
                                >
                                    <div className="vault-name">{vault.name}</div>
                                    <div className="vault-role">{vault.role}</div>
                                </div>
                            ))
                        )}
                    </div>
                </aside>

                {/* Main Area - Sources */}
                <main className="content-area">
                    {selectedVault ? (
                        <>
                            <div className="content-header">
                                <h2>{selectedVault.name}</h2>
                                <span className="role-badge">{selectedVault.role}</span>
                            </div>

                            {/* Add Source Form - Only show if user has permission */}
                            {canAddSources() && (
                                <form onSubmit={addSource} className="add-source-form">
                                    <div className="form-row">
                                        <input
                                            type="text"
                                            placeholder="Source title..."
                                            value={newSourceTitle}
                                            onChange={(e) => setNewSourceTitle(e.target.value)}
                                            disabled={loading}
                                        />
                                        <input
                                            type="text"
                                            placeholder="https://example.com/research-paper.pdf"
                                            value={newSourceUrl}
                                            onChange={(e) => setNewSourceUrl(e.target.value)}
                                            disabled={loading}
                                        />
                                        <button
                                            type="submit"
                                            disabled={loading || !newSourceTitle.trim() || !newSourceUrl.trim()}
                                        >
                                            + Add Source
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Sources List */}
                            <div className="sources-section">
                                <h3>Research Sources ({sources.length})</h3>
                                {sources.length === 0 ? (
                                    <p className="empty-state">
                                        No sources yet. {canAddSources() ? 'Add your first research source above!' : ''}
                                    </p>
                                ) : (
                                    <div className="sources-grid">
                                        {sources.map((source) => (
                                            <div key={source.id} className="source-card">
                                                <h4>{source.title}</h4>
                                                <a href={source.url} target="_blank" rel="noopener noreferrer">
                                                    {source.url}
                                                </a>
                                                <div className="source-meta">
                                                    Added {new Date(source.addedAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="empty-state-main">
                            <h2>Welcome to SyncScript</h2>
                            <p>Select a vault from the sidebar or create a new one to get started.</p>
                            <div className="feature-list">
                                <div className="feature">
                                    <span className="feature-icon">🗂️</span>
                                    <span>Organize research in Knowledge Vaults</span>
                                </div>
                                <div className="feature">
                                    <span className="feature-icon">👥</span>
                                    <span>Collaborate with role-based access</span>
                                </div>
                                <div className="feature">
                                    <span className="feature-icon">🔄</span>
                                    <span>Real-time synchronization</span>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {/* Footer Note */}
            <footer className="footer">
                <p>
                    💡 <strong>Demo Mode:</strong> Using in-memory storage and polling.
                    Production would use PostgreSQL + WebSockets.
                </p>
            </footer>
        </div>
    );
}

export default App;
