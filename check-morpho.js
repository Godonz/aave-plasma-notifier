// check-morpho.js
// Node.js script to monitor Morpho Steakhouse Prime USDC vault allocations on Base
// Runs inside GitHub Actions (requires Node.js 18+)

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const UTILIZATION_THRESHOLD = parseFloat(process.env.MORPHO_UTILIZATION_THRESHOLD || '94.0');
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
        allocation {
          supplyAssets
          supplyCap
          market {
            lltv
            collateralAsset {
              symbol
            }
            loanAsset {
              symbol
              decimals
            }
            state {
              supplyAssets
              borrowAssets
              utilization
              supplyApy
            }
          }
        }
      }
    }
  }
  `;

  console.log(`Querying Morpho API for vault allocations: ${VAULT_ADDRESS} on chain ${CHAIN_ID}...`);
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
  const vaultApy = vault.state.apy * 100;

  const allocations = [];
  if (vault.state.allocation) {
    for (const alloc of vault.state.allocation) {
      const supplyAssets = Number(alloc.supplyAssets) / Math.pow(10, decimals);
      const supplyCap = Number(alloc.supplyCap) / Math.pow(10, decimals);
      
      // Skip allocations that have zero assets and no collateral (e.g. idle placeholder)
      if (supplyAssets === 0 && (!alloc.market || !alloc.market.collateralAsset)) {
        continue;
      }

      const collateralSymbol = alloc.market && alloc.market.collateralAsset 
        ? alloc.market.collateralAsset.symbol 
        : 'USDC (Idle)';
      
      const loanSymbol = alloc.market && alloc.market.loanAsset ? alloc.market.loanAsset.symbol : 'USDC';
      const marketDecimals = alloc.market && alloc.market.loanAsset ? alloc.market.loanAsset.decimals : decimals;

      let marketSupply = 0;
      let marketBorrow = 0;
      let marketUtilization = 0;
      let marketSupplyApy = 0;

      if (alloc.market && alloc.market.state) {
        const div = Math.pow(10, marketDecimals);
        marketSupply = Number(alloc.market.state.supplyAssets) / div;
        marketBorrow = Number(alloc.market.state.borrowAssets) / div;
        marketUtilization = (alloc.market.state.utilization || 0) * 100;
        marketSupplyApy = (alloc.market.state.supplyApy || 0) * 100;
      }

      allocations.push({
        collateralSymbol,
        loanSymbol,
        supplyAssets,
        supplyCap,
        marketSupply,
        marketBorrow,
        marketUtilization,
        marketSupplyApy
      });
    }
  }

  return {
    name: vault.name,
    symbol: vault.symbol,
    totalAssets,
    vaultApy,
    allocations
  };
}

async function sendTelegramAlert(data, primaryAlloc, isBreached) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Skipping telegram notification: Token or Chat ID not configured.");
    return;
  }

  const prefix = isBreached 
    ? "🚨 *[UTILIZATION ALERT]* Morpho Base Vault Alert" 
    : "ℹ️ *[DAILY STATUS]* Morpho Base Vault Status";

  let message = `${prefix}\n` + 
                `Vault: *${data.name} (${data.symbol})*\n` +
                `Total Vault Assets: *${formatMillions(data.totalAssets)}*\n` +
                `Vault Net APY: *${data.vaultApy.toFixed(2)}%*\n\n`;

  if (primaryAlloc) {
    message += `📍 *Largest Allocation Market (${primaryAlloc.collateralSymbol} / ${primaryAlloc.loanSymbol}):*\n` +
               `• *Net APY:* ${primaryAlloc.marketSupplyApy.toFixed(2)}%\n` +
               `• *Utilization:* ${primaryAlloc.marketUtilization.toFixed(2)}%${isBreached ? ' (🔥 BREACHED)' : ''}\n` +
               `• *Total Supply:* ${formatMillions(primaryAlloc.marketSupply)}\n` +
               `• *Total Borrow:* ${formatMillions(primaryAlloc.marketBorrow)}\n` +
               `• *Vault Allocation:* ${formatMillions(primaryAlloc.supplyAssets)}`;
  } else {
    message += `⚠️ No active allocation markets found.`;
  }

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
    console.log(`Total Assets: ${formatMillions(data.totalAssets)}`);
    console.log(`Vault APY: ${data.vaultApy.toFixed(2)}%`);
    console.log("Allocations found:", data.allocations.length);

    // Find the allocation with the largest supply assets (excluding idle USDC)
    let primaryAlloc = null;
    for (const alloc of data.allocations) {
      if (alloc.collateralSymbol === 'USDC (Idle)') continue;
      if (!primaryAlloc || alloc.supplyAssets > primaryAlloc.supplyAssets) {
        primaryAlloc = alloc;
      }
    }

    if (primaryAlloc) {
      console.log(`Largest Allocated Market: ${primaryAlloc.collateralSymbol}/${primaryAlloc.loanSymbol}`);
      console.log(`- Utilization: ${primaryAlloc.marketUtilization.toFixed(2)}% (Threshold: ${UTILIZATION_THRESHOLD.toFixed(2)}%)`);
      console.log(`- Vault Allocation: ${formatMillions(primaryAlloc.supplyAssets)}`);

      const isBreached = primaryAlloc.marketUtilization >= UTILIZATION_THRESHOLD;
      if (isBreached) {
        console.log("Utilization threshold breached in the primary market!");
        await sendTelegramAlert(data, primaryAlloc, true);
      } else if (SEND_ALWAYS) {
        console.log("Sending forced daily status update...");
        await sendTelegramAlert(data, primaryAlloc, false);
      } else {
        console.log("Primary market utilization is within safe limits. No action needed.");
      }
    } else {
      console.log("No active allocated markets found to monitor.");
      if (SEND_ALWAYS) {
        await sendTelegramAlert(data, null, false);
      }
    }
  } catch (error) {
    console.error("Execution failed:", error);
    process.exit(1);
  }
}

run();
