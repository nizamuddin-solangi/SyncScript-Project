/**
 * SyncScript Frontend v2.0 - Main Application Component
 * 
 * UPGRADED FROM MVP:
 * - JWT authentication (login/register)
 * - Real-time WebSocket updates (Socket.IO)
 * - Real RBAC from database
 * - Audit log viewing (OWNER only)
 * - Polling kept as fallback
 */

import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Auth from './components/Auth';
import './App.css';

const API_BASE_URL = 'http://localhost:3000';

function App() {
    // Authentication state
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    // App state
    const [vaults, setVaults] = useState([]);
    const [selectedVault, setSelectedVault] = useState(null);
    const [sources, setSources] = useState([]);
    const [auditLogs, setAuditLogs] = useState([]);
    const [showAudit, setShowAudit] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form states
    const [newVaultName, setNewVaultName] = useState('');
    const [newSourceTitle, setNewSourceTitle] = useState('');
    const [newSourceUrl, setNewSourceUrl] = useState('');

    // Multi-type source states (v2.1)
    const [sourceType, setSourceType] = useState('url'); // url, file, note, media, image
    const [sourceFile, setSourceFile] = useState(null);
    const [noteContent, setNoteContent] = useState('');

    // Case Study: Collaboration & Notifications states
    const [notifications, setNotifications] = useState([]);
    const [showMembers, setShowMembers] = useState(false);
    const [memberEmail, setMemberEmail] = useState('');
    const [memberRole, setMemberRole] = useState('VIEWER');

    // WebSocket state
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    // Ref to track current selected vault (for WebSocket callbacks)
    const selectedVaultRef = useRef(null);

    // Update ref when selectedVault changes
    useEffect(() => {
        selectedVaultRef.current = selectedVault;
    }, [selectedVault]);

    /**
     * Check for existing auth on mount
     */
    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
            setIsAuthenticated(true);
        }
    }, []);

    /**
     * Setup WebSocket connection when authenticated
     */
    useEffect(() => {
        if (!isAuthenticated || !user) return;

        const newSocket = io(API_BASE_URL);

        newSocket.on('connect', () => {
            console.log('✅ WebSocket connected');
            setIsConnected(true);
            newSocket.emit('join:user', user.id);
        });

        newSocket.on('disconnect', () => {
            console.log('❌ WebSocket disconnected');
            setIsConnected(false);
        });

        // Listen for vault created event
        newSocket.on('vault:created', (vault) => {
            console.log('📦 Vault created:', vault);
            setVaults(prev => [...prev, vault]);
        });

        // Listen for source added event
        newSocket.on('source:added', (source) => {
            console.log('📄 Source added:', source);
            // Use ref to get current selectedVault value
            const currentVault = selectedVaultRef.current;
            if (currentVault && source.vaultId === currentVault.id) {
                setSources(prev => {
                    // Prevent duplicates
                    const exists = prev.some(s => s.id === source.id);
                    if (!exists) {
                        return [...prev, source];
                    }
                    return prev;
                });
            }
        });

        // MISSION: Automated Notifications
        newSocket.on('notification', (notif) => {
            console.log('🔔 Notification received:', notif);
            setNotifications(prev => [notif, ...prev]);

            // Auto-hide notification after 5 seconds
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n !== notif));
            }, 5000);

            // Fetch vaults if we were added to one
            if (notif.type === 'COLLABORATION') {
                fetchVaults();
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [isAuthenticated, user]);

    /**
     * Join vault room when vault is selected
     */
    useEffect(() => {
        if (socket && selectedVault) {
            socket.emit('join:vault', selectedVault.id);
            return () => {
                socket.emit('leave:vault', selectedVault.id);
            };
        }
    }, [socket, selectedVault]);

    /**
     * Polling fallback (every 30 seconds if WebSocket disconnected)
     */
    useEffect(() => {
        if (!isAuthenticated || isConnected) return;

        const pollInterval = setInterval(() => {
            console.log('🔄 Polling (WebSocket disconnected)');
            fetchVaults();
            if (selectedVault) {
                fetchSources(selectedVault.id);
            }
        }, 30000);

        return () => clearInterval(pollInterval);
    }, [isAuthenticated, isConnected, selectedVault]);

    /**
     * Fetch vaults on auth
     */
    useEffect(() => {
        if (isAuthenticated) {
            fetchVaults();
        }
    }, [isAuthenticated]);

    /**
     * API Helper with JWT
     */
    const apiCall = async (endpoint, options = {}) => {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        };

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401) {
            handleLogout();
            throw new Error('Session expired. Please login again.');
        }

        const data = await response.json();

        if (data.success === false) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    };

    /**
     * Authentication handlers
     */
    const handleAuthSuccess = (userData, authToken) => {
        setUser(userData);
        setToken(authToken);
        setIsAuthenticated(true);
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setToken(null);
        setIsAuthenticated(false);
        setVaults([]);
        setSelectedVault(null);
        setSources([]);
        if (socket) {
            socket.disconnect();
        }
    };

    /**
     * Fetch all vaults
     */
    const fetchVaults = async () => {
        try {
            const data = await apiCall('/vaults');
            if (data.success) {
                setVaults(data.data);
            }
        } catch (err) {
            console.error('Error fetching vaults:', err);
            setError(err.message || 'Failed to load vaults');
        }
    };

    /**
     * Fetch sources for selected vault
     */
    const fetchSources = async (vaultId) => {
        try {
            const data = await apiCall(`/vaults/${vaultId}/sources`);
            if (data.success) {
                setSources(data.data);
            }
        } catch (err) {
            console.error('Error fetching sources:', err);
            setError('Failed to load sources');
        }
    };

    /**
     * Fetch audit logs (OWNER only)
     */
    const fetchAuditLogs = async (vaultId) => {
        try {
            const data = await apiCall(`/vaults/${vaultId}/audit`);
            if (data.success) {
                setAuditLogs(data.data);
            }
        } catch (err) {
            console.error('Error fetching audit logs:', err);
            setError('Failed to load audit logs');
        }
    };

    /**
     * Create a new vault
     */
    const createVault = async (e) => {
        e.preventDefault();
        if (!newVaultName.trim()) return;

        setLoading(true);
        try {
            const data = await apiCall('/vaults', {
                method: 'POST',
                body: JSON.stringify({ name: newVaultName })
            });

            if (data.success) {
                setNewVaultName('');
                // WebSocket will handle adding to list
                if (!isConnected) {
                    fetchVaults(); // Fallback if WebSocket disconnected
                }
            }
        } catch (err) {
            console.error('Error creating vault:', err);
            setError(err.message || 'Failed to create vault');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Add a source to the selected vault
     */
    /**
     * Add a source to the selected vault
     * UPGRADED: Supports multiple types and file uploads
     */
    const addSource = async (e) => {
        e.preventDefault();

        // Basic validation
        if (!selectedVault) {
            setError('Please select a vault first.');
            return;
        }
        if (!newSourceTitle.trim()) {
            setError('Please provide a title for the source.');
            return;
        }

        // Type-specific validation
        if ((sourceType === 'url' || sourceType === 'media') && !newSourceUrl.trim()) {
            setError('Please provide a URL.');
            return;
        }
        if ((sourceType === 'file' || sourceType === 'image') && !sourceFile) {
            setError('Please select a file.');
            return;
        }
        if (sourceType === 'note' && !noteContent.trim()) {
            setError('Please write something in the note.');
            return;
        }

        setLoading(true);

        try {
            // Use FormData for file uploads
            const formData = new FormData();
            formData.append('title', newSourceTitle);
            formData.append('type', sourceType);

            if (sourceType === 'url' || sourceType === 'media') {
                formData.append('content', newSourceUrl);
            } else if (sourceType === 'file' || sourceType === 'image') {
                formData.append('file', sourceFile);
            } else if (sourceType === 'note') {
                formData.append('content', noteContent);
            }

            // Custom API call since we can't use JSON for FormData
            const response = await fetch(`${API_BASE_URL}/vaults/${selectedVault.id}/sources`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                    // Content-Type left blank for browser to set boundary
                },
                body: formData
            });

            if (response.status === 401) {
                handleLogout();
                throw new Error('Session expired. Please login again.');
            }

            const data = await response.json();

            if (data.success) {
                // Reset form
                setNewSourceTitle('');
                setNewSourceUrl('');
                setSourceFile(null);
                setNoteContent('');
                setSourceType('url'); // Reset type to default

                // WebSocket will handle adding to list
                if (!isConnected) {
                    fetchSources(selectedVault.id); // Fallback
                }
            } else {
                throw new Error(data.error || 'Failed to add source');
            }
        } catch (err) {
            console.error('Error adding source:', err);
            setError(err.message || 'Failed to add source');
        } finally {
            setLoading(false);
        }
    };

    /**
     * Format file size helper
     */
    const formatFileSize = (bytes) => {
        if (!bytes) return '';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    /**
     * Get badge for source type
     */
    const getTypeBadge = (type) => {
        switch (type) {
            case 'url': return '🔗 URL';
            case 'file': return '📄 File';
            case 'note': return '📝 Note';
            case 'media': return '🎥 Media';
            case 'image': return '🖼️ Image';
            default: return '🔗 URL';
        }
    };

    /**
     * Handle vault selection
     */
    const handleVaultSelect = (vault) => {
        setSelectedVault(vault);
        setShowAudit(false);
        setShowMembers(false);
        fetchSources(vault.id);
    };

    /**
     * Show audit log
     */
    const handleShowAudit = () => {
        if (selectedVault && selectedVault.role === 'OWNER') {
            setShowAudit(true);
            setShowMembers(false);
            fetchAuditLogs(selectedVault.id);
        }
    };

    /**
     * Handle Authenticated Download
     */
    const handleDownload = async (e, source) => {
        e.preventDefault();
        try {
            const response = await fetch(`${API_BASE_URL}/sources/${source.id}/download`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.status === 401) {
                handleLogout();
                throw new Error('Session expired');
            }

            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = source.title;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download error:', err);
            setError('Failed to download file: ' + err.message);
        }
    };

    /**
     * MISSION: Member Management
     */
    const addMember = async (e) => {
        e.preventDefault();
        if (!selectedVault || !memberEmail.trim()) return;

        setLoading(true);
        try {
            const data = await apiCall(`/vaults/${selectedVault.id}/members`, {
                method: 'POST',
                body: JSON.stringify({ email: memberEmail, role: memberRole })
            });

            if (data.success) {
                setMemberEmail('');
                setError(null);
                alert(`Success: ${data.message}`);
            } else {
                throw new Error(data.error || 'Failed to add member');
            }
        } catch (err) {
            console.error('Add member error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    /**
     * MISSION: Auto-Citation Generator
     */
    const generateCitation = (source) => {
        const author = source.addedBy || "Unknown Author";
        const date = new Date(source.addedAt).getFullYear();
        const title = source.title;
        const url = source.content || source.url;
        const citation = `${author}. (${date}). ${title}.${url ? ` Retrieved from ${url}` : ''}`;

        navigator.clipboard.writeText(citation);
        alert(`Citation Copied (APA 7th Gen):\n${citation}`);
    };

    const canAddSources = () => {
        if (!selectedVault) return false;
        return selectedVault.role === 'OWNER' || selectedVault.role === 'CONTRIBUTOR';
    };

    if (!isAuthenticated) {
        return <Auth onAuthSuccess={handleAuthSuccess} />;
    }

    return (
        <div className="app">
            <header className="header">
                <div>
                    <h1>🔬 SyncScript v2.0</h1>
                    <p className="subtitle">Collaborative Research Platform</p>
                </div>
                <div className="header-actions">
                    <span className="user-badge">👤 {user?.name}</span>
                    <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
                        {isConnected ? '🟢 Live' : '🔴 Offline'}
                    </span>
                    <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
            </header>

            {error && (
                <div className="error-banner">
                    {error}
                    <button onClick={() => setError(null)}>✕</button>
                </div>
            )}

            <div className="notifications-container">
                {notifications.map((n, i) => (
                    <div key={i} className="notification-toast">
                        <span className="notif-icon">🔔</span>
                        <p>{n.message}</p>
                    </div>
                ))}
            </div>

            <div className="main-content">
                <aside className="sidebar">
                    <div className="sidebar-header">
                        <h2>Knowledge Vaults</h2>
                    </div>

                    <form onSubmit={createVault} className="create-vault-form">
                        <input
                            type="text"
                            placeholder="New vault name..."
                            value={newVaultName}
                            onChange={(e) => setNewVaultName(e.target.value)}
                            disabled={loading}
                        />
                        <button type="submit" disabled={loading || !newVaultName.trim()}>+ Create</button>
                    </form>

                    <div className="vault-list">
                        {vaults.length === 0 ? (
                            <p className="empty-state">No vaults yet.</p>
                        ) : (
                            vaults.map((v) => (
                                <div
                                    key={v.id}
                                    className={`vault-item ${selectedVault?.id === v.id ? 'active' : ''}`}
                                    onClick={() => handleVaultSelect(v)}
                                >
                                    <div className="vault-name">{v.name}</div>
                                    <div className="vault-role">{v.role}</div>
                                </div>
                            ))
                        )}
                    </div>
                </aside>

                <main className="content-area">
                    {selectedVault ? (
                        <>
                            <div className="content-header">
                                <div>
                                    <h2>{selectedVault.name}</h2>
                                    <span className="role-badge">{selectedVault.role}</span>
                                </div>
                                <div className="content-tabs">
                                    <button className={!showAudit && !showMembers ? 'active' : ''} onClick={() => { setShowAudit(false); setShowMembers(false); }}>Sources</button>
                                    {selectedVault.role === 'OWNER' && (
                                        <>
                                            <button className={showMembers ? 'active' : ''} onClick={() => { setShowAudit(false); setShowMembers(true); }}>Participants</button>
                                            <button className={showAudit ? 'active' : ''} onClick={handleShowAudit}>Audit Log</button>
                                        </>
                                    )}
                                </div>
                            </div>

                            {showMembers ? (
                                <div className="members-section" style={{ padding: '2rem' }}>
                                    <h3>Vault Participants</h3>
                                    <form onSubmit={addMember} className="add-member-form" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                                        <input
                                            type="email"
                                            placeholder="researcher@email.com"
                                            value={memberEmail}
                                            onChange={(e) => setMemberEmail(e.target.value)}
                                            required
                                            style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: 'white' }}
                                        />
                                        <select
                                            value={memberRole}
                                            onChange={(e) => setMemberRole(e.target.value)}
                                            style={{ padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-dark)', color: 'white' }}
                                        >
                                            <option value="VIEWER">Viewer</option>
                                            <option value="CONTRIBUTOR">Contributor</option>
                                        </select>
                                        <button type="submit" disabled={loading} className="add-btn">+ Add</button>
                                    </form>
                                    <p className="subtitle">Invite collaborators to this research vault.</p>
                                </div>
                            ) : showAudit ? (
                                <div className="audit-section">
                                    <h3>Audit Log</h3>
                                    {auditLogs.length === 0 ? (
                                        <p className="empty-state">No activities recorded yet.</p>
                                    ) : (
                                        <div className="audit-list">
                                            {auditLogs.map((log) => (
                                                <div key={log.id} className="audit-item">
                                                    <div className="audit-action">{log.action}</div>
                                                    <div className="audit-details">{log.user} • {new Date(log.createdAt).toLocaleString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {canAddSources() && (
                                        <form onSubmit={addSource} className="add-source-form">
                                            <div className="source-type-selector">
                                                <button type="button" onClick={() => setSourceType('url')} className={sourceType === 'url' ? 'active' : ''}>🔗 URL</button>
                                                <button type="button" onClick={() => setSourceType('file')} className={sourceType === 'file' ? 'active' : ''}>📄 File</button>
                                                <button type="button" onClick={() => setSourceType('note')} className={sourceType === 'note' ? 'active' : ''}>📝 Note</button>
                                            </div>
                                            <div className="form-column">
                                                <input
                                                    type="text"
                                                    placeholder="Source title..."
                                                    value={newSourceTitle}
                                                    onChange={(e) => setNewSourceTitle(e.target.value)}
                                                    required
                                                />
                                                {(sourceType === 'url') && (
                                                    <input type="url" placeholder="https://..." value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} required />
                                                )}
                                                {(sourceType === 'file') && (
                                                    <div className="file-input-wrapper">
                                                        <input
                                                            type="file"
                                                            onChange={(e) => setSourceFile(e.target.files[0])}
                                                            required
                                                            id="source-file-input"
                                                        />
                                                        {sourceFile && (
                                                            <div className="file-selected">
                                                                ✅ {sourceFile.name} ({formatFileSize(sourceFile.size)})
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {sourceType === 'note' && (
                                                    <textarea placeholder="Write your note..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} required />
                                                )}
                                                <button type="submit" disabled={loading} className="add-btn">
                                                    {loading ? '⏳ Adding...' : '+ Add Source'}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    <div className="sources-section">
                                        <h3>Sources ({sources.length})</h3>
                                        <div className="sources-grid">
                                            {sources.map((s) => (
                                                <div key={s.id} className="source-card">
                                                    <div className="source-header">
                                                        <h4>{s.title}</h4>
                                                        <button className="cite-btn" onClick={() => generateCitation(s)}>📜 Cite</button>
                                                    </div>
                                                    <div className="source-content">
                                                        {s.type === 'note' ? <p>{s.content}</p> : <a href={s.content || s.url} target="_blank" rel="noreferrer">{s.content || s.url}</a>}
                                                        {s.type === 'file' && <button onClick={(e) => handleDownload(e, s)} className="download-btn">📥 Download</button>}
                                                    </div>
                                                    <div className="source-meta">By {s.addedBy} • {new Date(s.addedAt).toLocaleDateString()}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="empty-state-main">
                            <h2>Welcome, {user?.name}!</h2>
                            <p>Select or create a vault to begin your research.</p>
                        </div>
                    )}
                </main>
            </div>
            <footer className="footer">
                <p>SyncScript v2.0 • Advanced Research Collaboration</p>
            </footer>
        </div>
    );
}

export default App;
