#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const GITHUB_REPO = process.env.GITHUB_REPO || 'https://github.com/nikhilanand616-coder/codespaces-blank-1.git';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const repoMatch = GITHUB_REPO.match(/github\.com\/([^/]+)\/([^/.]+)/);
if (!repoMatch) {
  console.error('Invalid GitHub repository URL');
  process.exit(1);
}

const [, owner, repo] = repoMatch;

async function getFileBlob(filePath) {
  const content = await fs.readFile(filePath);
  return Buffer.from(content).toString('base64');
}

async function uploadFilesToGitHub() {
  if (!GITHUB_TOKEN) {
    console.log('\n📋 DEPLOYMENT GUIDE:');
    console.log('==================');
    console.log('\n1. Create a GitHub Personal Access Token:');
    console.log('   - Go to: https://github.com/settings/tokens');
    console.log('   - Click "Generate new token (classic)"');
    console.log('   - Select scopes: repo, workflow');
    console.log('   - Copy the token');
    console.log('\n2. Set the environment variable:');
    console.log('   $env:GITHUB_TOKEN = "your_token_here"');
    console.log('\n3. Run this script again:');
    console.log('   node deploy.js');
    console.log('\n4. Alternatively, use git directly:');
    console.log('   git init');
    console.log('   git add .');
    console.log('   git commit -m "Initial FinCommand deployment"');
    console.log(`   git remote add origin ${GITHUB_REPO}`);
    console.log('   git push -u origin main');
    process.exit(1);
  }

  console.log('Starting deployment to GitHub...');
  console.log(`Repository: ${GITHUB_REPO}`);
  console.log(`Owner: ${owner}, Repo: ${repo}`);
  
  try {
    // List all project files
    const projectRoot = process.cwd();
    const filesToDeploy = [
      'package.json',
      'package-lock.json',
      'server.js',
      'FinCommands.html',
      'login.html',
      'auth.js',
      'script.js',
      'styles.css',
      'README.md',
      '.gitignore',
      'src/calculators.js',
      'src/userStore.js',
      'src/bankRates.js',
      'data/users.json',
      'data/bankRates.json'
    ];

    console.log('\n✅ Files ready for deployment:');
    filesToDeploy.forEach(f => console.log(`  - ${f}`));

    console.log('\n📤 To complete the deployment:');
    console.log('1. Install Git from: https://git-scm.com/download/win');
    console.log('2. Create a GitHub Personal Access Token:');
    console.log('   https://github.com/settings/tokens?type=beta');
    console.log('3. Run these commands:');
    console.log('   git init');
    console.log('   git add .');
    console.log(`   git commit -m "Initial FinCommand deployment"`);
    console.log(`   git remote add origin ${GITHUB_REPO}`);
    console.log('   git config credential.helper store');
    console.log('   git push -u origin main');
    console.log('\n💡 When prompted for password, use your GitHub token instead.');

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

uploadFilesToGitHub();
