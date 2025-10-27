from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Depends, Request, Header
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import io
import base64
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Environment variables
JWT_SECRET = os.environ['JWT_SECRET_KEY']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
STRIPE_API_KEY = os.environ['STRIPE_API_KEY']

# Create upload directory
UPLOAD_DIR = ROOT_DIR / 'uploads'
UPLOAD_DIR.mkdir(exist_ok=True)

REPORT_DIR = ROOT_DIR / 'reports'
REPORT_DIR.mkdir(exist_ok=True)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Pricing packages
PRICING_PACKAGES = {
    "single": {"amount": 499.0, "reports": 1, "name": "Single Report"},
    "bundle_5": {"amount": 2250.0, "reports": 5, "name": "5 Report Bundle"},
    "bundle_10": {"amount": 3990.0, "reports": 10, "name": "10 Report Bundle"}
}

# Pydantic Models
class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    created_at: datetime
    available_reports: int = 0

class PropertyUpload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    property_name: str
    property_type: str  # "off_market" or "mls"
    file_path: str
    uploaded_at: datetime
    status: str  # "uploaded", "processing", "completed", "failed"

class AnalysisReport(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    property_id: str
    property_name: str
    analysis_data: Dict
    pdf_path: Optional[str] = None
    created_at: datetime
    status: str  # "pending", "generating", "completed", "failed"

class PaymentTransaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    session_id: str
    package_id: str
    amount: float
    currency: str
    payment_status: str
    reports_credited: int
    created_at: datetime
    metadata: Optional[Dict] = None

class CheckoutRequest(BaseModel):
    package_id: str
    origin_url: str

# Helper Functions
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        user = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return User(**user)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")

async def parse_property_data(file_path: str, property_name: str) -> Dict:
    """Extract property data from uploaded file"""
    try:
        # Read file content
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # Use GPT to extract structured data
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"parser_{uuid.uuid4()}",
            system_message="You are an expert real estate data parser. Extract property information and return it as JSON."
        ).with_model("openai", "gpt-5")
        
        user_message = UserMessage(
            text=f"""Parse this property document and extract the following information in JSON format:
            {{
                "address": "property address",
                "city": "city",
                "state": "state",
                "zip_code": "zip code",
                "property_type": "single family, multifamily, commercial, etc",
                "units": number of units,
                "asking_price": asking price in USD,
                "square_feet": total square footage,
                "year_built": year built,
                "current_rent": current monthly rent or total rent if multiple units,
                "expenses": estimated annual expenses,
                "occupancy_rate": current occupancy percentage,
                "additional_info": "any other relevant information"
            }}
            
            Document content:
            {content[:4000]}
            
            Return ONLY the JSON object, no other text."""
        )
        
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            parsed_data = json.loads(response)
        except:
            # If response is not pure JSON, try to extract it
            import re
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                parsed_data = json.loads(json_match.group())
            else:
                parsed_data = {"raw_text": content[:1000]}
        
        return parsed_data
    except Exception as e:
        logging.error(f"Error parsing property data: {e}")
        return {"error": str(e), "raw_content": "Unable to parse"}

async def generate_analysis(property_data: Dict, property_name: str) -> Dict:
    """Generate comprehensive property analysis using GPT-5"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"analysis_{uuid.uuid4()}",
            system_message="""You are an elite real estate investment analyst with expertise in property valuation, 
            market analysis, and investment strategies. You work for top hedge funds and provide $5,000+ quality analysis reports.
            Provide comprehensive, data-driven insights with specific recommendations."""
        ).with_model("openai", "gpt-5")
        
        user_message = UserMessage(
            text=f"""Provide a comprehensive 360-degree investment analysis for this property. Be extremely detailed and professional.
            
            Property Data:
            {json.dumps(property_data, indent=2)}
            
            Provide your analysis in the following JSON format:
            {{
                "executive_summary": "2-3 paragraph overview of the investment opportunity",
                "property_overview": {{
                    "description": "detailed property description",
                    "strengths": ["list of key strengths"],
                    "weaknesses": ["list of potential concerns"]
                }},
                "financial_analysis": {{
                    "purchase_price": asking price,
                    "estimated_value": "your valuation",
                    "cap_rate": "estimated cap rate",
                    "cash_on_cash_return": "estimated return",
                    "annual_cash_flow": "projected annual cash flow",
                    "total_roi_5year": "5-year ROI projection",
                    "break_even_occupancy": "percentage"
                }},
                "market_analysis": {{
                    "market_overview": "local market conditions",
                    "demand_drivers": ["key demand factors"],
                    "supply_factors": ["supply considerations"],
                    "competition_level": "low/medium/high",
                    "market_trend": "improving/stable/declining"
                }},
                "risk_assessment": {{
                    "overall_risk_level": "low/medium/high",
                    "key_risks": ["list of main risks"],
                    "mitigation_strategies": ["how to address each risk"]
                }},
                "investment_recommendation": {{
                    "recommended_strategy": "Buy and Hold / BRRRR / Fix and Flip / Pass",
                    "offer_recommendation": "specific dollar amount and reasoning",
                    "negotiation_points": ["leverage points for negotiation"],
                    "deal_rating": "1-10 score",
                    "reasoning": "detailed explanation of recommendation"
                }},
                "action_items": ["specific next steps for investor"]
            }}
            
            Return ONLY the JSON object with comprehensive analysis."""
        )
        
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        try:
            analysis_data = json.loads(response)
        except:
            import re
            json_match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', response, re.DOTALL)
            if json_match:
                analysis_data = json.loads(json_match.group())
            else:
                analysis_data = {"raw_analysis": response}
        
        return analysis_data
    except Exception as e:
        logging.error(f"Error generating analysis: {e}")
        return {"error": str(e)}

def create_chart(chart_type: str, data: Dict) -> str:
    """Generate chart and return base64 encoded image"""
    try:
        fig, ax = plt.subplots(figsize=(8, 5))
        
        if chart_type == "roi_projection":
            years = [1, 2, 3, 4, 5]
            roi = [8, 18, 29, 42, 57]  # Sample data
            ax.plot(years, roi, marker='o', linewidth=2, color='#10B981')
            ax.set_xlabel('Year', fontsize=12)
            ax.set_ylabel('ROI (%)', fontsize=12)
            ax.set_title('5-Year ROI Projection', fontsize=14, fontweight='bold')
            ax.grid(True, alpha=0.3)
        
        elif chart_type == "cash_flow":
            months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
            cash_flow = [2500, 2700, 2600, 2800, 2750, 2900]
            ax.bar(months, cash_flow, color='#10B981', alpha=0.7)
            ax.set_xlabel('Month', fontsize=12)
            ax.set_ylabel('Cash Flow ($)', fontsize=12)
            ax.set_title('Monthly Cash Flow', fontsize=14, fontweight='bold')
        
        plt.tight_layout()
        
        # Save to bytes
        buf = io.BytesIO()
        plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
        buf.seek(0)
        plt.close()
        
        # Convert to base64
        img_base64 = base64.b64encode(buf.read()).decode('utf-8')
        return img_base64
    except Exception as e:
        logging.error(f"Error creating chart: {e}")
        return ""

async def generate_pdf_report(analysis_id: str, property_name: str, property_data: Dict, analysis_data: Dict) -> str:
    """Generate professional PDF report"""
    try:
        pdf_filename = f"report_{analysis_id}.pdf"
        pdf_path = REPORT_DIR / pdf_filename
        
        doc = SimpleDocTemplate(str(pdf_path), pagesize=letter)
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#0A1628'),
            spaceAfter=30,
            alignment=TA_CENTER
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=16,
            textColor=colors.HexColor('#10B981'),
            spaceAfter=12,
            spaceBefore=12
        )
        
        # Title
        story.append(Paragraph("InvestorIQ Property Analysis Report", title_style))
        story.append(Paragraph(f"<b>{property_name}</b>", styles['Heading2']))
        story.append(Spacer(1, 0.3*inch))
        
        # Executive Summary
        story.append(Paragraph("Executive Summary", heading_style))
        exec_summary = analysis_data.get('executive_summary', 'Analysis in progress')
        story.append(Paragraph(exec_summary, styles['BodyText']))
        story.append(Spacer(1, 0.2*inch))
        
        # Property Overview
        story.append(Paragraph("Property Overview", heading_style))
        prop_overview = analysis_data.get('property_overview', {})
        if prop_overview:
            story.append(Paragraph(f"<b>Description:</b> {prop_overview.get('description', 'N/A')}", styles['BodyText']))
            story.append(Spacer(1, 0.1*inch))
        
        # Financial Analysis
        story.append(PageBreak())
        story.append(Paragraph("Financial Analysis", heading_style))
        fin_analysis = analysis_data.get('financial_analysis', {})
        if fin_analysis:
            fin_data = [
                ['Metric', 'Value'],
                ['Purchase Price', f"${fin_analysis.get('purchase_price', 'N/A'):,}"],
                ['Estimated Value', str(fin_analysis.get('estimated_value', 'N/A'))],
                ['Cap Rate', str(fin_analysis.get('cap_rate', 'N/A'))],
                ['Cash on Cash Return', str(fin_analysis.get('cash_on_cash_return', 'N/A'))],
                ['Annual Cash Flow', str(fin_analysis.get('annual_cash_flow', 'N/A'))]
            ]
            
            fin_table = Table(fin_data, colWidths=[3*inch, 3*inch])
            fin_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#10B981')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 12),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            story.append(fin_table)
            story.append(Spacer(1, 0.3*inch))
        
        # Investment Recommendation
        story.append(Paragraph("Investment Recommendation", heading_style))
        recommendation = analysis_data.get('investment_recommendation', {})
        if recommendation:
            story.append(Paragraph(f"<b>Recommended Strategy:</b> {recommendation.get('recommended_strategy', 'N/A')}", styles['BodyText']))
            story.append(Spacer(1, 0.1*inch))
            story.append(Paragraph(f"<b>Offer Recommendation:</b> {recommendation.get('offer_recommendation', 'N/A')}", styles['BodyText']))
            story.append(Spacer(1, 0.1*inch))
            story.append(Paragraph(f"<b>Deal Rating:</b> {recommendation.get('deal_rating', 'N/A')}/10", styles['BodyText']))
            story.append(Spacer(1, 0.1*inch))
            story.append(Paragraph(f"<b>Reasoning:</b> {recommendation.get('reasoning', 'N/A')}", styles['BodyText']))
        
        # Build PDF
        doc.build(story)
        
        return str(pdf_path)
    except Exception as e:
        logging.error(f"Error generating PDF: {e}")
        raise

# API Routes

# Auth Routes
@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": user_data.email,
        "password_hash": hash_password(user_data.password),
        "name": user_data.name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "available_reports": 0
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_jwt_token(user_id)
    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": user_data.email,
            "name": user_data.name,
            "available_reports": 0
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user['id'])
    return {
        "token": token,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "name": user['name'],
            "available_reports": user.get('available_reports', 0)
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user.id}, {"_id": 0, "password_hash": 0})
    return user

# Property Upload Routes
@api_router.post("/properties/upload")
async def upload_property(
    property_name: str,
    property_type: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    # Save file
    property_id = str(uuid.uuid4())
    file_ext = file.filename.split('.')[-1] if '.' in file.filename else 'txt'
    file_path = UPLOAD_DIR / f"{property_id}.{file_ext}"
    
    with open(file_path, 'wb') as f:
        content = await file.read()
        f.write(content)
    
    # Create property record
    property_doc = {
        "id": property_id,
        "user_id": current_user.id,
        "property_name": property_name,
        "property_type": property_type,
        "file_path": str(file_path),
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "status": "uploaded"
    }
    
    await db.properties.insert_one(property_doc)
    
    return {"property_id": property_id, "status": "uploaded"}

@api_router.get("/properties")
async def get_properties(current_user: User = Depends(get_current_user)):
    properties = await db.properties.find({"user_id": current_user.id}, {"_id": 0}).to_list(100)
    return properties

@api_router.get("/properties/{property_id}")
async def get_property(property_id: str, current_user: User = Depends(get_current_user)):
    property_doc = await db.properties.find_one({"id": property_id, "user_id": current_user.id}, {"_id": 0})
    if not property_doc:
        raise HTTPException(status_code=404, detail="Property not found")
    return property_doc

# Analysis Routes
@api_router.post("/analysis/generate/{property_id}")
async def generate_property_analysis(property_id: str, current_user: User = Depends(get_current_user)):
    # Check if user has available reports
    user = await db.users.find_one({"id": current_user.id})
    if user.get('available_reports', 0) <= 0:
        raise HTTPException(status_code=403, detail="No reports available. Please purchase a package.")
    
    # Get property
    property_doc = await db.properties.find_one({"id": property_id, "user_id": current_user.id})
    if not property_doc:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Check if analysis already exists
    existing_analysis = await db.analyses.find_one({"property_id": property_id})
    if existing_analysis:
        return {"analysis_id": existing_analysis['id'], "status": existing_analysis['status']}
    
    # Create analysis record
    analysis_id = str(uuid.uuid4())
    analysis_doc = {
        "id": analysis_id,
        "user_id": current_user.id,
        "property_id": property_id,
        "property_name": property_doc['property_name'],
        "analysis_data": {},
        "pdf_path": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "pending"
    }
    await db.analyses.insert_one(analysis_doc)
    
    # Start analysis (in background)
    try:
        # Update status
        await db.analyses.update_one({"id": analysis_id}, {"$set": {"status": "generating"}})
        
        # Parse property data
        property_data = await parse_property_data(property_doc['file_path'], property_doc['property_name'])
        
        # Generate analysis
        analysis_data = await generate_analysis(property_data, property_doc['property_name'])
        
        # Generate PDF
        pdf_path = await generate_pdf_report(analysis_id, property_doc['property_name'], property_data, analysis_data)
        
        # Update analysis
        await db.analyses.update_one(
            {"id": analysis_id},
            {"$set": {
                "analysis_data": analysis_data,
                "pdf_path": pdf_path,
                "status": "completed"
            }}
        )
        
        # Deduct report credit
        await db.users.update_one(
            {"id": current_user.id},
            {"$inc": {"available_reports": -1}}
        )
        
    except Exception as e:
        logging.error(f"Error in analysis generation: {e}")
        await db.analyses.update_one({"id": analysis_id}, {"$set": {"status": "failed"}})
    
    return {"analysis_id": analysis_id, "status": "generating"}

@api_router.get("/analysis/{analysis_id}")
async def get_analysis(analysis_id: str, current_user: User = Depends(get_current_user)):
    analysis = await db.analyses.find_one({"id": analysis_id, "user_id": current_user.id}, {"_id": 0})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return analysis

@api_router.get("/analysis/{analysis_id}/download")
async def download_analysis(analysis_id: str, current_user: User = Depends(get_current_user)):
    analysis = await db.analyses.find_one({"id": analysis_id, "user_id": current_user.id})
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    if not analysis.get('pdf_path') or not os.path.exists(analysis['pdf_path']):
        raise HTTPException(status_code=404, detail="PDF not available")
    
    return FileResponse(
        analysis['pdf_path'],
        media_type='application/pdf',
        filename=f"{analysis['property_name']}_analysis.pdf"
    )

@api_router.get("/analyses")
async def get_user_analyses(current_user: User = Depends(get_current_user)):
    analyses = await db.analyses.find({"user_id": current_user.id}, {"_id": 0}).to_list(100)
    return analyses

# Sample Report Routes
@api_router.get("/sample-report")
async def get_sample_report_info():
    sample_pdf_path = REPORT_DIR / "sample_report.pdf"
    if sample_pdf_path.exists():
        return {
            "available": True,
            "property": "2845 Bloor Street West, Toronto",
            "units": 12,
            "type": "Multifamily",
            "download_url": "/api/sample-report/download"
        }
    return {
        "available": False,
        "message": "Sample report not yet available"
    }

@api_router.get("/sample-report/download")
async def download_sample_report():
    sample_pdf_path = REPORT_DIR / "sample_report.pdf"
    if not sample_pdf_path.exists():
        raise HTTPException(status_code=404, detail="Sample report not available")
    
    return FileResponse(
        str(sample_pdf_path),
        media_type='application/pdf',
        filename="InvestorIQ_Sample_Report_Toronto.pdf"
    )

# Payment Routes
@api_router.post("/payments/checkout")
async def create_checkout(checkout_req: CheckoutRequest, current_user: User = Depends(get_current_user)):
    # Validate package
    if checkout_req.package_id not in PRICING_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")
    
    package = PRICING_PACKAGES[checkout_req.package_id]
    
    # Create Stripe checkout
    success_url = f"{checkout_req.origin_url}/payment-success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout_req.origin_url}/pricing"
    
    stripe_checkout = StripeCheckout(
        api_key=STRIPE_API_KEY,
        webhook_url=f"{checkout_req.origin_url}/api/webhook/stripe"
    )
    
    checkout_request = CheckoutSessionRequest(
        amount=package['amount'],
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": current_user.id,
            "package_id": checkout_req.package_id,
            "reports": str(package['reports'])
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user.id,
        "session_id": session.session_id,
        "package_id": checkout_req.package_id,
        "amount": package['amount'],
        "currency": "usd",
        "payment_status": "pending",
        "reports_credited": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "metadata": checkout_request.metadata
    }
    
    await db.payment_transactions.insert_one(transaction_doc)
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/payments/status/{session_id}")
async def get_payment_status(session_id: str, current_user: User = Depends(get_current_user)):
    # Check transaction
    transaction = await db.payment_transactions.find_one({"session_id": session_id, "user_id": current_user.id})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    # If already processed, return status
    if transaction['payment_status'] == 'paid' and transaction['reports_credited'] > 0:
        return {
            "status": "complete",
            "payment_status": "paid",
            "reports_credited": transaction['reports_credited']
        }
    
    # Check with Stripe
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    checkout_status = await stripe_checkout.get_checkout_status(session_id)
    
    # Update transaction
    if checkout_status.payment_status == 'paid' and transaction['reports_credited'] == 0:
        # Credit reports
        package = PRICING_PACKAGES[transaction['package_id']]
        reports_to_credit = package['reports']
        
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "payment_status": "paid",
                "reports_credited": reports_to_credit
            }}
        )
        
        await db.users.update_one(
            {"id": current_user.id},
            {"$inc": {"available_reports": reports_to_credit}}
        )
        
        return {
            "status": "complete",
            "payment_status": "paid",
            "reports_credited": reports_to_credit
        }
    
    return {
        "status": checkout_status.status,
        "payment_status": checkout_status.payment_status
    }

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request, stripe_signature: Optional[str] = Header(None)):
    body = await request.body()
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, stripe_signature)
        
        if webhook_response.payment_status == 'paid':
            # Process payment
            session_id = webhook_response.session_id
            transaction = await db.payment_transactions.find_one({"session_id": session_id})
            
            if transaction and transaction['reports_credited'] == 0:
                package = PRICING_PACKAGES[transaction['package_id']]
                reports_to_credit = package['reports']
                
                await db.payment_transactions.update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "payment_status": "paid",
                        "reports_credited": reports_to_credit
                    }}
                )
                
                await db.users.update_one(
                    {"id": transaction['user_id']},
                    {"$inc": {"available_reports": reports_to_credit}}
                )
        
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail="Webhook processing failed")

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()