document.addEventListener('DOMContentLoaded', () => {
  const configForm = document.getElementById('config-form');
  const advancedBtn = document.getElementById('advanced-btn');
  const advancedPanel = document.getElementById('advanced-panel');
  const advancedArrow = document.getElementById('advanced-arrow');
  const testAlertBtn = document.getElementById('test-alert-btn');
  const testMorphoBtn = document.getElementById('test-morpho-btn');
  
  const tokenInput = document.getElementById('telegramBotToken');
  const toggleTokenBtn = document.getElementById('toggle-token-btn');

  // Default values
  const DEFAULTS = {
    telegramBotToken: '',
    telegramChatId: '',
    utilizationThreshold: 94.0,
    checkIntervalMinutes: 40,
    rpcUrl: 'https://rpc.plasma.to',
    assetAddress: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb',
    poolAddress: '0x925a2A7214Ed92428B5b1B090F80b25700095e12',
    dataProviderAddress: '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F',
    
    // Morpho Defaults
    morphoApyThreshold: 4.0,
    morphoVaultAddress: '0xBEEFE94c8aD530842bfE7d8B397938fFc1cb83b2',
    morphoChainId: 8453
  };

  // State
  let settings = { ...DEFAULTS };
  let lastUpdateTime = null;

  // Protocol detection warning banner
  if (window.location.protocol === 'file:') {
    showToast('⚠️ Note: You are viewing this file locally. Settings will save in your local browser.', 'success');
  }

  // Toggle advanced section
  advancedBtn.addEventListener('click', () => {
    const isShowing = advancedPanel.classList.toggle('show');
    advancedArrow.style.transform = isShowing ? 'rotate(90deg)' : 'rotate(0deg)';
  });

  // Toggle token password visibility
  toggleTokenBtn.addEventListener('click', () => {
    const type = tokenInput.getAttribute('type') === 'password' ? 'text' : 'password';
    tokenInput.setAttribute('type', type);
    toggleTokenBtn.innerHTML = type === 'text' 
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  });

  // Toast notification
  function showToast(message, type = 'success') {
    const toast = document.getElementById('toast-banner');
    const toastMsg = document.getElementById('toast-message');
    const toastIcon = document.getElementById('toast-icon');
    
    toast.className = `toast show ${type}`;
    toastMsg.textContent = message;
    
    if (type === 'success') {
      toastIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else {
      toastIcon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    }
    
    setTimeout(() => {
      toast.classList.remove('show');
    }, 4000);
  }

  // Load configuration from Browser localStorage
  function loadConfig() {
    try {
      const stored = localStorage.getItem('aave_notifier_settings');
      if (stored) {
        settings = { ...DEFAULTS, ...JSON.parse(stored) };
      }
      
      // Populate inputs
      document.getElementById('telegramBotToken').value = settings.telegramBotToken;
      document.getElementById('telegramChatId').value = settings.telegramChatId;
      document.getElementById('utilizationThreshold').value = settings.utilizationThreshold;
      document.getElementById('checkIntervalMinutes').value = settings.checkIntervalMinutes;
      
      document.getElementById('rpcUrl').value = settings.rpcUrl;
      document.getElementById('assetAddress').value = settings.assetAddress;
      document.getElementById('poolAddress').value = settings.poolAddress;
      document.getElementById('dataProviderAddress').value = settings.dataProviderAddress;

      // Morpho settings loading
      document.getElementById('morphoApyThreshold').value = settings.morphoApyThreshold;
      document.getElementById('morphoVaultAddress').value = settings.morphoVaultAddress;
      document.getElementById('morphoChainId').value = settings.morphoChainId;
      
      console.log("Settings loaded from localStorage successfully.");
    } catch (err) {
      showToast('Error reading settings: ' + err.message, 'error');
    }
  }

  // Save config to Browser localStorage
  configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(configForm);
    const updated = {};
    
    formData.forEach((val, key) => {
      if (key === 'utilizationThreshold' || key === 'checkIntervalMinutes' || key === 'morphoApyThreshold' || key === 'morphoChainId') {
        updated[key] = parseFloat(val);
      } else {
        updated[key] = val;
      }
    });

    try {
      settings = { ...DEFAULTS, ...updated };
      localStorage.setItem('aave_notifier_settings', JSON.stringify(settings));
      showToast('Settings saved in browser cache!');
      
      // Refresh dashboard metrics immediately using the new parameters
      refreshAllMetrics();
    } catch (err) {
      showToast('Failed to save settings: ' + err.message, 'error');
    }
  });

  // Client-side JSON-RPC call wrapper
  async function ethCall(rpcUrl, to, data) {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest']
      })
    });
    
    const payload = await res.json();
    if (payload.error) {
      throw new Error(`RPC Reverted: ${payload.error.message}`);
    }
    return payload.result;
  }

  // Query Aave V3.5 data directly from the client browser
  async function fetchAaveData() {
    const paddedAsset = settings.assetAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    const getReserveDataSelector = '0x35ea6a75' + paddedAsset;

    // 1. Fetch from Data Provider
    const providerResult = await ethCall(settings.rpcUrl, settings.dataProviderAddress, getReserveDataSelector);
    const providerHex = providerResult.replace('0x', '');
    const providerChunks = [];
    for (let i = 0; i < providerHex.length; i += 64) {
      providerChunks.push(BigInt('0x' + providerHex.slice(i, i + 64)));
    }

    if (providerChunks.length < 12) {
      throw new Error(`Unexpected Data Provider size`);
    }

    const totalAToken = providerChunks[2];
    const totalVariableDebt = providerChunks[4];
    const liquidityRate = providerChunks[5];

    // 2. Fetch from Pool Configuration Map
    const poolResult = await ethCall(settings.rpcUrl, settings.poolAddress, getReserveDataSelector);
    const poolHex = poolResult.replace('0x', '');
    const configHex = poolHex.slice(0, 64);
    const configVal = BigInt('0x' + configHex);

    // Extract configuration values
    const decimals = Number((configVal / (2n ** 48n)) % 256n);
    const borrowCap = Number((configVal / (2n ** 80n)) % (2n ** 36n));
    const supplyCap = Number((configVal / (2n ** 116n)) % (2n ** 36n));

    const divisor = Math.pow(10, decimals);
    const totalSupply = Number(totalAToken) / divisor;
    const totalBorrow = Number(totalVariableDebt) / divisor;

    const supplyCapBase = supplyCap * divisor;
    const borrowCapBase = borrowCap * divisor;

    // Supply APY compounded
    const liquidityRateDecimal = Number(liquidityRate) / 1e27;
    const netApy = (Math.pow(1 + liquidityRateDecimal / 31536000, 31536000) - 1) * 100;

    // Utilization
    const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0.0;

    return {
      netApy,
      utilization,
      totalSupply,
      supplyCap: supplyCapBase,
      totalBorrow,
      borrowCap: borrowCapBase
    };
  }

  // Query Morpho Vault V2 from Morpho GraphQL API
  async function fetchMorphoData() {
    const query = `
    {
      vaultByAddress(address: "${settings.morphoVaultAddress.toLowerCase()}", chainId: ${parseInt(settings.morphoChainId)}) {
        address
        name
        symbol
        asset {
          decimals
        }
        state {
          totalAssets
          apy
          fee
        }
      }
    }
    `;

    const res = await fetch("https://api.morpho.org/graphql", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const payload = await res.json();
    if (payload.errors) {
      throw new Error(payload.errors[0].message);
    }

    const vault = payload.data.vaultByAddress;
    if (!vault) {
      throw new Error(`Vault not found`);
    }

    const decimals = vault.asset.decimals;
    const totalAssets = Number(vault.state.totalAssets) / Math.pow(10, decimals);
    const netApy = vault.state.apy * 100;
    const fee = vault.state.fee * 100;

    return {
      name: vault.name,
      symbol: vault.symbol,
      totalAssets,
      netApy,
      fee
    };
  }

  // Format helper to Millions
  function formatM(val) {
    if (val === undefined || val === null || isNaN(val)) return '--M';
    const num = val / 1000000.0;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + 'M';
  }

  function formatCap(val) {
    if (val === undefined || val === null || isNaN(val)) return '--M';
    if (val === 0 || val >= 1e12) return 'No Cap';
    return formatM(val);
  }

  // Update Aave and Morpho UI metrics in parallel
  async function refreshAllMetrics() {
    const lblStatus = document.getElementById('lbl-status');
    const statusIndicator = document.getElementById('status-indicator');

    lblStatus.textContent = 'Updating...';
    lblStatus.style.color = 'var(--text-secondary)';

    let aaveError = null;
    let morphoError = null;

    // 1. Fetch & Render Aave
    try {
      const data = await fetchAaveData();
      document.getElementById('val-net-apy').textContent = data.netApy.toFixed(2) + '%';
      document.getElementById('val-utilization').textContent = data.utilization.toFixed(2) + '%';

      const fill = document.getElementById('util-bar');
      fill.style.width = Math.min(100, data.utilization) + '%';
      fill.className = data.utilization >= settings.utilizationThreshold ? 'progress-bar-fill warning' : 'progress-bar-fill';

      document.getElementById('val-total-supply').textContent = `${formatM(data.totalSupply)} of ${formatCap(data.supplyCap)}`;
      document.getElementById('val-total-borrow').textContent = `${formatM(data.totalBorrow)} of ${formatCap(data.borrowCap)}`;
    } catch (err) {
      console.error("Aave error:", err);
      aaveError = err.message;
    }

    // 2. Fetch & Render Morpho
    try {
      const data = await fetchMorphoData();
      document.getElementById('morpho-net-apy').textContent = data.netApy.toFixed(2) + '%';
      document.getElementById('morpho-total-assets').textContent = formatM(data.totalAssets);
      document.getElementById('morpho-fee').textContent = data.fee.toFixed(1) + '%';
    } catch (err) {
      console.error("Morpho error:", err);
      morphoError = err.message;
    }

    // 3. Update Status indicators
    if (!aaveError && !morphoError) {
      lblStatus.textContent = 'Active (Connected to both chains)';
      lblStatus.style.color = 'var(--accent-green)';
      statusIndicator.className = 'status-dot';
    } else {
      let errStr = [];
      if (aaveError) errStr.push(`Aave: ${aaveError}`);
      if (morphoError) errStr.push(`Morpho: ${morphoError}`);
      
      lblStatus.textContent = 'Error - ' + errStr.join(' | ');
      lblStatus.style.color = 'var(--accent-red)';
      statusIndicator.className = 'status-dot error';
    }

    lastUpdateTime = new Date();
    document.getElementById('lbl-last-check').textContent = lastUpdateTime.toLocaleTimeString();
  }

  // Telegram test dispatcher helper
  async function dispatchTelegramTest(token, chatId, message) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });
    
    const payload = await res.json();
    if (!payload.ok) {
      throw new Error(payload.description);
    }
  }

  // Aave Test Trigger
  testAlertBtn.addEventListener('click', async () => {
    const token = document.getElementById('telegramBotToken').value;
    const chatId = document.getElementById('telegramChatId').value;
    
    if (!token || !chatId) {
      showToast('Please fill out the Telegram Bot Token and Chat ID to run a test.', 'error');
      return;
    }

    testAlertBtn.disabled = true;
    const originalText = testAlertBtn.innerHTML;
    testAlertBtn.innerHTML = 'Sending...';

    try {
      const data = await fetchAaveData();
      const message = `🔔 *[TEST MESSAGE]* Aave Plasma Pool Alert\n` + 
                      `Asset: *USDT0*\n\n` +
                      `• *Net APY:* ${data.netApy.toFixed(2)}%\n` +
                      `• *Utilization:* ${data.utilization.toFixed(2)}%\n` +
                      `• *Total Supply:* ${formatM(data.totalSupply)} of ${formatCap(data.supplyCap)}\n` +
                      `• *Total Borrow:* ${formatM(data.totalBorrow)} of ${formatCap(data.borrowCap)}`;

      await dispatchTelegramTest(token, chatId, message);
      showToast('Test alert sent to Telegram successfully!');
      document.getElementById('lbl-last-alert').textContent = new Date().toLocaleTimeString();
    } catch (err) {
      showToast('Test alert failed: ' + err.message, 'error');
    } finally {
      testAlertBtn.disabled = false;
      testAlertBtn.innerHTML = originalText;
    }
  });

  // Morpho Test Trigger
  testMorphoBtn.addEventListener('click', async () => {
    const token = document.getElementById('telegramBotToken').value;
    const chatId = document.getElementById('telegramChatId').value;
    
    if (!token || !chatId) {
      showToast('Please fill out the Telegram Bot Token and Chat ID to run a test.', 'error');
      return;
    }

    testMorphoBtn.disabled = true;
    const originalText = testMorphoBtn.innerHTML;
    testMorphoBtn.innerHTML = 'Sending...';

    try {
      const data = await fetchMorphoData();
      const message = `🔔 *[TEST MESSAGE]* Morpho Base Vault Status\n` + 
                      `Vault: *${data.name}*\n\n` +
                      `• *Net APY:* ${data.netApy.toFixed(2)}%\n` +
                      `• *Total Supplied:* ${formatM(data.totalAssets)}`;

      await dispatchTelegramTest(token, chatId, message);
      showToast('Test alert sent to Telegram successfully!');
      document.getElementById('lbl-last-alert').textContent = new Date().toLocaleTimeString();
    } catch (err) {
      showToast('Test alert failed: ' + err.message, 'error');
    } finally {
      testMorphoBtn.disabled = false;
      testMorphoBtn.innerHTML = originalText;
    }
  });

  // Initial load
  loadConfig();
  refreshAllMetrics();

  // Refresh every 10 seconds
  setInterval(refreshAllMetrics, 10000);
});
