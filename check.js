// check.js
// Node.js script to monitor Aave V3 USDT pool on Ethereum network
// Runs inside GitHub Actions (requires Node.js 18+)

// 1. Load Configurations from Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const UTILIZATION_THRESHOLD = parseFloat(process.env.UTILIZATION_THRESHOLD || '94.0');
const RPC_URL = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com';
const SEND_ALWAYS = process.env.SEND_ALWAYS === 'true';

const ASSET_ADDRESS = process.env.ASSET_ADDRESS || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2';
const DATA_PROVIDER_ADDRESS = process.env.DATA_PROVIDER_ADDRESS || '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD';

// Helper to format currency values to Millions
function formatMillions(value) {
  return (value / 1000000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M';
}

function formatCap(value) {
  if (value === 0 || value >= 1e12) return 'No Cap';
  return formatMillions(value);
}

async function fetchWithRetry(url, options, retries = 3, delayMs = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Invalid response format (expected JSON, got: ${contentType}). Content preview: ${text.slice(0, 100)}`);
      }

      return await response.json();
    } catch (err) {
      console.warn(`Request failed (attempt ${i + 1}/${retries}): ${err.message}`);
      if (i === retries - 1) throw err;
      console.log(`Waiting ${delayMs / 1000}s before retrying...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

// Perform direct JSON-RPC read call
async function ethCall(to, data) {
  const payload = await fetchWithRetry(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest']
    })
  });
  
  if (payload.error) {
    throw new Error(`RPC execution reverted: ${payload.error.message}`);
  }
  return payload.result;
}

// Fetch on-chain Aave Pool data
async function getAaveData() {
  const paddedAsset = ASSET_ADDRESS.replace('0x', '').toLowerCase().padStart(64, '0');
  const getReserveDataSelector = '0x35ea6a75' + paddedAsset;

  // Query Aave Protocol Data Provider
  console.log(`Querying Data Provider at ${DATA_PROVIDER_ADDRESS}...`);
  const providerResult = await ethCall(DATA_PROVIDER_ADDRESS, getReserveDataSelector);
  const providerHex = providerResult.replace('0x', '');
  
  // Parse chunks (each is 32-bytes / 64 hex characters)
  const providerChunks = [];
  for (let i = 0; i < providerHex.length; i += 64) {
    providerChunks.push(BigInt('0x' + providerHex.slice(i, i + 64)));
  }

  if (providerChunks.length < 12) {
    throw new Error(`Invalid Data Provider return size. Expected 12 chunks, got ${providerChunks.length}`);
  }

  const totalAToken = providerChunks[2];       // Chunk 3: Total supply (base units)
  const totalVariableDebt = providerChunks[4]; // Chunk 5: Total borrow (base units)
  const liquidityRate = providerChunks[5];     // Chunk 6: Supply rate in Ray (10^27)

  // Query Pool Configuration Map
  console.log(`Querying Pool configuration at ${POOL_ADDRESS}...`);
  const poolResult = await ethCall(POOL_ADDRESS, getReserveDataSelector);
  const poolHex = poolResult.replace('0x', '');
  const configHex = poolHex.slice(0, 64);
  const configVal = BigInt('0x' + configHex);

  // Extract decimals, borrow cap, and supply cap from bit fields
  const decimals = Number((configVal / (2n ** 48n)) % 256n);
  const borrowCap = Number((configVal / (2n ** 80n)) % (2n ** 36n));
  const supplyCap = Number((configVal / (2n ** 116n)) % (2n ** 36n));

  const divisor = Math.pow(10, decimals);
  
  const totalSupply = Number(totalAToken) / divisor;
  const totalBorrow = Number(totalVariableDebt) / divisor;
  
  // Caps are in whole token units
  const supplyCapBase = supplyCap * divisor;
  const borrowCapBase = borrowCap * divisor;

  // Compounded APY
  const liquidityRateDecimal = Number(liquidityRate) / 1e27;
  const netApy = (Math.pow(1 + liquidityRateDecimal / 31536000, 31536000) - 1) * 100;

  // Utilization Rate
  const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0.0;

  return {
    netApy,
    utilization,
    totalSupply,
    supplyCap: supplyCapBase,
    totalBorrow,
    borrowCap: borrowCapBase,
    decimals
  };
}

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'history-aave.json');

function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn("Failed to load history-aave.json:", err.message);
  }
  return [];
}

function saveHistory(history) {
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
    console.log("Updated history-aave.json saved.");
  } catch (err) {
    console.error("Failed to save history-aave.json:", err.message);
  }
}

