# 🚀 Serverless GenAI Document Generator

A serverless React application that uses GenAI to transform maintenance manuals into structured documents (checksheets & work instructions) for maintenance technicians.

## 🎯 Features

- **Inspection Checksheet Generator**: Extract inspection points from PDFs and generate Excel files
- **Work Instructions Generator**: Extract procedures from PDFs and generate Word documents
- **Serverless Architecture**: Built on AWS Lambda, API Gateway, and S3

- **Vector Search**: Pinecone integration for semantic document search
- **Langchain Integration**: Optional Langchain support for vector operations (configurable)
- **Real-time Processing**: Upload, process, and generate documents in real-time

## 📋 Prerequisites

- Node.js v18+ ([Download](https://nodejs.org/))
- npm (comes with Node.js)
- AWS Account with CLI configured
- Serverless Framework installed globally (V4 or V3)
- **Vector Database**: Pinecone account with API key
- **AI Provider**: Google Gemini API key (recommended)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd "Serverless GenAI Document Generator"
```

### 2. Environment Setup

1. **Copy the environment template files:**

   ```bash
   # Backend
   Copy-Item backend\.env.example backend\.env

   # Frontend
   Copy-Item frontend\.env.example frontend\.env
   ```

2. **Configure your `.env` files:**

   **Backend (`backend/.env`):**

   ```env
   # AWS Configuration
   AWS_REGION=us-east-1

   # Google Gemini Configuration (Primary - Recommended)
   GOOGLE_API_KEY=your-google-api-key
   GEMINI_API_KEY=your-google-api-key  # Alternative to GOOGLE_API_KEY
   GEMINI_MODEL=gemini-2.5-flash  # Optional, defaults to 'gemini-2.5-flash'
   GEMINI_EMBEDDING_DIMENSION=1024  # Optional, defaults to '1024'





   # Pinecone Configuration (Optional - Alternative to ChromaDB)
   PINECONE_API_KEY=your-pinecone-api-key
   PINECONE_INDEX_NAME=genai-documents
   PINECONE_ENVIRONMENT=us-east-1-aws





   # S3 Bucket Configuration (replace [yourname] with your identifier)
   S3_FRONTEND_BUCKET=genai-frontend-[yourname]
   S3_DOCUMENTS_BUCKET=genai-documents-[yourname]
   S3_OUTPUTS_BUCKET=genai-outputs-[yourname]

   # Node Environment
   NODE_ENV=production
   ```

   **Frontend (`frontend/.env`):**

   ```env
   # API Gateway Configuration (set after deployment)
   VITE_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/api
   ```

3. **Configure AWS CLI** (if not already done):
   ```bash
   aws configure
   ```
   Enter your AWS Access Key ID, Secret Access Key, region, and output format.

### 3. Install Dependencies

```bash
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```


## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend (S3)                      │
│  • Document Upload  • Use Case Selection  • Polling Status     │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│               AWS API Gateway (29s timeout limit)               │
│  • POST /upload          • POST /ingest   • POST /generate-doc  │
│  • GET /ingest-status    • GET /generation-status               │
└────────┬────────────────────┬────────────────────┬──────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│ Upload Lambda  │  │  Ingest Lambda   │  │  Generate Lambda    │
│   (Sync 30s)   │  │   (Async 300s)   │  │   (Async 300s)      │
└────────┬───────┘  └────────┬─────────┘  └──────────┬──────────┘
         │                   │                         │
         │      ┌────────────┴─────┐      ┌───────────┴──────────┐
         │      │ Self-Invoke      │      │ Self-Invoke          │
         │      │ (InvocationType  │      │ (InvocationType      │
         │      │  = 'Event')      │      │  = 'Event')          │
         │      └────────┬─────────┘      └──────────┬───────────┘
         │               │                           │
         ▼               ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                          AWS S3 Buckets                          │
│  • Documents (PDFs)  • Outputs (Excel/DOCX)  • Frontend (HTML)  │
└──────────────┬──────────────────────────────────────────────────┘
               │
       ┌───────┴────────┬─────────────────┬───────────────┐
       ▼                ▼                 ▼               ▼
┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐
│  DynamoDB   │  │ Pinecone/    │  │  Gemini  │  │   Bedrock    │
│   Status    │  │  ChromaDB    │  │   AI     │  │   Claude     │
│  Tracking   │  │  (Vectors)   │  │ (8000T)  │  │   (200K)     │
└─────────────┘  └──────────────┘  └──────────┘  └──────────────┘
```

### Async Processing Flow (Solving 504 Timeout Issue)

```
User Action                    API Gateway              Lambda                    Frontend
────────────────────────────────────────────────────────────────────────────────────────

1. Click "Process"        ─────>  POST /ingest
                                     (29s limit)
                                         │
2. Return immediately     <─────  202 Accepted         ─────> Store generationId
   with generationId                { generationId,            Start polling
                                      status: processing }
                                         │
                                         └─────> Async Invoke
                                                 (300s timeout)
                                                      │
                                                      ├─> Extract PDF text
                                                      ├─> Generate embeddings
                                                      ├─> Store in Pinecone
                                                      └─> Update DynamoDB status
                                                          (progress: 0→100)
3. Poll every 3-10s       ─────>  GET /ingest-status/:id
   (exponential backoff)            │
                                    └─────> Read DynamoDB
4. Get progress updates   <─────  { status: processing,
                                    progress: 45,
                                    message: "Processing chunk 5/10" }

5. Processing complete    <─────  { status: completed,
   Stop polling                     progress: 100 }
```

### Key Components

**Frontend (React + Zustand):**

- Async state management with polling
- Exponential backoff (3s → 10s intervals)
- Real-time progress updates
- Error handling with retry

**API Gateway:**

- 29-second hard timeout limit
- Returns 202 Accepted for async operations
- Status endpoints for polling

**Lambda Functions:**

- `upload` (30s sync) - File upload to S3
- `ingest` (300s async) - PDF processing, vectorization, 15+ chunks
- `generateDocument` (300s async) - AI generation with 15+ requests
- Status tracking with DynamoDB

**AI Strategy (Solving Token Limits):**

- Split context into 15+ small chunks (~300 chars each)
- Make 15+ separate AI requests per generation
- Max 8000 tokens per request (vs 8192 limit)
- Aggressive prompt constraints (word limits)
- Merge results with deduplication

**Logging & Monitoring:**

- CloudWatch Logs for all Lambda functions
- Structured logging with context
- Error tracking with stack traces
- Performance metrics (duration, memory)

**Vector Database:**

- Pinecone (primary) or ChromaDB
- Semantic search for relevant chunks
- 1024-dimension embeddings (Gemini)

**AI Providers:**

- Google Gemini 2.0 Flash (primary)
- AWS Bedrock Claude 3.5 Sonnet (alternative)

## 🛠️ Development

### Backend Development

```bash
cd backend

# Install dependencies
npm install

# Run locally with Serverless Offline
npm run offline

# Or use Express server (if configured)
npm start  # Runs with nodemon for auto-reload
```

Backend will run on `http://localhost:3000` with Serverless Offline.

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev

# Update .env for local development
# VITE_API_URL=http://localhost:3000/api
```

Frontend will run on `http://localhost:5173` (Vite default port).

### Local Testing

1. Start backend: `cd backend && npm run offline`
2. Start frontend: `cd frontend && npm run dev`
3. Update frontend `.env`: `VITE_API_URL=http://localhost:3000/api`
4. Test the full flow: Upload → Process → Generate → Download

## 📦 Deployment

### Backend Deployment

```bash
cd backend

# Set environment variables (see Backend Environment Variables section)
# Create .env file with your configuration

# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

After deployment, you'll receive API Gateway endpoints. Update your frontend `.env` file with the API URL.

### Frontend Deployment

```bash
cd frontend

# Update .env with API Gateway URL
# VITE_API_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/dev/api

# Build for production
npm run build

# Deploy to S3 (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File deploy.ps1

# Or manually upload dist/ folder to your S3 frontend bucket
```

See [`backend/DEPLOYMENT.md`](./backend/DEPLOYMENT.md) and [`frontend/DEPLOYMENT.md`](./frontend/DEPLOYMENT.md) for detailed deployment instructions.

## 🔍 Troubleshooting

### Common Issues

**504 Gateway Timeout Errors**

**Problem:** API Gateway has a hard 29-second timeout limit. Long operations (document processing, AI generation) exceed this limit.

**Solution Implemented:**

1. **Async Processing Pattern**:

   - API returns `202 Accepted` immediately with `generationId`
   - Lambda invokes itself asynchronously (`InvocationType: 'Event'`)
   - Frontend polls status endpoint every 3-10 seconds
   - DynamoDB tracks progress (0-100%)

2. **Implementation**:

   ```javascript
   // API returns immediately
   return { statusCode: 202, body: { generationId, status: "processing" } };

   // Lambda self-invokes asynchronously (no timeout)
   await lambda.invoke({
     InvocationType: "Event", // Async
     FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
     Payload: JSON.stringify({ action: "process", ...data }),
   });

   // Frontend polls with exponential backoff
   const pollStatus = async () => {
     const status = await checkStatus(generationId);
     if (status === "completed") return;
     setTimeout(pollStatus, interval * 1.2); // Exponential backoff
   };
   ```

**502 Bad Gateway Errors**

**Cause:** Lambda function crashes, out of memory, or returns invalid response

**Solution:**

1. **Increased Memory**: 1024MB for processing functions
2. **Error Handling**: Try-catch blocks in all async operations
3. **Input Validation**: Validate all inputs before processing
4. **Structured Logging**: CloudWatch logs for debugging
5. **Retry Logic**: Exponential backoff with 3 retry attempts

**Token Limit Errors (AI Responses Truncated)**

**Problem:** Gemini's 8192 token output limit exceeded, responses truncated

**Solution - Aggressive Chunking:**

1. Split context into 15+ small chunks (~300 chars each)
2. Make 15+ separate AI requests per document
3. Use 8000 tokens per request (buffer from 8192 limit)
4. Strict prompts with word limits:
   - Item names: 3 words max
   - Descriptions: 1 sentence, 10 words max
   - Notes: 5 words max
5. Merge results with deduplication

**Logging & Debugging**

**CloudWatch Logs Access:**

```bash
# View logs for specific function
aws logs tail /aws/lambda/genai-doc-generator-dev-ingest --follow

# Search for errors
aws logs filter-pattern /aws/lambda/genai-doc-generator-dev-ingest "ERROR"
```

**Structured Logging Implementation:**

```javascript
// Every Lambda function logs with context
logger.info("Processing document", {
  fileId,
  stage: "embedding_generation",
  chunkCount: chunks.length,
  duration: Date.now() - startTime,
});

logger.error("Generation failed", {
  error: err.message,
  stack: err.stack,
  generationId,
  chunk: chunkIndex,
});
```

**CORS Errors**

- Ensure API Gateway CORS is configured (already set in `serverless.yml`)
- Check that frontend is using correct API Gateway URL
- Verify CORS headers in browser network tab

**Vector Database Connection**

- Pinecone: Verify `PINECONE_API_KEY`, `PINECONE_INDEX_NAME` are set
- ChromaDB: Verify `CHROMA_API_KEY`, `CHROMA_TENANT` are set
- Check CloudWatch logs for connection errors

**AI Provider Issues**

- Gemini: Verify `GOOGLE_API_KEY` is valid and has quota
- Bedrock: Ensure IAM role has `bedrock:InvokeModel` permission
- Check CloudWatch logs for specific error messages

See [`backend/DEPLOYMENT.md`](./backend/DEPLOYMENT.md) for more detailed troubleshooting.

## 🎨 Features in Detail

### LLM Selection

Users can choose between:

- **Google Gemini** (default): Fast, cost-effective, great for structured outputs
- **AWS Bedrock (Claude)**: High-quality responses, AWS-native integration

### Vector Database Options

- **ChromaDB** (default): Easy setup, managed cloud service
- **Pinecone**: Enterprise-grade, scalable vector database

### Langchain Integration

- Optional Langchain support via `USE_LANGCHAIN=true` environment variable
- Provides abstraction layer for vector operations
- Supports both ChromaDB and Pinecone through Langchain

### Document Generation

- **Checksheets**: Excel format with inspection points, frequencies, and validation criteria
- **Work Instructions**: DOCX format with step-by-step procedures, prerequisites, and safety warnings

## 📊 Tech Stack

**Frontend:**

- React 19 with Vite
- Zustand for state management
- Tailwind CSS for styling
- Axios for API calls

**Backend:**

- Node.js 18.x
- AWS Lambda (Serverless)
- Serverless Framework V4
- Express (for local development)

**AI & ML:**

- Google Gemini (text generation & embeddings)
- AWS Bedrock / Claude (alternative)
- Langchain (optional vector operations)

**Vector Databases:**

- ChromaDB (primary)
- Pinecone (alternative)

**AWS Services:**

- Lambda (compute)
- API Gateway (API)
- S3 (storage)
- CloudWatch (logging)

## 🎯 Requirements vs Achievements

### **Project Requirements**

This project was built as an interview exercise with the following requirements:

#### **Core Requirements**

1. **Serverless Architecture**
   - React app hosted on S3
   - AWS API Gateway + Lambda (NodeJS backend)
   - No servers to manage
   - Deploy using Serverless Framework or SAM
2. **GenAI Integration**
   - Use AWS Bedrock (Claude), Gemini, or OpenAI
   - Query AI models for document generation
3. **Vector Database & Langchain**
   - Ingest documents and store in vector DB (Pinecone preferred)
   - Use Langchain for vector operations
   - Data must not leave AWS ecosystem
4. **Document Processing**
   - Upload and process 2-3 documents
   - Extract relevant information
5. **Use Case 1: Inspection Checksheet**
   - Generate Excel file in specific format
   - Extract inspection points from documents
   - Output: Checksheet form (Annual/Monthly/Weekly)
6. **Use Case 2: Work Instructions**
   - Generate DOCX file in specific format
   - Create step-by-step procedures
   - Output: Work instructions document




