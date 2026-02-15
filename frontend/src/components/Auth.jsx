/**
 * Authentication Component
 * Handles user registration and login
 */

import { useState } from 'react';
import './Auth.css';

const API_BASE_URL = 'http://localhost:3000';

function Auth({ onAuthSuccess }) {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        name: ''
    });
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const endpoint = isLogin ? '/auth/login' : '/auth/register';
        const body = isLogin
            ? { email: formData.email, password: formData.password }
            : formData;

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (data.success) {
                // Store token and user info
                localStorage.setItem('token', data.data.token);
                localStorage.setItem('user', JSON.stringify(data.data.user));
                onAuthSuccess(data.data.user, data.data.token);
            } else {
                setError(data.error || 'Authentication failed');
            }
        } catch (err) {
            console.error('Auth error:', err);
            setError('Failed to connect to server. Make sure backend is running on port 3000.');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h1>🔬 SyncScript</h1>
                <p className="auth-subtitle">Collaborative Research Platform v2.0</p>

                <div className="auth-tabs">
                    <button
                        className={isLogin ? 'active' : ''}
                        onClick={() => setIsLogin(true)}
                    >
                        Login
                    </button>
                    <button
                        className={!isLogin ? 'active' : ''}
                        onClick={() => setIsLogin(false)}
                    >
                        Register
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                    {!isLogin && (
                        <input
                            type="text"
                            name="name"
                            placeholder="Full Name"
                            value={formData.name}
                            onChange={handleChange}
                            required={!isLogin}
                            disabled={loading}
                        />
                    )}

                    <input
                        type="email"
                        name="email"
                        placeholder="Email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                        disabled={loading}
                    />

                    <input
                        type="password"
                        name="password"
                        placeholder="Password (min 6 characters)"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        minLength="6"
                        disabled={loading}
                    />

                    {error && <div className="auth-error">{error}</div>}

                    <button type="submit" disabled={loading}>
                        {loading ? 'Please wait...' : (isLogin ? 'Login' : 'Create Account')}
                    </button>
                </form>

                <div className="auth-features">
                    <h3>✨ New in v2.0:</h3>
                    <ul>
                        <li>🔐 Secure authentication with JWT</li>
                        <li>👥 Real role-based access control</li>
                        <li>⚡ Real-time collaboration via WebSockets</li>
                        <li>📊 Audit logging for accountability</li>
                        <li>💾 MySQL database persistence</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default Auth;
