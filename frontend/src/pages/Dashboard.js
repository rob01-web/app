import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Download, Eye, TrendingUp, LogOut, CreditCard } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = ({ user, onLogout, setUser }) => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState([]);
  const [analyses, setAnalyses] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState('off_market');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [propsRes, analysesRes, userRes] = await Promise.all([
        axios.get(`${API}/properties`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/analyses`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      
      setProperties(propsRes.data);
      setAnalyses(analysesRes.data);
      setUser(userRes.data);
      localStorage.setItem('user', JSON.stringify(userRes.data));
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile || !propertyName) {
      toast.error('Please provide property name and file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/properties/upload?property_name=${encodeURIComponent(propertyName)}&property_type=${propertyType}`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      toast.success('Property uploaded successfully!');
      setSelectedFile(null);
      setPropertyName('');
      setPropertyType('off_market');
      document.getElementById('file-input').value = '';
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateAnalysis = async (propertyId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API}/analysis/generate/${propertyId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success('Analysis generation started!');
      
      // Poll for completion
      const analysisId = response.data.analysis_id;
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await axios.get(
            `${API}/analysis/${analysisId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (statusRes.data.status === 'completed') {
            clearInterval(pollInterval);
            toast.success('Analysis completed!');
            fetchData();
          } else if (statusRes.data.status === 'failed') {
            clearInterval(pollInterval);
            toast.error('Analysis failed');
            fetchData();
          }
        } catch (err) {
          clearInterval(pollInterval);
        }
      }, 3000);

      // Stop polling after 2 minutes
      setTimeout(() => clearInterval(pollInterval), 120000);

    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to generate analysis');
    }
  };

  const handleDownload = async (analysisId, propertyName) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `${API}/analysis/${analysisId}/download`,
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${propertyName}_analysis.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success('Report downloaded!');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-8 w-8 text-emerald-600" />
              <span className="text-2xl font-bold" style={{ fontFamily: 'Space Grotesk' }}>InvestorIQ</span>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => navigate('/')} data-testid="home-btn">Home</Button>
              <Button variant="ghost" onClick={onLogout} data-testid="dashboard-logout-btn">
                <LogOut className="h-4 w-4 mr-2" /> Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* User Info & Credits */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: 'Space Grotesk' }} data-testid="dashboard-welcome">Welcome back, {user.name}!</h1>
          <div className="flex items-center space-x-4">
            <Badge variant="secondary" className="text-lg px-4 py-2" data-testid="available-reports-badge">
              <CreditCard className="h-4 w-4 mr-2" />
              {user.available_reports} Reports Available
            </Badge>
            {user.available_reports === 0 && (
              <Button onClick={() => navigate('/#pricing')} variant="outline" data-testid="buy-reports-btn">
                Buy More Reports
              </Button>
            )}
          </div>
        </div>

        {/* Upload Section */}
        <Card className="mb-8" data-testid="upload-card">
          <CardHeader>
            <CardTitle>Upload Property</CardTitle>
            <CardDescription>Upload rent rolls, property documents, or MLS listings for analysis</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="property-name">Property Name/Address</Label>
                  <Input
                    id="property-name"
                    value={propertyName}
                    onChange={(e) => setPropertyName(e.target.value)}
                    placeholder="123 Main St, City, State"
                    required
                    data-testid="property-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="property-type">Property Type</Label>
                  <Select value={propertyType} onValueChange={setPropertyType}>
                    <SelectTrigger data-testid="property-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="off_market" data-testid="type-off-market">Off-Market Deal</SelectItem>
                      <SelectItem value="mls" data-testid="type-mls">MLS Listing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="file-input">Upload Document</Label>
                <Input
                  id="file-input"
                  type="file"
                  accept=".txt,.pdf,.doc,.docx"
                  onChange={(e) => setSelectedFile(e.target.files[0])}
                  required
                  data-testid="file-input"
                />
                <p className="text-xs text-gray-500 mt-1">Supported: PDF, TXT, DOC, DOCX</p>
              </div>
              <Button type="submit" disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700" data-testid="upload-submit-btn">
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Uploading...' : 'Upload Property'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Properties & Analyses */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Properties List */}
          <div>
            <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk' }} data-testid="properties-heading">Your Properties</h2>
            {properties.length === 0 ? (
              <Card data-testid="no-properties-card">
                <CardContent className="py-8 text-center text-gray-500">
                  <Upload className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  No properties uploaded yet
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {properties.map((property) => {
                  const analysis = analyses.find(a => a.property_id === property.id);
                  return (
                    <Card key={property.id} className="card-hover" data-testid={`property-card-${property.id}`}>
                      <CardHeader>
                        <CardTitle className="text-lg" data-testid={`property-name-${property.id}`}>{property.property_name}</CardTitle>
                        <CardDescription>
                          <Badge variant="outline" data-testid={`property-type-${property.id}`}>
                            {property.property_type === 'mls' ? 'MLS Listing' : 'Off-Market'}
                          </Badge>
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-500 mb-4">Uploaded: {new Date(property.uploaded_at).toLocaleDateString()}</p>
                        {!analysis ? (
                          <Button
                            onClick={() => handleGenerateAnalysis(property.id)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700"
                            disabled={user.available_reports === 0}
                            data-testid={`generate-analysis-btn-${property.id}`}
                          >
                            <FileText className="h-4 w-4 mr-2" />
                            Generate Analysis
                          </Button>
                        ) : (
                          <div data-testid={`analysis-status-${property.id}`}>
                            {analysis.status === 'generating' && (
                              <div className="space-y-2">
                                <p className="text-sm text-gray-600">Generating analysis...</p>
                                <Progress value={60} className="w-full" />
                              </div>
                            )}
                            {analysis.status === 'completed' && (
                              <Button
                                onClick={() => handleDownload(analysis.id, property.property_name)}
                                className="w-full"
                                variant="outline"
                                data-testid={`download-report-btn-${property.id}`}
                              >
                                <Download className="h-4 w-4 mr-2" />
                                Download Report
                              </Button>
                            )}
                            {analysis.status === 'failed' && (
                              <div className="text-red-600 text-sm">Analysis failed. Please try again.</div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Analyses List */}
          <div>
            <h2 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Space Grotesk' }} data-testid="reports-heading">Your Reports</h2>
            {analyses.filter(a => a.status === 'completed').length === 0 ? (
              <Card data-testid="no-reports-card">
                <CardContent className="py-8 text-center text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  No completed reports yet
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {analyses
                  .filter(a => a.status === 'completed')
                  .map((analysis) => (
                    <Card key={analysis.id} className="card-hover" data-testid={`report-card-${analysis.id}`}>
                      <CardHeader>
                        <CardTitle className="text-lg" data-testid={`report-name-${analysis.id}`}>{analysis.property_name}</CardTitle>
                        <CardDescription>Completed: {new Date(analysis.created_at).toLocaleDateString()}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-gray-50 p-4 rounded-lg mb-4">
                          <p className="text-sm font-semibold mb-2">Analysis Highlights:</p>
                          {analysis.analysis_data.investment_recommendation && (
                            <div className="space-y-1 text-sm">
                              <p><span className="font-medium">Strategy:</span> {analysis.analysis_data.investment_recommendation.recommended_strategy}</p>
                              <p><span className="font-medium">Rating:</span> {analysis.analysis_data.investment_recommendation.deal_rating}/10</p>
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={() => handleDownload(analysis.id, analysis.property_name)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700"
                          data-testid={`download-completed-report-btn-${analysis.id}`}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download Full Report
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;