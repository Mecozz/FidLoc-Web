import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { auth } from '../firebase';
import { OAuthProvider, signInWithPopup, sendPasswordResetEmail } from 'firebase/auth';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const { login } = useAuth();

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email address first, then click Forgot Password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with that email');
      } else {
        setError('Failed to send reset email. Try again.');
      }
      console.error(err);
    }
    setLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError('Failed to sign in. Check your email and password.');
      console.error(err);
    }

    setLoading(false);
  };

  const handleAppleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const provider = new OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed the popup, not an error
      } else {
        setError('Failed to sign in with Apple.');
        console.error(err);
      }
    }

    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <div className="login-icon">
            <MapPin size={32} color="white" />
          </div>
          <h1>FidLoc</h1>
          <p>Fiber Location Tracker</p>
        </div>

        <div className="login-form">
          <h2>Sign In</h2>
          
          {error && <div className="error-message">{error}</div>}

          {/* Apple Sign In Button */}
          <button 
            onClick={handleAppleSignIn} 
            disabled={loading}
            className="apple-button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Sign in with Apple
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button type="button" onClick={handleForgotPassword} className="forgot-link" disabled={loading}>
                Forgot Password?
              </button>
            </div>

            {resetSent && (
              <div className="success-message">
                ✅ Password reset email sent! Check your inbox.
              </div>
            )}

            <button type="submit" disabled={loading} className="login-button">
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="login-hint">
            Don't have an account? <Link to="/register" className="link">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
