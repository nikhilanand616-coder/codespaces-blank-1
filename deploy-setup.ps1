#!/usr/bin/env pwsh
<#
.SYNOPSIS
FinCommand One-Click Deployment Script
Automates the entire GitHub deployment process for FinCommand

.DESCRIPTION
This script sets up Git, configures the repository, and pushes to GitHub.
Requires Windows PowerShell 5.0+ or PowerShell 7+

.EXAMPLE
.\deploy-setup.ps1

#>

Write-Host "`n════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  FinCommand GitHub Deployment Setup" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════`n" -ForegroundColor Cyan

# Step 1: Check if Git is installed
Write-Host "Step 1: Checking Git installation..." -ForegroundColor Yellow

try {
    $gitVersion = & git --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Git is installed: $gitVersion" -ForegroundColor Green
    } else {
        throw "Git not found"
    }
} catch {
    Write-Host "✗ Git is not installed or not in PATH" -ForegroundColor Red
    Write-Host "`nPlease install Git from: https://git-scm.com/download/win" -ForegroundColor Yellow
    Write-Host "Then restart PowerShell and run this script again.`n" -ForegroundColor Yellow
    exit 1
}

# Step 2: Check if git is initialized
Write-Host "`nStep 2: Checking Git repository..." -ForegroundColor Yellow

if (Test-Path ".\.git") {
    Write-Host "✓ Git repository already initialized" -ForegroundColor Green
} else {
    Write-Host "Initializing new Git repository..." -ForegroundColor Cyan
    & git init
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Git repository initialized" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to initialize Git repository" -ForegroundColor Red
        exit 1
    }
}

# Step 3: Configure Git user
Write-Host "`nStep 3: Configuring Git user..." -ForegroundColor Yellow

$userName = & git config --global user.name
$userEmail = & git config --global user.email

if ([string]::IsNullOrWhiteSpace($userName)) {
    Write-Host "Git user not configured. Setting up..." -ForegroundColor Cyan
    $name = Read-Host "Enter your full name"
    $email = Read-Host "Enter your email"
    & git config --global user.name "$name"
    & git config --global user.email "$email"
    Write-Host "✓ Git user configured" -ForegroundColor Green
} else {
    Write-Host "✓ Git user already configured: $userName <$userEmail>" -ForegroundColor Green
}

# Step 4: Add files
Write-Host "`nStep 4: Adding files to Git..." -ForegroundColor Yellow

$status = & git status --short
$untracked = $status | Measure-Object | Select-Object -ExpandProperty Count

if ($untracked -gt 0) {
    Write-Host "Found $untracked files to add" -ForegroundColor Cyan
    & git add .
    Write-Host "✓ Files added to staging area" -ForegroundColor Green
} else {
    Write-Host "✓ All files already tracked" -ForegroundColor Green
}

# Step 5: Create commit
Write-Host "`nStep 5: Creating initial commit..." -ForegroundColor Yellow

$commitMessage = "Initial FinCommand deployment - professional financial calculator platform with real-time bank rate syncing"

try {
    & git commit -m "$commitMessage" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Commit created successfully" -ForegroundColor Green
    }
} catch {
    Write-Host "ℹ Files already committed" -ForegroundColor Yellow
}

# Step 6: Check remote
Write-Host "`nStep 6: Configuring GitHub remote..." -ForegroundColor Yellow

$remoteUrl = "https://github.com/nikhilanand616-coder/codespaces-blank-1.git"
$existing = & git remote get-url origin 2>&1

if ($existing -eq $remoteUrl) {
    Write-Host "✓ Remote repository already configured" -ForegroundColor Green
} else {
    if ($existing -like "*fatal*") {
        Write-Host "Adding new remote..." -ForegroundColor Cyan
        & git remote add origin $remoteUrl
    } else {
        Write-Host "Updating existing remote..." -ForegroundColor Cyan
        & git remote set-url origin $remoteUrl
    }
    Write-Host "✓ Remote repository configured" -ForegroundColor Green
}

# Step 7: Setup credential helper
Write-Host "`nStep 7: Configuring credential storage..." -ForegroundColor Yellow

& git config credential.helper store
Write-Host "✓ Credential helper enabled" -ForegroundColor Green

# Step 8: Push to GitHub
Write-Host "`nStep 8: Pushing to GitHub..." -ForegroundColor Yellow
Write-Host "You will be prompted for credentials." -ForegroundColor Cyan
Write-Host "Enter your GitHub username and Personal Access Token (not your password)" -ForegroundColor Cyan

& git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Successfully pushed to GitHub!" -ForegroundColor Green
    Write-Host "`nRepository URL: $remoteUrl" -ForegroundColor Green
} else {
    Write-Host "`nℹ Push encountered an issue. This may be normal if..." -ForegroundColor Yellow
    Write-Host "  - You need to create a GitHub Personal Access Token" -ForegroundColor Yellow
    Write-Host "  - The 'main' branch already has commits" -ForegroundColor Yellow
}

# Step 9: Summary
Write-Host "`n════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Deployment Setup Complete!" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "📋 Next Steps:" -ForegroundColor Green
Write-Host "1. Visit your repository: https://github.com/nikhilanand616-coder/codespaces-blank-1" -ForegroundColor White
Write-Host "2. Verify all files are uploaded" -ForegroundColor White
Write-Host "3. Start the local server: npm start" -ForegroundColor White
Write-Host "4. Access the app at: http://localhost:3000`n" -ForegroundColor White

Write-Host "🔐 To push future updates:" -ForegroundColor Cyan
Write-Host "   git add ." -ForegroundColor Gray
Write-Host "   git commit -m 'Your message'" -ForegroundColor Gray
Write-Host "   git push`n" -ForegroundColor Gray

Write-Host "ℹ️ Need a Personal Access Token?" -ForegroundColor Yellow
Write-Host "   https://github.com/settings/tokens`n" -ForegroundColor Yellow
