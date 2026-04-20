# GitHub Deployment Guide

This guide will help you deploy FinCommand to GitHub.

## Step 1: Install Git

Download and install Git for Windows from:
https://git-scm.com/download/win

**Installation Options**:
- Use default settings
- When asked about the default editor, select your preference
- When asked about line endings, select "Checkout as-is, commit as-is"

After installation, **restart your PowerShell/Command Prompt** and verify:
```powershell
git --version
```

## Step 2: Configure Git

Open PowerShell and run:
```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Replace with your actual name and email.

## Step 3: Create GitHub Personal Access Token

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. Fill in the form:
   - **Note**: `FinCommand Deployment`
   - **Expiration**: 90 days (or your preference)
   - **Select scopes**: Check `repo` and `workflow`
4. Click **"Generate token"** at the bottom
5. **Copy the token** (you won't see it again!)

## Step 4: Deploy to GitHub

Open PowerShell in the `FinCommand` folder and run:

```powershell
# 1. Initialize git repository
git init

# 2. Add all files
git add .

# 3. Create initial commit
git commit -m "Initial FinCommand deployment - professional financial calculator platform"

# 4. Add remote repository
git remote add origin https://github.com/nikhilanand616-coder/codespaces-blank-1.git

# 5. Configure credential helper to store your token
git config credential.helper store

# 6. Push to GitHub
git push -u origin main
```

When prompted for credentials:
- **Username**: Your GitHub username
- **Password**: Paste your personal access token (NOT your GitHub password)

## Step 5: Verify Deployment

Go to: https://github.com/nikhilanand616-coder/codespaces-blank-1

You should see all your files uploaded successfully!

## Future Updates

After making changes, push updates with:

```powershell
git add .
git commit -m "Description of changes"
git push
```

## Troubleshooting

### "git: command not found"
- Restart PowerShell after installing Git
- Verify installation: `git --version`

### "Authentication failed"
- Make sure you're using the personal access token, not your password
- Check that your token has `repo` scope
- If token expired, create a new one

### "Remote already exists"
```powershell
git remote remove origin
git remote add origin https://github.com/nikhilanand616-coder/codespaces-blank-1.git
```

### "Commit failed: core.safecrlf rejected"
```powershell
git config core.safecrlf false
```

---

Need help? Check GitHub's official guide:
https://docs.github.com/en/get-started/importing-your-projects-to-github/importing-a-repository-with-github-importer
