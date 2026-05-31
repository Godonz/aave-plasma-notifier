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

async function sendTelegramAlert(data, breachedMarkets) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("Skipping telegram notification: Token or Chat ID not configured.");
    return;
  }

  const prefix = SEND_ALWAYS 
    ? "ℹ️ *[DAILY STATUS]* Morpho Base Vault Status" 
    : "🚨 *[UTILIZATION ALERT]* Morpho Base Vault Alert";

  let message = `${prefix}\n` + 
                `Vault: *${data.name} (${data.symbol})*\n` +
                `Total Vault Assets: *${formatMillions(data.totalAssets)}*\n` +
                `Vault Net APY: *${data.vaultApy.toFixed(2)}%*\n\n`;

  if (breachedMarkets.length > 0) {
    message += `⚠️ *Markets Exceeding Threshold (${UTILIZATION_THRESHOLD.toFixed(1)}%):*\n`;
    for (const m of breachedMarkets) {
      message += `• *${m.collateralSymbol} / ${m.loanSymbol} Market:*\n` +
                 `  - *Net APY:* ${m.marketSupplyApy.toFixed(2)}%\n` +
                 `  - *Utilization:* ${m.marketUtilization.toFixed(2)}% (🔥 BREACHED)\n` +
                 `  - *Total Supply:* ${formatMillions(m.marketSupply)}\n` +
                 `  - *Total Borrow:* ${formatMillions(m.marketBorrow)}\n` +
                 `  - *Vault Allocation:* ${formatMillions(m.supplyAssets)}\n\n`;
    }
    message += `*All Vault Allocations:*\n`;
  } else {
    message += `*Vault Allocations Details:*\n`;
  }

  for (const m of data.allocations) {
    message += `• *${m.collateralSymbol} / ${m.loanSymbol}* (Vault Alloc: ${formatMillions(m.supplyAssets)}):\n` +
               `  - *Net APY:* ${m.marketSupplyApy.toFixed(2)}%\n` +
               `  - *Utilization:* ${m.marketUtilization.toFixed(2)}%\n` +
               `  - *Total Supply:* ${formatMillions(m.marketSupply)}\n` +
               `  - *Total Borrow:* ${formatMillions(m.marketBorrow)}\n`;
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

    const breachedMarkets = [];
    for (const alloc of data.allocations) {
      console.log(`- Market: ${alloc.collateralSymbol}/${alloc.loanSymbol} | Utilization: ${alloc.marketUtilization.toFixed(2)}% | Vault Allocation: ${formatMillions(alloc.supplyAssets)}`);
      
      // We only alert on actual markets with non-zero allocation and utilization exceeding the threshold
      if (alloc.collateralSymbol !== 'USDC (Idle)' && alloc.marketUtilization >= UTILIZATION_THRESHOLD) {
        breachedMarkets.push(alloc);
      }
    }

    if (breachedMarkets.length > 0) {
      console.log(`Utilization threshold breached in ${breachedMarkets.length} market(s)!`);
      await sendTelegramAlert(data, breachedMarkets);
    } else if (SEND_ALWAYS) {
      console.log("Sending forced daily status update...");
      await sendTelegramAlert(data, []);
    } else {
      console.log("All market utilizations are within safe limits. No action needed.");
    }
  } catch (error) {
    console.error("Execution failed:", error);
    process.exit(1);
  }
}

run();
