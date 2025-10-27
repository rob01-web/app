import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PaymentSuccess = ({ user, setUser }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checking, setChecking] = useState(true);
  const [paymentStatus, setPaymentStatus] = useState(null);

  useEffect(() => {
    checkPaymentStatus();
  }, []);

  const checkPaymentStatus = async () => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      navigate('/dashboard');
      return;
    }

    let attempts = 0;
    const maxAttempts = 5;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        setChecking(false);
        toast.error('Payment verification timeout. Please check your dashboard.');
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(
          `${API}/payments/status/${sessionId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.payment_status === 'paid') {
          setPaymentStatus(response.data);
          setChecking(false);
          toast.success(`${response.data.reports_credited} reports added to your account!`);
          
          // Refresh user data
          const userRes = await axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
          setUser(userRes.data);
          localStorage.setItem('user', JSON.stringify(userRes.data));
        } else if (response.data.status === 'expired') {
          setChecking(false);
          toast.error('Payment session expired');
        } else {
          attempts++;
          setTimeout(poll, 2000);
        }
      } catch (error) {
        setChecking(false);
        toast.error('Failed to verify payment');
      }
    };

    poll();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full" data-testid="payment-success-card">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-emerald-100 p-4 rounded-full">
              <CheckCircle className="h-12 w-12 text-emerald-600" />
            </div>
          </div>
          <CardTitle className="text-2xl" data-testid="payment-success-title">
            {checking ? 'Processing Payment...' : 'Payment Successful!'}
          </CardTitle>
          <CardDescription data-testid="payment-success-description">
            {checking ? 'Please wait while we confirm your payment' : 'Your reports have been added to your account'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!checking && paymentStatus && (
            <div className="bg-gray-50 p-4 rounded-lg text-center" data-testid="payment-details">
              <p className="text-sm text-gray-600 mb-2">Reports Added</p>
              <p className="text-3xl font-bold text-emerald-600" data-testid="reports-credited">{paymentStatus.reports_credited}</p>
            </div>
          )}
          <Button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            disabled={checking}
            data-testid="go-to-dashboard-btn"
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSuccess;