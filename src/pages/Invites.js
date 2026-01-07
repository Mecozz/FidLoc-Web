import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { MapPin, Check, X, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Invites.css';

export default function Invites() {
  const { user, logout } = useAuth();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadInvites();
  }, [user]);

  const loadInvites = async () => {
    if (!user?.email) return;

    try {
      const q = query(
        collection(db, 'invites'),
        where('email', '==', user.email.toLowerCase()),
        where('status', '==', 'pending')
      );
      
      const snapshot = await getDocs(q);
      const inviteList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setInvites(inviteList);
    } catch (err) {
      console.error('Error loading invites:', err);
    }
    setLoading(false);
  };

  const acceptInvite = async (invite) => {
    setProcessing(invite.id);
    
    try {
      // Add user to organization members
      await setDoc(doc(db, 'organizations', invite.organizationId, 'members', user.uid), {
        id: user.uid,
        orgId: invite.organizationId,
        userId: user.uid,
        email: user.email,
        role: invite.role,
        joinedAt: new Date()
      });

      // Update user document with organization
      await setDoc(doc(db, 'users', user.uid), {
        organizationId: invite.organizationId,
        email: user.email
      }, { merge: true });

      // Update invite status
      await updateDoc(doc(db, 'invites', invite.id), {
        status: 'accepted'
      });

      // Redirect to dashboard
      window.location.href = '/';
    } catch (err) {
      console.error('Error accepting invite:', err);
      alert('Failed to accept invite. Please try again.');
    }
    
    setProcessing(null);
  };

  const declineInvite = async (invite) => {
    setProcessing(invite.id);
    
    try {
      await updateDoc(doc(db, 'invites', invite.id), {
        status: 'declined'
      });
      
      setInvites(invites.filter(i => i.id !== invite.id));
    } catch (err) {
      console.error('Error declining invite:', err);
    }
    
    setProcessing(null);
  };

  return (
    <div className="invites-container">
      <div className="invites-box">
        <div className="invites-header">
          <div className="invites-icon">
            <MapPin size={32} color="white" />
          </div>
          <h1>FidLoc</h1>
          <p>Pending Invites</p>
        </div>

        <div className="invites-content">
          {loading ? (
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading invites...</p>
            </div>
          ) : invites.length === 0 ? (
            <div className="no-invites">
              <p>No pending invites</p>
              <p className="hint">Ask your team admin to send you an invite to their organization.</p>
            </div>
          ) : (
            <div className="invite-list">
              {invites.map(invite => (
                <div key={invite.id} className="invite-card">
                  <div className="invite-info">
                    <h3>{invite.organizationName}</h3>
                    <p>Role: <span className="role">{invite.role}</span></p>
                  </div>
                  <div className="invite-actions">
                    <button 
                      onClick={() => acceptInvite(invite)} 
                      className="accept-btn"
                      disabled={processing === invite.id}
                    >
                      <Check size={18} />
                      {processing === invite.id ? 'Joining...' : 'Accept'}
                    </button>
                    <button 
                      onClick={() => declineInvite(invite)} 
                      className="decline-btn"
                      disabled={processing === invite.id}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button onClick={logout} className="signout-btn">
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
