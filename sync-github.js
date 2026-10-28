// sync-github.js
// Directly uploads / syncs files to GitHub via the GitHub REST API (No Git CLI required!)
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'Godonz';
const REPO_NAME = 'aave-plasma-notifier';
const BRANCH = 'main';

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  const tokenFile = path.join(__dirname, '.github-token');
  if (fs.existsSync(tokenFile)) {
    return fs.readFileSync(tokenFile, 'utf8').trim();
  }
  throw new Error("GitHub Token not found! Please set GITHUB_TOKEN or create .github-token file.");
}

async function getFileSha(token, relativePath) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${relativePath}?ref=${BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Direct-GitHub-API-Sync'
    }
  });

  if (res.status === 200) {
    const data = await res.json();
    return data.sha;
  } else if (res.status === 404) {
    return null; // File does not exist yet (create new)
  } else {
    const errText = await res.text();
    throw new Error(`Failed to check existing file (${res.status}): ${errText}`);
  }
}

async function uploadFile(token, relativePath, commitMessage) {
  const fullPath = path.join(__dirname, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Local file not found: ${fullPath}`);
  }

  const contentBase64 = fs.readFileSync(fullPath).toString('base64');
  const existingSha = await getFileSha(token, relativePath);

  const payload = {
    message: commitMessage || `Update ${relativePath} via API`,
    content: contentBase64,
    branch: BRANCH
  };
  if (existingSha) {
    payload.sha = existingSha;
  }

  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${relativePath}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Direct-GitHub-API-Sync'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API Error (${res.status}): ${errText}`);
  }

  const result = await res.json();
  const newSha = result.commit ? result.commit.sha.slice(0, 7) : 'ok';
  console.log(`✅ [GitHub API] Uploaded ${relativePath} successfully! (Commit: ${newSha})`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let commitMessage = "Update via GitHub REST API";
  const filesToUpload = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-m' && args[i + 1]) {
      commitMessage = args[i + 1];
      i++;
    } else {
      filesToUpload.push(args[i].replace(/\\/g, '/'));
    }
  }

  if (filesToUpload.length === 0) {
    console.log("Usage: node sync-github.js <file1> <file2> ... [-m 'commit message']");
    process.exit(0);
  }

  try {
    const token = getGitHubToken();
    console.log(`🚀 Starting direct upload to ${REPO_OWNER}/${REPO_NAME} (Branch: ${BRANCH})...`);
    console.log(`Commit message: "${commitMessage}"`);

    for (const file of filesToUpload) {
      console.log(`Uploading ${file}...`);
      await uploadFile(token, file, commitMessage);
    }

    console.log("🎉 All files synced to GitHub successfully without Git!");
  } catch (error) {
    console.error("❌ Sync failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { uploadFile, getGitHubToken };
