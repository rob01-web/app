import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, BarChart3, FileText, TrendingUp, Shield, Zap, ArrowRight, Download, Eye } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LandingPage = ({ user, onLogin, onLogout }) => {
  const navigate = useNavigate();
  const [showAuth, setShowAuth] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async (e, isLogin) => {
    e.preventDefault();
    setAuthLoading(true);

    const formData = new FormData(e.target);
    const data = {
      email: formData.get('email'),
      password: formData.get('password'),
      ...(isLogin ? {} : { name: formData.get('name') })
    };

    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const response = await axios.post(`${API}${endpoint}`, data);
      onLogin(response.data.user, response.data.token);
      toast.success(isLogin ? 'Welcome back!' : 'Account created successfully!');
      setShowAuth(false);
      if (!isLogin) {
        navigate('/dashboard');
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const pricingTiers = [
    { id: 'single', name: 'Single Report', price: 499, reports: 1, popular: false },
    { id: 'bundle_5', name: '5 Report Bundle', price: 2250, reports: 5, popular: true, savings: '10%' },
    { id: 'bundle_10', name: '10 Report Bundle', price: 3990, reports: 10, popular: false, savings: '20%' },
  ];

  const handlePurchase = async (packageId) => {
    if (!user) {
      setShowAuth(true);
      toast.info('Please login to purchase');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const originUrl = window.location.origin;
      
      const response = await axios.post(
        `${API}/payments/checkout`,
        { package_id: packageId, origin_url: originUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      window.location.href = response.data.url;
    } catch (error) {
      toast.error('Failed to initiate payment');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-emerald-600" />
              <span className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>InvestorIQ</span>
            </div>
            <div className="flex items-center space-x-4">
              <a href="#features" className="text-gray-700 hover:text-emerald-600 font-medium">Features</a>
              <a href="#pricing" className="text-gray-700 hover:text-emerald-600 font-medium">Pricing</a>
              <a href="#sample" className="text-gray-700 hover:text-emerald-600 font-medium">Sample</a>
              {user ? (
                <>
                  <Button onClick={() => navigate('/dashboard')} variant="outline" data-testid="dashboard-btn">Dashboard</Button>
                  <Button onClick={onLogout} variant="ghost" data-testid="logout-btn">Logout</Button>
                </>
              ) : (
                <Button onClick={() => setShowAuth(true)} data-testid="get-started-btn" className="bg-emerald-600 hover:bg-emerald-700">Get Started</Button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4" style={{ background: 'linear-gradient(135deg, #F0FDF4 0%, #ECFDF5 50%, #D1FAE5 100%)' }}>
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl lg:text-6xl font-bold mb-6" style={{ fontFamily: 'Space Grotesk', color: '#0A1628' }} data-testid="hero-heading">
            Elite Real Estate Analysis
            <br />
            <span className="gradient-text">At Startup Pricing</span>
          </h1>
          <p className="text-lg text-gray-700 mb-8 max-w-3xl mx-auto">
            Get $5,000-quality property investment reports for just $499. Powered by advanced AI analysis trusted by hedge funds and real estate professionals.
          </p>
          <div className="flex justify-center space-x-4">
            <Button onClick={() => setShowAuth(true)} size="lg" className="bg-emerald-600 hover:bg-emerald-700" data-testid="hero-cta-btn">
              Start Analyzing <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button onClick={() => document.getElementById('sample').scrollIntoView({ behavior: 'smooth' })} size="lg" variant="outline" data-testid="view-sample-btn">
              View Sample Report
            </Button>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-8 max-w-3xl mx-auto">
            <div>
              <div className="text-4xl font-bold gradient-text" data-testid="stat-properties">2,500+</div>
              <div className="text-gray-600">Properties Analyzed</div>
            </div>
            <div>
              <div className="text-4xl font-bold gradient-text" data-testid="stat-accuracy">98%</div>
              <div className="text-gray-600">Accuracy Rate</div>
            </div>
            <div>
              <div className="text-4xl font-bold gradient-text" data-testid="stat-savings">$500M+</div>
              <div className="text-gray-600">Portfolio Value</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4" style={{ fontFamily: 'Space Grotesk' }} data-testid="features-heading">360° Property Intelligence</h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">Comprehensive analysis that covers every aspect of your investment decision</p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="card-hover border-2" data-testid="feature-financial">
              <CardHeader>
                <BarChart3 className="h-12 w-12 text-emerald-600 mb-4" />
                <CardTitle>Financial Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Deep dive into cap rates, cash flow projections, ROI calculations, and break-even analysis.</p>
              </CardContent>
            </Card>

            <Card className="card-hover border-2" data-testid="feature-market">
              <CardHeader>
                <TrendingUp className="h-12 w-12 text-emerald-600 mb-4" />
                <CardTitle>Market Intelligence</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Local market trends, demand drivers, supply factors, and competitive landscape analysis.</p>
              </CardContent>
            </Card>

            <Card className="card-hover border-2" data-testid="feature-strategy">
              <CardHeader>
                <Zap className="h-12 w-12 text-emerald-600 mb-4" />
                <CardTitle>Investment Strategy</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Tailored recommendations: Buy & Hold, BRRRR, Fix & Flip, with specific offer prices.</p>
              </CardContent>
            </Card>

            <Card className="card-hover border-2" data-testid="feature-risk">
              <CardHeader>
                <Shield className="h-12 w-12 text-emerald-600 mb-4" />
                <CardTitle>Risk Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Comprehensive risk analysis with mitigation strategies to protect your investment.</p>
              </CardContent>
            </Card>

            <Card className="card-hover border-2" data-testid="feature-charts">
              <CardHeader>
                <FileText className="h-12 w-12 text-emerald-600 mb-4" />
                <CardTitle>Visual Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Professional PDFs with charts, graphs, and heatmaps for easy decision-making.</p>
              </CardContent>
            </Card>

            <Card className="card-hover border-2" data-testid="feature-ai">
              <CardHeader>
                <CheckCircle className="h-12 w-12 text-emerald-600 mb-4" />
                <CardTitle>AI-Powered</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">Leveraging GPT-5 for institutional-grade analysis in minutes, not days.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4" style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #F0FDF4 100%)' }}>
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4" style={{ fontFamily: 'Space Grotesk' }} data-testid="pricing-heading">Simple, Transparent Pricing</h2>
          <p className="text-center text-gray-600 mb-12">Choose the package that fits your investment strategy</p>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingTiers.map((tier) => (
              <Card key={tier.id} className={`card-hover relative ${tier.popular ? 'border-4 border-emerald-500 shadow-xl' : 'border-2'}`} data-testid={`pricing-tier-${tier.id}`}>
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-emerald-600 text-white px-4 py-1 rounded-full text-sm font-semibold">MOST POPULAR</span>
                  </div>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-2xl" data-testid={`tier-name-${tier.id}`}>{tier.name}</CardTitle>
                  {tier.savings && (
                    <div className="text-emerald-600 font-semibold" data-testid={`tier-savings-${tier.id}`}>Save {tier.savings}</div>
                  )}
                </CardHeader>
                <CardContent className="text-center">
                  <div className="mb-6">
                    <span className="text-5xl font-bold" data-testid={`tier-price-${tier.id}`}>${tier.price.toLocaleString()}</span>
                    <div className="text-gray-600 mt-2" data-testid={`tier-reports-${tier.id}`}>{tier.reports} {tier.reports === 1 ? 'Report' : 'Reports'}</div>
                    <div className="text-sm text-gray-500 mt-1">${Math.round(tier.price / tier.reports)}/report</div>
                  </div>
                  <ul className="space-y-3 mb-6 text-left">
                    <li className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">Elite 360° Property Analysis</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">Investment Strategy Recommendations</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">Professional PDF with Charts</span>
                    </li>
                    <li className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">Market & Risk Analysis</span>
                    </li>
                  </ul>
                  <Button 
                    onClick={() => handlePurchase(tier.id)} 
                    className={`w-full ${tier.popular ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-gray-800 hover:bg-gray-900'}`}
                    data-testid={`purchase-btn-${tier.id}`}
                  >
                    Get Started
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="mt-12 max-w-2xl mx-auto border-2" data-testid="enterprise-card">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Enterprise</CardTitle>
              <CardDescription>For institutional investors and large portfolios</CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-gray-600 mb-4">Custom pricing, dedicated support, API access, and white-label options</p>
              <Button variant="outline" size="lg" data-testid="contact-sales-btn">Contact Sales</Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Sample Report Section */}
      <section id="sample" className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk' }} data-testid="sample-heading">See It In Action</h2>
          <p className="text-gray-600 mb-8">Download our sample report to see the depth and quality of our analysis</p>
          
          <Card className="border-2" data-testid="sample-report-card">
            <CardHeader>
              <CardTitle>Sample Investment Analysis Report</CardTitle>
              <CardDescription>123 Main Street - Multifamily Property</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-6 rounded-lg">
                <p className="text-sm text-gray-600 mb-4">This sample showcases our comprehensive analysis including:</p>
                <ul className="text-left text-sm space-y-2 max-w-md mx-auto">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Executive summary and property overview</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Detailed financial projections and ROI analysis</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Market analysis and competitive landscape</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-emerald-600 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Investment strategy recommendations</span>
                  </li>
                </ul>
              </div>
              <div className="flex justify-center space-x-4">
                <Button 
                  onClick={async () => {
                    try {
                      const response = await axios.get(`${API}/sample-report/download`, { responseType: 'blob' });
                      const url = window.URL.createObjectURL(new Blob([response.data]));
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', 'InvestorIQ_Sample_Report_Toronto.pdf');
                      document.body.appendChild(link);
                      link.click();
                      link.remove();
                      toast.success('Sample report downloaded!');
                    } catch (error) {
                      toast.error('Failed to download sample report');
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700" 
                  data-testid="download-sample-report-btn"
                >
                  <Download className="mr-2 h-4 w-4" /> Download Sample Report
                </Button>
              </div>
              <p className="text-xs text-gray-500">12-Unit Toronto Property Analysis</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <TrendingUp className="h-8 w-8 text-emerald-500" />
            <span className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>InvestorIQ</span>
          </div>
          <p className="text-gray-400">Elite real estate analysis for smart investors</p>
          <p className="text-gray-500 text-sm mt-4">© 2025 InvestorIQ. All rights reserved.</p>
        </div>
      </footer>

      {/* Auth Dialog */}
      <Dialog open={showAuth} onOpenChange={setShowAuth}>
        <DialogContent data-testid="auth-dialog">
          <DialogHeader>
            <DialogTitle>Get Started with InvestorIQ</DialogTitle>
            <DialogDescription>Sign in or create an account to start analyzing properties</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" data-testid="login-tab">Login</TabsTrigger>
              <TabsTrigger value="register" data-testid="register-tab">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={(e) => handleAuth(e, true)} className="space-y-4">
                <div>
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" name="email" type="email" required data-testid="login-email" />
                </div>
                <div>
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" name="password" type="password" required data-testid="login-password" />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={authLoading} data-testid="login-submit-btn">
                  {authLoading ? 'Logging in...' : 'Login'}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={(e) => handleAuth(e, false)} className="space-y-4">
                <div>
                  <Label htmlFor="register-name">Full Name</Label>
                  <Input id="register-name" name="name" type="text" required data-testid="register-name" />
                </div>
                <div>
                  <Label htmlFor="register-email">Email</Label>
                  <Input id="register-email" name="email" type="email" required data-testid="register-email" />
                </div>
                <div>
                  <Label htmlFor="register-password">Password</Label>
                  <Input id="register-password" name="password" type="password" required data-testid="register-password" />
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={authLoading} data-testid="register-submit-btn">
                  {authLoading ? 'Creating account...' : 'Create Account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LandingPage;