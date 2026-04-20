#!/usr/bin/env node

const SimpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');

const projectDir = process.cwd();
const git = SimpleGit(projectDir);

const REPO_URL = 'https://github.com/nikhilanand616-coder/codespaces-blank-1.git';

async function deploy() {
  try {
    console.log('\n🚀 FinCommand GitHub Deployment\n');
    console.log('Repository:', REPO_URL);
    console.log('Directory:', projectDir);
    console.log('---\n');

    // Check if git is initialized
    const isRepo = await git.checkIsRepo();
    
    if (!isRepo) {
      console.log('📝 Initializing git repository...');
      await git.init();
      console.log('✓ Git repository initialized\n');
    } else {
      console.log('✓ Git repository already initialized\n');
    }

    // Configure git user
    console.log('👤 Configuring git user...');
    try {
      await git.addConfig('user.name', 'FinCommand Deployer', false, 'local');
      await git.addConfig('user.email', 'deploy@fincommand.local', false, 'local');
      console.log('✓ Git user configured\n');
    } catch (e) {
      console.log('ℹ Git user already configured\n');
    }

    // Check status
    const status = await git.status();
    console.log(`📊 Files to commit: ${status.files.length}`);
    
    if (status.files.length === 0) {
      console.log('ℹ No changes to commit. Repository is up to date.\n');
    } else {
      console.log('Files:');
      status.files.slice(0, 10).forEach(f => console.log(`  • ${f.path}`));
      if (status.files.length > 10) {
        console.log(`  ... and ${status.files.length - 10} more\n`);
      } else {
        console.log('');
      }

      // Add files
      console.log('📦 Adding files to staging...');
      await git.add(['.']);
      console.log('✓ Files staged\n');

      // Commit
      console.log('💾 Creating commit...');
      await git.commit('Initial FinCommand deployment - professional financial calculator with real-time bank rate syncing');
      console.log('✓ Commit created\n');
    }

    // Check if remote exists
    console.log('🔗 Configuring remote repository...');
    const remotes = await git.getRemotes();
    const hasOrigin = remotes.some(r => r.name === 'origin');

    if (!hasOrigin) {
      await git.addRemote('origin', REPO_URL);
      console.log('✓ Remote added\n');
    } else {
      console.log('✓ Remote already configured\n');
    }

    // Set branch tracking
    console.log('🎯 Setting up branch tracking...');
    try {
      const branches = await git.branchLocal();
      console.log('✓ Current branch:', branches.current);
    } catch (e) {
      // Ignore
    }

    // Push to GitHub
    console.log('\n📤 Pushing to GitHub...');
    console.log('This may take a moment...\n');

    try {
      const pushResult = await git.push('origin', 'main', ['-u']);
      console.log('✓ Successfully pushed to GitHub!\n');
      console.log('📍 Repository URL:', REPO_URL);
      console.log('\n✅ Deployment Complete!\n');
      console.log('Your code is now on GitHub and ready to share.');
    } catch (pushError) {
      // Try with --force if main branch doesn't exist
      if (pushError.message.includes('no changes added') || pushError.message.includes('nothing to commit')) {
        console.log('ℹ No new changes to push\n');
      } else {
        console.log('⚠️  Push encountered an issue:', pushError.message);
        console.log('\n💡 Troubleshooting:');
        console.log('1. Make sure you have a Personal Access Token created:');
        console.log('   https://github.com/settings/tokens');
        console.log('2. Run this with your token:');
        console.log('   git push origin main');
        console.log('   (Enter token when prompted for password)\n');
        throw pushError;
      }
    }

  } catch (error) {
    console.error('❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

deploy();
