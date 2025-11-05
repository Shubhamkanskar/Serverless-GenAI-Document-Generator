# Frontend Deployment Script
# Builds and deploys React frontend to S3

$ErrorActionPreference = "Stop"

$bucket = "genai-frontend-shubham"
$region = "us-east-1"

# Detect AWS CLI path
$awsCliPath = $null
if (Get-Command aws -ErrorAction SilentlyContinue) {
    $awsCliPath = "aws"
} elseif (Test-Path "$env:ProgramFiles\Amazon\AWSCLIV2\aws.exe") {
    $awsCliPath = "$env:ProgramFiles\Amazon\AWSCLIV2\aws.exe"
} elseif (Test-Path "$env:ProgramFiles(x86)\Amazon\AWSCLIV2\aws.exe") {
    $awsCliPath = "$env:ProgramFiles(x86)\Amazon\AWSCLIV2\aws.exe"
} else {
    Write-Host "Error: AWS CLI not found!" -ForegroundColor Red
    Write-Host "Please install AWS CLI from: https://aws.amazon.com/cli/" -ForegroundColor Yellow
    Write-Host "Or add AWS CLI to your PATH environment variable" -ForegroundColor Yellow
    exit 1
}

Write-Host "Deploying React Frontend to S3" -ForegroundColor Cyan
Write-Host "Bucket: $bucket" -ForegroundColor Yellow
Write-Host "Region: $region" -ForegroundColor Yellow
Write-Host ""

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "Warning: .env file not found!" -ForegroundColor Yellow
    Write-Host "   Make sure VITE_API_URL is set in .env" -ForegroundColor Yellow
    Write-Host ""
}

# Build
Write-Host "Building for production..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build successful!" -ForegroundColor Green
Write-Host ""

# Check if dist directory exists
if (-not (Test-Path "dist")) {
    Write-Host "dist directory not found. Build may have failed." -ForegroundColor Red
    exit 1
}

# Deploy to S3
Write-Host "Uploading to S3..." -ForegroundColor Yellow
Write-Host "   This may take a few moments..." -ForegroundColor Gray

& $awsCliPath s3 sync dist/ s3://$bucket/ --delete --region $region

if ($LASTEXITCODE -ne 0) {
    Write-Host "Upload failed!" -ForegroundColor Red
    Write-Host "   Check your AWS credentials and bucket permissions" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "Deployment successful!" -ForegroundColor Green
Write-Host ""
Write-Host "Website URL:" -ForegroundColor Cyan
Write-Host "   http://$bucket.s3-website-$region.amazonaws.com" -ForegroundColor White
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "   1. Test the website URL above" -ForegroundColor White
Write-Host "   2. Verify API integration works" -ForegroundColor White
Write-Host "   3. Set up CloudFront for HTTPS (optional)" -ForegroundColor White
Write-Host ""

