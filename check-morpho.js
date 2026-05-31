// check-morpho.js
// Node.js script to monitor Morpho Steakhouse Prime USDC vault on Base
// Runs inside GitHub Actions (requires Node.js 18+)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const APY_THRESHOLD = parseFloat(process.env.MORPHO_APY_THRESHOLD || '4.0');
const SEND_ALWAYS = process.env.SEND_ALWAYS === 'true';

const VAULT_ADDRESS = (process.env.MORPHO_VAULT_ADDRESS || '0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2').toLowerCase();
const CHAIN_ID = parseInt(process.env.MORPHO_CHAIN_ID || '8453');

function formatMillions(value) {
  return (value / 1000000.0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M';
}

async function getVaultData() {
  const query = `
  {
    vaultByAddress(address: "${VAULT_ADDRESS}", chainId: ${CHAIN_ID}) {
      address
      name
      symbol
      asset {
        decimals
      }
      state {
        totalAssets
        apy
      }
    }
  }
  `;

  console.log(`Querying Morpho API for vault: ${VAULT_ADDRESS} on chain ${CHAIN_ID}...`);
  const response = await fetch("https://api.morpho.org/graphql", {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(`GraphQL Error: ${payload.errors[0].message}`);
  }

  const vault = payload.data.vaultByAddress;
  if (!vault) {
    throw new Error(`Vault not found for address ${VAULT_ADDRESS}`);
  }

  const decimals = vault.asset.decimals;
  const totalAssets = Number(vault.state.totalAssets) / Math.pow(10, decimals);
  const netApy = vault.state.apy * 100; // Convert to percentage

  return {
    name: vault.name,
    symbol: vault.symbol,
    totalAssets,
    netApy
  };
}

async function sendTelegramAlert(data) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Skipping telegram notification: Token or Chat ID not configured.");
    return;
  }

  const netApyStr = data.netApy.toFixed(2) + '%';
  const supplyStr = formatMillions(data.totalAssets);

  const prefix = SEND_ALWAYS ? "ℹ️ *[DAILY STATUS]* Morpho Base Vault Status" : "🚨 *[APY ALERT]* Morpho Base Vault Alert";

  const message = `${prefix}\n` + 
                  `Vault: *${data.name}*\n\n` +
                  `• *Net APY:* ${netApyStr}\n` +
                  `• *Total Supplied:* ${supplyStr}`;

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

async function run() {
  console.log("Starting Morpho Vault check...");
  try {
    const data = await getVaultData();
    console.log(`Vault: ${data.name} (${data.symbol})`);
    console.log(`Net APY: ${data.netApy.toFixed(2)}% (Threshold: ${APY_THRESHOLD.toFixed(2)}%)`);
    console.log(`Total Supplied: ${formatMillions(data.totalAssets)}`);

    // Alert if APY falls BELOW the threshold, or if forced (daily report)
    if (data.netApy < APY_THRESHOLD) {
      console.log(`APY threshold breached! Net APY is below ${APY_THRESHOLD.toFixed(2)}%`);
      await sendTelegramAlert(data);
    } else if (SEND_ALWAYS) {
      console.log("Sending forced daily status update...");
      await sendTelegramAlert(data);
    } else {
      console.log("APY is within safe limits. No action needed.");
    }
  } catch (error) {
    console.error("Execution failed:", error);
    process.exit(1);
  }
}

run();
