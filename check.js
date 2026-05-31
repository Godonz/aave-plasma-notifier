// check.js
// Node.js script to monitor Aave V3.5 USDT0 pool on Plasma network
// Runs inside GitHub Actions (requires Node.js 18+)

// 1. Load Configurations from Environment Variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const UTILIZATION_THRESHOLD = parseFloat(process.env.UTILIZATION_THRESHOLD || '94.0');
const RPC_URL = process.env.RPC_URL || 'https://rpc.plasma.to';
const SEND_ALWAYS = process.env.SEND_ALWAYS === 'true';

const ASSET_ADDRESS = process.env.ASSET_ADDRESS || '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb';
const POOL_ADDRESS = process.env.POOL_ADDRESS || '0x925a2A7214Ed92428B5b1B090F80b25700095e12';
const DATA_PROVIDER_ADDRESS = process.env.DATA_PROVIDER_ADDRESS || '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F';

// Helper to format currency values to Millions
function formatMillions(value) {
  return (value / 1000000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M';
}

function formatCap(value) {
  if (value === 0 || value >= 1e12) return 'No Cap';
  return formatMillions(value);
}

// Perform direct JSON-RPC read call
async function ethCall(to, data) {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest']
    })
  });
  
  const payload = await response.json();
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

// Send telegram alert
async function sendTelegramAlert(data) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Skipping telegram notification: Token or Chat ID not configured.");
    return;
  }

  const netApyStr = data.netApy.toFixed(2) + '%';
  const utilizationStr = data.utilization.toFixed(2) + '%';
  const supplyStr = formatMillions(data.totalSupply);
  const borrowStr = formatMillions(data.totalBorrow);

  const prefix = SEND_ALWAYS ? "ℹ️ *[DAILY STATUS]* Aave Plasma Pool Status" : "🚨 *[UTILIZATION ALERT]* Aave Plasma Pool Alert";

  const message = `${prefix}\n` + 
                  `Asset: *USDT0*\n\n` +
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