function getDaysAgoEntry(history, daysAgo) {
  if (!history || history.length === 0) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastEntries = history.filter(e => e.date < todayStr).sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (pastEntries.length === 0) return null;

  const today = new Date(todayStr);

  for (let i = pastEntries.length - 1; i >= 0; i--) {
    const entryDate = new Date(pastEntries[i].date);
    const diffDays = Math.round((today - entryDate) / (1000 * 60 * 60 * 24));
    if (daysAgo === 1 && (diffDays === 1 || diffDays === 2)) {
      return pastEntries[i];
    }
    if (daysAgo === 7 && (diffDays >= 6 && diffDays <= 8)) {
      return pastEntries[i];
    }
  }

  if (daysAgo === 1 && pastEntries.length > 0) {
    return pastEntries[pastEntries.length - 1];
  }
  if (daysAgo === 7 && pastEntries.length >= 7) {
    return pastEntries[pastEntries.length - 7];
  }

  return null;
}

function formatComparison(currentVal, pastVal, unit = '%') {
  if (pastVal === undefined || pastVal === null || isNaN(pastVal)) return '';
  const diff = currentVal - pastVal;
  const absFormatted = Math.abs(diff).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + unit;
  
  if (diff > 0) {
    return ` (+${absFormatted}) 🟢`;
  } else if (diff < 0) {
    return ` (-${absFormatted}) 🔴`;
  } else {
    return ` (0.00${unit})`;
  }
}

// Send telegram alert
async function sendTelegramAlert(data) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Skipping telegram notification: Token or Chat ID not configured.");
    return;
  }

  let netApyStr = data.netApy.toFixed(2) + '%';
  let utilizationStr = data.utilization.toFixed(2) + '%';
  let supplyStr = formatMillions(data.totalSupply);
  let borrowStr = formatMillions(data.totalBorrow);

  if (SEND_ALWAYS) {
    const history = loadHistory();
    const curNetApy = data.netApy;
    const curUtil = data.utilization;
    const curSupply = data.totalSupply / 1e6;
    const curBorrow = data.totalBorrow / 1e6;

    const yest = getDaysAgoEntry(history, 1);

    const diffApy1 = yest ? formatComparison(curNetApy, yest.netApy, '%') : '';
    const diffUtil1 = yest ? formatComparison(curUtil, yest.utilization, '%') : '';
    const diffSupply1 = yest ? formatComparison(curSupply, yest.totalSupplyM, 'M') : '';
    const diffBorrow1 = yest ? formatComparison(curBorrow, yest.totalBorrowM, 'M') : '';

    netApyStr += `${diffApy1}`;
    utilizationStr += `${diffUtil1}`;
    supplyStr += `${diffSupply1}`;
    borrowStr += `${diffBorrow1}`;

    const todayStr = new Date().toISOString().slice(0, 10);
    const existingIndex = history.findIndex(h => h.date === todayStr);
    const todayRecord = {
      date: todayStr,
      netApy: Number(curNetApy.toFixed(2)),
      utilization: Number(curUtil.toFixed(2)),
      totalSupplyM: Number(curSupply.toFixed(2)),
      totalBorrowM: Number(curBorrow.toFixed(2))
    };

    if (existingIndex >= 0) {
      history[existingIndex] = todayRecord;
    } else {
      history.push(todayRecord);
    }
    saveHistory(history);
  }

  const prefix = SEND_ALWAYS ? "ℹ️ *[DAILY STATUS]* Aave Ethereum Pool Status" : "🚨 *[UTILIZATION ALERT]* Aave Ethereum Pool Alert";

  const message = `${prefix}\n` + 
                  `Asset: *USDT*\n\n` +
                  `• *Net APY:* ${netApyStr}\n` +
                  `• *Utilization:* ${utilizationStr}\n` +
                  `• *Total Supply:* ${supplyStr}\n` +
                  `• *Total Borrow:* ${borrowStr}`;

  console.log("Sending Telegram Message:\n", message);

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown'
    })
  });
  
  const resPayload = await response.json();
  if (!resPayload.ok) {
    throw new Error(`Telegram API Error: ${resPayload.description}`);
  }
  console.log("Telegram notification sent successfully!");
}

// Main execution block
async function run() {
  console.log("Starting Aave utilization check...");
  try {
    const data = await getAaveData();
    console.log(`Current Utilization: ${data.utilization.toFixed(2)}% (Threshold: ${UTILIZATION_THRESHOLD.toFixed(2)}%)`);
    console.log(`Net APY: ${data.netApy.toFixed(2)}%`);
    console.log(`Total Supply: ${formatMillions(data.totalSupply)} / ${formatCap(data.supplyCap)}`);
    console.log(`Total Borrow: ${formatMillions(data.totalBorrow)} / ${formatCap(data.borrowCap)}`);

    if (data.utilization >= UTILIZATION_THRESHOLD || SEND_ALWAYS) {
      console.log("Triggering Telegram notification...");
      await sendTelegramAlert(data);
    } else {
      console.log("Utilization within safe limits. No action needed.");
    }
  } catch (error) {
    console.error("Execution failed:", error);
    process.exit(1);
  }
}

run();
