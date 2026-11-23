document.addEventListener('DOMContentLoaded', () => {
  const configForm = document.getElementById('config-form');
  const advancedBtn = document.getElementById('advanced-btn');
  const advancedPanel = document.getElementById('advanced-panel');
  const advancedArrow = document.getElementById('advanced-arrow');
  const testPlasmaBtn = document.getElementById('test-plasma-btn');
  const testAlertBtn = document.getElementById('test-alert-btn');
  const testMorphoBtn = document.getElementById('test-morpho-btn');
  
  const tokenInput = document.getElementById('telegramBotToken');
  const toggleTokenBtn = document.getElementById('toggle-token-btn');
  const githubTokenInput = document.getElementById('githubToken');
  const toggleGithubTokenBtn = document.getElementById('toggle-github-token-btn');

  // Default values
  const DEFAULTS = {
    telegramBotToken: '',
    telegramChatId: '',
    githubToken: '',
    utilizationThreshold: 94.0,
    checkIntervalMinutes: 40,

    // Plasma Defaults
    plasmaRpcUrl: 'https://rpc.plasma.to',
    plasmaAssetAddress: '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb',
    plasmaPoolAddress: '0x925a2A7214Ed92428B5b1B090F80b25700095e12',
    plasmaDataProviderAddress: '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F',

    // Ethereum Defaults
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    assetAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    poolAddress: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    dataProviderAddress: '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD',
    
    // Morpho Defaults
    morphoUtilizationThreshold: 94.0,
    morphoVaultAddress: '0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61',
    morphoChainId: 8453
  };

  // State
  let settings = { ...DEFAULTS };
  let lastUpdateTime = null;
  let isMorphoAllocExpanded = false;
  let latestMorphoAllocations = null;

  const POOL_CHART_CONFIG = {
    plasma: {
      cardId: 'chart-card-plasma',
      historyFile: 'history-plasma.json',
      valueField: 'totalSupplyM',
      title: 'Total Supply',
      color: '#c084fc',
      dotClass: 'purple',
      gradId: 'chart-grad-plasma'
    },
    ethereum: {
      cardId: 'chart-card-ethereum',
      historyFile: 'history-aave.json',
      valueField: 'totalSupplyM',
      title: 'Total Supply',
      color: '#38bdf8',
      dotClass: 'blue',
      gradId: 'chart-grad-ethereum'
    },
    morpho: {
      cardId: 'chart-card-morpho',
      historyFile: 'history-morpho.json',
      valueField: 'totalAssetsM',
      title: 'Total Assets (AUM)',
      color: '#34d399',
      dotClass: 'green',
      gradId: 'chart-grad-morpho'
    }
  };

  const TIMEFRAME_DAYS = {
    '1w': 7,
    '1m': 30,
    '6m': 180,
    '1y': 365
  };

  const chartStates = {
    plasma: { timeframe: '1m', history: [], liveM: null, lastRenderKey: '' },
    ethereum: { timeframe: '1m', history: [], liveM: null, lastRenderKey: '' },
    morpho: { timeframe: '1m', history: [], liveM: null, lastRenderKey: '' }
  };

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
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
  });

  if (toggleGithubTokenBtn && githubTokenInput) {
    toggleGithubTokenBtn.addEventListener('click', () => {
      const type = githubTokenInput.getAttribute('type') === 'password' ? 'text' : 'password';
      githubTokenInput.setAttribute('type', type);
      toggleGithubTokenBtn.innerHTML = type === 'text'
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });
  }

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

  // Load configuration from Browser localStorage & GitHub config.json
  async function loadConfig() {
    try {
      const stored = localStorage.getItem('aave_notifier_settings');
      if (stored) {
        settings = { ...DEFAULTS, ...JSON.parse(stored) };
      }

      // Try fetching latest cloud config from repo if online
      try {
        const repoConfigRes = await fetch('https://raw.githubusercontent.com/Godonz/aave-plasma-notifier/main/config.json?cacheBust=' + Date.now());
        if (repoConfigRes.ok) {
          const repoConfig = await repoConfigRes.json();
          if (repoConfig.utilizationThreshold !== undefined) {
            settings.utilizationThreshold = parseFloat(repoConfig.utilizationThreshold);
          }
          if (repoConfig.morphoUtilizationThreshold !== undefined) {
            settings.morphoUtilizationThreshold = parseFloat(repoConfig.morphoUtilizationThreshold);
          }
          if (repoConfig.checkIntervalMinutes !== undefined) {
            settings.checkIntervalMinutes = parseFloat(repoConfig.checkIntervalMinutes);
          }
          
          if (repoConfig.plasmaRpcUrl) settings.plasmaRpcUrl = repoConfig.plasmaRpcUrl;
          if (repoConfig.plasmaAssetAddress) settings.plasmaAssetAddress = repoConfig.plasmaAssetAddress;
          if (repoConfig.plasmaPoolAddress) settings.plasmaPoolAddress = repoConfig.plasmaPoolAddress;
          if (repoConfig.plasmaDataProviderAddress) settings.plasmaDataProviderAddress = repoConfig.plasmaDataProviderAddress;

          if (repoConfig.rpcUrl) settings.rpcUrl = repoConfig.rpcUrl;
          if (repoConfig.assetAddress) settings.assetAddress = repoConfig.assetAddress;
          if (repoConfig.poolAddress) settings.poolAddress = repoConfig.poolAddress;
          if (repoConfig.dataProviderAddress) settings.dataProviderAddress = repoConfig.dataProviderAddress;
          if (repoConfig.morphoVaultAddress) settings.morphoVaultAddress = repoConfig.morphoVaultAddress;
          if (repoConfig.morphoChainId) settings.morphoChainId = repoConfig.morphoChainId;
        }
      } catch (fetchErr) {
        console.log("Using local settings, remote config fetch skipped:", fetchErr.message);
      }
      
      // Populate inputs
      document.getElementById('telegramBotToken').value = settings.telegramBotToken || '';
      document.getElementById('telegramChatId').value = settings.telegramChatId || '';
      if (document.getElementById('githubToken')) {
        document.getElementById('githubToken').value = settings.githubToken || '';
      }
      document.getElementById('utilizationThreshold').value = settings.utilizationThreshold;
      document.getElementById('checkIntervalMinutes').value = settings.checkIntervalMinutes;
      settings.morphoUtilizationThreshold = settings.utilizationThreshold;

      // Plasma inputs
      if (document.getElementById('plasmaRpcUrl')) document.getElementById('plasmaRpcUrl').value = settings.plasmaRpcUrl;
      if (document.getElementById('plasmaAssetAddress')) document.getElementById('plasmaAssetAddress').value = settings.plasmaAssetAddress;
      if (document.getElementById('plasmaPoolAddress')) document.getElementById('plasmaPoolAddress').value = settings.plasmaPoolAddress;
      if (document.getElementById('plasmaDataProviderAddress')) document.getElementById('plasmaDataProviderAddress').value = settings.plasmaDataProviderAddress;

      // Ethereum inputs
      document.getElementById('rpcUrl').value = settings.rpcUrl;
      document.getElementById('assetAddress').value = settings.assetAddress;
      document.getElementById('poolAddress').value = settings.poolAddress;
      document.getElementById('dataProviderAddress').value = settings.dataProviderAddress;

      // Morpho settings loading
      document.getElementById('morphoVaultAddress').value = settings.morphoVaultAddress;
      document.getElementById('morphoChainId').value = settings.morphoChainId;
      
      console.log("Settings loaded successfully.");
    } catch (err) {
      showToast('Error reading settings: ' + err.message, 'error');
    }
  }

  // GitHub API Sync Helper: updates config.json in repository
  async function syncConfigToGitHub(token, newSettings) {
    const owner = 'Godonz';
    const repo = 'aave-plasma-notifier';
    const path = 'config.json';
    
    // 1. Get current config.json SHA and contents
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
      }
    });

    let sha = null;
    let existingContent = {};
    if (getRes.ok) {
      const data = await getRes.json();
      sha = data.sha;
      try {
        existingContent = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\s/g, '')))));
      } catch (e) {}
    }

    const thresholdVal = parseFloat(newSettings.utilizationThreshold);
    const mergedConfig = {
      ...existingContent,
      utilizationThreshold: thresholdVal,
      morphoUtilizationThreshold: thresholdVal,
      checkIntervalMinutes: parseFloat(newSettings.checkIntervalMinutes),
      plasmaRpcUrl: newSettings.plasmaRpcUrl || existingContent.plasmaRpcUrl || 'https://rpc.plasma.to',
      plasmaAssetAddress: newSettings.plasmaAssetAddress || existingContent.plasmaAssetAddress || '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb',
      plasmaPoolAddress: newSettings.plasmaPoolAddress || existingContent.plasmaPoolAddress || '0x925a2A7214Ed92428B5b1B090F80b25700095e12',
      plasmaDataProviderAddress: newSettings.plasmaDataProviderAddress || existingContent.plasmaDataProviderAddress || '0xf2D6E38B407e31E7E7e4a16E6769728b76c7419F',
      rpcUrl: newSettings.rpcUrl || existingContent.rpcUrl || 'https://ethereum-rpc.publicnode.com',
      assetAddress: newSettings.assetAddress || existingContent.assetAddress || '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      poolAddress: newSettings.poolAddress || existingContent.poolAddress || '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      dataProviderAddress: newSettings.dataProviderAddress || existingContent.dataProviderAddress || '0x0a16f2FCC0D44FaE41cc54e079281D84A363bECD',
      morphoVaultAddress: newSettings.morphoVaultAddress || existingContent.morphoVaultAddress || '0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61',
      morphoChainId: parseInt(newSettings.morphoChainId) || existingContent.morphoChainId || 8453
    };

    const contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(mergedConfig, null, 2))));
    const commitMsg = `Update bot config (Pool Limit: ${mergedConfig.utilizationThreshold}%, Interval: ${mergedConfig.checkIntervalMinutes}m)`;

    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: commitMsg,
        content: contentBase64,
        ...(sha ? { sha } : {})
      })
    });

    if (!putRes.ok) {
      const err = await putRes.json();
      throw new Error(err.message || 'GitHub API returned error');
    }
  }

  // Save config to Browser localStorage & optionally sync with GitHub
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(configForm);
    const updated = {};
    
    formData.forEach((val, key) => {
      if (key === 'utilizationThreshold' || key === 'checkIntervalMinutes' || key === 'morphoChainId') {
        updated[key] = parseFloat(val);
      } else {
        updated[key] = typeof val === 'string' ? val.trim() : val;
      }
    });

    // Mirror utilizationThreshold to morphoUtilizationThreshold
    updated.morphoUtilizationThreshold = updated.utilizationThreshold;

    try {
      settings = { ...DEFAULTS, ...updated };
      localStorage.setItem('aave_notifier_settings', JSON.stringify(settings));

      const submitBtn = configForm.querySelector('button[type="submit"]');
      const origBtnText = submitBtn.textContent;

      if (settings.githubToken) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Syncing to GitHub...';
        showToast('Saving and syncing to GitHub Cloud...', 'success');

        try {
          await syncConfigToGitHub(settings.githubToken, settings);
          showToast('✅ บันทึกและซิงค์การตั้งค่าไปยัง GitHub เรียบร้อยแล้ว!');
        } catch (syncErr) {
          console.error("Sync error:", syncErr);
          showToast('⚠️ Saved locally, but GitHub sync failed: ' + syncErr.message, 'error');
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = origBtnText;
        }
      } else {
        showToast('💾 Settings saved locally! (Enter GitHub Token above to auto-sync with cloud bot)');
      }
      
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
    
    if (!res.ok) {
      throw new Error(`RPC HTTP Error: ${res.status}`);
    }
    
    const payload = await res.json();
    if (payload.error) {
      throw new Error(`RPC Reverted: ${payload.error.message}`);
    }
    return payload.result;
  }

  // Generic Aave V3 Reserve Fetcher
  async function fetchAaveDataGeneric(rpcUrl, assetAddress, dataProviderAddress, poolAddress) {
    const paddedAsset = assetAddress.replace('0x', '').toLowerCase().padStart(64, '0');
    const getReserveDataSelector = '0x35ea6a75' + paddedAsset;

    // 1. Fetch from Data Provider
    const providerResult = await ethCall(rpcUrl, dataProviderAddress, getReserveDataSelector);
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
    const poolResult = await ethCall(rpcUrl, poolAddress, getReserveDataSelector);
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

  async function fetchPlasmaData() {
    return await fetchAaveDataGeneric(
      settings.plasmaRpcUrl,
      settings.plasmaAssetAddress,
      settings.plasmaDataProviderAddress,
      settings.plasmaPoolAddress
    );
  }

  async function fetchAaveData() {
    return await fetchAaveDataGeneric(
      settings.rpcUrl,
      settings.assetAddress,
      settings.dataProviderAddress,
      settings.poolAddress
    );
  }

  // Query Morpho Vault allocations from Morpho GraphQL API
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
          allocation {
            supplyAssets
            supplyCap
            market {
              marketId
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

    const allocations = [];
    if (vault.state.allocation) {
      for (const alloc of vault.state.allocation) {
        const supplyAssets = Number(alloc.supplyAssets) / Math.pow(10, decimals);
        const supplyCap = Number(alloc.supplyCap) / Math.pow(10, decimals);
        
        if (supplyAssets === 0 && (!alloc.market || !alloc.market.collateralAsset)) {
          continue;
        }

        const collateralSymbol = alloc.market && alloc.market.collateralAsset 
          ? alloc.market.collateralAsset.symbol 
          : 'USDC (Idle)';
        
        const loanSymbol = alloc.market && alloc.market.loanAsset ? alloc.market.loanAsset.symbol : 'USDC';
        const marketDecimals = alloc.market && alloc.market.loanAsset ? alloc.market.loanAsset.decimals : decimals;
        const marketId = alloc.market ? alloc.market.marketId : null;

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
          marketSupplyApy,
          marketId
        });
      }
    }

    return {
      name: vault.name,
      symbol: vault.symbol,
      totalAssets,
      netApy,
      fee,
      allocations
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

  const MORPHO_CHAIN_NAMES = {
    1: 'ethereum',
    8453: 'base',
    137: 'polygon'
  };

  function getExpandHintLabel(remainingCount, hasHiddenBreach) {
    if (isMorphoAllocExpanded) {
      return 'Show less';
    }
    return `${hasHiddenBreach ? '⚠️ ' : ''}+${remainingCount} more`;
  }

  function updateMorphoExpandUI(remainingCount, hasHiddenBreach) {
    const largestRow = document.querySelector('#morpho-allocations-list .allocation-row.largest');
    const extraContainer = document.querySelector('#morpho-allocations-list .allocations-extra');
    const hintText = document.querySelector('#morpho-allocations-list .alloc-expand-text');
    const hintBadge = document.querySelector('#morpho-allocations-list .alloc-expand-hint');

    if (largestRow) {
      largestRow.setAttribute('aria-expanded', String(isMorphoAllocExpanded));
    }
    if (extraContainer) {
      extraContainer.classList.toggle('expanded', isMorphoAllocExpanded);
    }
    if (hintText) {
      hintText.textContent = getExpandHintLabel(remainingCount, hasHiddenBreach);
    }
    if (hintBadge) {
      hintBadge.classList.toggle('has-warning', !isMorphoAllocExpanded && hasHiddenBreach);
    }
  }

  function toggleMorphoAllocations() {
    if (!latestMorphoAllocations || latestMorphoAllocations.length <= 1) return;
    isMorphoAllocExpanded = !isMorphoAllocExpanded;
    const remainingCount = latestMorphoAllocations.length - 1;
    const hasHiddenBreach = latestMorphoAllocations
      .slice(1)
      .some(a => a.collateralSymbol !== 'USDC (Idle)' && a.marketUtilization >= settings.morphoUtilizationThreshold);
    updateMorphoExpandUI(remainingCount, hasHiddenBreach);
  }

  function createAllocationRow(alloc, chainName, options = {}) {
    const { isLargest = false, remainingCount = 0, hasHiddenBreach = false } = options;
    const isBreached = alloc.collateralSymbol !== 'USDC (Idle)' && alloc.marketUtilization >= settings.morphoUtilizationThreshold;

    const item = document.createElement('div');
    let rowClass = 'allocation-row';
    if (isBreached) rowClass += ' error';
    if (isLargest) rowClass += ' largest';
    if (isLargest && remainingCount > 0) {
      rowClass += ' expandable';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-expanded', String(isMorphoAllocExpanded));
      item.title = 'Click to show/hide other allocations';
      item.addEventListener('click', (e) => {
        if (e.target.closest('.alloc-link-btn')) return;
        toggleMorphoAllocations();
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleMorphoAllocations();
        }
      });
    }
    item.className = rowClass;

    const label = document.createElement('div');
    label.className = 'allocation-label';
    const symbolClass = alloc.collateralSymbol.toLowerCase().replace(/[^a-z0-9]/g, '');

    const leftGroup = document.createElement('div');
    leftGroup.className = 'alloc-left';

    const badge = document.createElement('span');
    badge.className = `token-badge token-${symbolClass}`;
    badge.textContent = alloc.collateralSymbol;
    leftGroup.appendChild(badge);

    if (alloc.marketId) {
      const link = document.createElement('a');
      link.href = `https://app.morpho.org/${chainName}/market/${alloc.marketId}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'alloc-link-btn';
      link.title = `Open ${alloc.collateralSymbol} Market on Morpho`;
      link.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
      leftGroup.appendChild(link);
    }

    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'alloc-size';
    sizeSpan.textContent = formatM(alloc.supplyAssets);

    label.appendChild(leftGroup);
    label.appendChild(sizeSpan);

    const footer = document.createElement('div');
    footer.className = 'allocation-footer';

    const val = document.createElement('span');
    val.className = 'allocation-util';
    if (alloc.collateralSymbol === 'USDC (Idle)') {
      val.textContent = 'Idle';
      val.style.color = 'var(--text-muted)';
    } else {
      val.textContent = `${alloc.marketUtilization.toFixed(1)}%`;
    }
    footer.appendChild(val);

    if (isLargest && remainingCount > 0) {
      const hint = document.createElement('span');
      hint.className = `alloc-expand-hint${!isMorphoAllocExpanded && hasHiddenBreach ? ' has-warning' : ''}`;
      hint.innerHTML = `
        <span class="alloc-expand-text">${getExpandHintLabel(remainingCount, hasHiddenBreach)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      `;
      footer.appendChild(hint);
    }

    item.appendChild(label);
    item.appendChild(footer);
    return item;
  }

  function renderMorphoAllocations(allocations) {
    const listContainer = document.getElementById('morpho-allocations-list');
    const headerLabel = document.getElementById('morpho-alloc-header');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!allocations || allocations.length === 0) {
      latestMorphoAllocations = [];
      if (headerLabel) headerLabel.classList.remove('alloc-header-clickable');
      listContainer.innerHTML = '<div class="alloc-empty">No active allocations</div>';
      return;
    }

    const sorted = [...allocations].sort((a, b) => b.supplyAssets - a.supplyAssets);
    latestMorphoAllocations = sorted;

    const chainName = MORPHO_CHAIN_NAMES[parseInt(settings.morphoChainId)] || 'base';
    const remaining = sorted.slice(1);
    const hasHiddenBreach = remaining.some(
      a => a.collateralSymbol !== 'USDC (Idle)' && a.marketUtilization >= settings.morphoUtilizationThreshold
    );

    if (headerLabel) {
      headerLabel.classList.toggle('alloc-header-clickable', remaining.length > 0);
    }

    // Show the single largest underlying allocation by default
    listContainer.appendChild(createAllocationRow(sorted[0], chainName, {
      isLargest: true,
      remainingCount: remaining.length,
      hasHiddenBreach
    }));

    // Collapsible section for the remaining underlying allocations
    if (remaining.length > 0) {
      const extraWrapper = document.createElement('div');
      extraWrapper.className = `allocations-extra${isMorphoAllocExpanded ? ' expanded' : ''}`;

      const extraInner = document.createElement('div');
      extraInner.className = 'allocations-extra-inner';
      remaining.forEach((alloc) => {
        extraInner.appendChild(createAllocationRow(alloc, chainName));
      });

      extraWrapper.appendChild(extraInner);
      listContainer.appendChild(extraWrapper);
    }
  }

  function formatChartAxisVal(millions, span) {
    if (millions >= 1000) {
      const billions = millions / 1000;
      const decimals = span < 300 ? 2 : 1;
      return `${billions.toFixed(decimals)}B`;
    }
    const decimals = span < 12 ? 1 : 0;
    return `${millions.toFixed(decimals)}M`;
  }

  function formatChartFullVal(millions) {
    if (millions >= 1000) {
      return `${(millions / 1000).toFixed(2)}B`;
    }
    return `${millions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  }

  function formatChartDelta(diff, pct) {
    const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
    const absM = Math.abs(diff);
    const valStr = absM >= 1000
      ? `${(absM / 1000).toFixed(2)}B`
      : `${absM.toFixed(1)}M`;
    return `${sign}${valStr} (${sign}${Math.abs(pct).toFixed(1)}%)`;
  }

  function formatChartAxisDate(ms, tf) {
    const d = new Date(ms);
    if (tf === '1w') {
      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function formatChartTooltipDate(dateStr) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }

  // Fritsch-Carlson monotone cubic spline so the line is smooth without overshooting peaks/valleys
  function buildMonotonePath(points) {
    const n = points.length;
    if (n === 0) return '';
    if (n === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    if (n === 2) {
      return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
    }

    const d = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      d.push(dx > 0 ? (points[i + 1].y - points[i].y) / dx : 0);
    }

    const m = new Array(n).fill(0);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    }

    for (let i = 0; i < n - 1; i++) {
      if (d[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const a = m[i] / d[i];
        const b = m[i + 1] / d[i];
        const mag = a * a + b * b;
        if (mag > 9) {
          const tau = 3 / Math.sqrt(mag);
          m[i] = tau * a * d[i];
          m[i + 1] = tau * b * d[i];
        }
      }
    }

    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = (points[i + 1].x - points[i].x) / 3;
      const c1x = points[i].x + dx;
      const c1y = points[i].y + m[i] * dx;
      const c2x = points[i + 1].x - dx;
      const c2y = points[i + 1].y - m[i + 1] * dx;
      path += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${points[i + 1].x.toFixed(1)} ${points[i + 1].y.toFixed(1)}`;
    }
    return path;
  }

  function getChartSeries(poolKey) {
    const cfg = POOL_CHART_CONFIG[poolKey];
    const state = chartStates[poolKey];
    const byDate = new Map();

    for (const entry of state.history) {
      if (!entry || !entry.date) continue;
      const val = Number(entry[cfg.valueField]);
      if (!isNaN(val)) {
        byDate.set(entry.date, val);
      }
    }

    if (state.liveM !== null && !isNaN(state.liveM)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      byDate.set(todayStr, Number(state.liveM.toFixed(2)));
    }

    const allPoints = Array.from(byDate.entries())
      .map(([date, val]) => ({
        date,
        ms: Date.parse(`${date}T00:00:00Z`),
        val
      }))
      .sort((a, b) => a.ms - b.ms);

    if (allPoints.length === 0) return [];

    const days = TIMEFRAME_DAYS[state.timeframe] || 30;
    const latestMs = allPoints[allPoints.length - 1].ms;
    const cutoffMs = latestMs - (days - 1) * 86400000;
    const filtered = allPoints.filter(p => p.ms >= cutoffMs);
    return filtered.length > 0 ? filtered : allPoints.slice(-1);
  }

  function bindChartHover(plotArea, plotPoints, cfg) {
    const hoverLine = plotArea.querySelector('.chart-hover-line');
    const hoverDot = plotArea.querySelector('.chart-hover-dot');
    const tooltip = plotArea.querySelector('.chart-tooltip');
    const tooltipDate = plotArea.querySelector('.chart-tooltip-date');
    const tooltipVal = plotArea.querySelector('.chart-tooltip-val');
    if (!hoverLine || !hoverDot || !tooltip || plotPoints.length === 0) return;

    const showAtClientX = (clientX) => {
      const rect = plotArea.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetX = ratio * 1000;

      let nearest = plotPoints[0];
      let minDist = Math.abs(nearest.x - targetX);
      for (let i = 1; i < plotPoints.length; i++) {
        const dist = Math.abs(plotPoints[i].x - targetX);
        if (dist < minDist) {
          minDist = dist;
          nearest = plotPoints[i];
        }
      }

      const leftPct = nearest.x / 10;
      const topPct = nearest.y / 3;

      hoverLine.style.display = 'block';
      hoverLine.style.left = `${leftPct}%`;

      hoverDot.style.display = 'block';
      hoverDot.style.left = `${leftPct}%`;
      hoverDot.style.top = `${topPct}%`;
      hoverDot.style.background = cfg.color;
      hoverDot.style.boxShadow = `0 0 10px ${cfg.color}`;

      tooltipDate.textContent = formatChartTooltipDate(nearest.date);
      tooltipVal.textContent = nearest.val >= 1000
        ? `${formatChartFullVal(nearest.val)} (${nearest.val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M)`
        : formatChartFullVal(nearest.val);

      tooltip.style.display = 'block';
      const clampedX = Math.max(14, Math.min(86, leftPct));
      tooltip.style.left = `${clampedX}%`;
      if (nearest.y < 115) {
        tooltip.style.top = `calc(${topPct}% + 14px)`;
        tooltip.style.transform = 'translate(-50%, 0)';
      } else {
        tooltip.style.top = `${topPct}%`;
        tooltip.style.transform = 'translate(-50%, -118%)';
      }
    };

    const hideHover = () => {
      hoverLine.style.display = 'none';
      hoverDot.style.display = 'none';
      tooltip.style.display = 'none';
    };

    plotArea.addEventListener('mousemove', (e) => showAtClientX(e.clientX));
    plotArea.addEventListener('mouseleave', hideHover);
    plotArea.addEventListener('touchstart', (e) => {
      if (e.touches[0]) showAtClientX(e.touches[0].clientX);
    }, { passive: true });
    plotArea.addEventListener('touchmove', (e) => {
      if (e.touches[0]) showAtClientX(e.touches[0].clientX);
    }, { passive: true });
    plotArea.addEventListener('touchend', hideHover);
  }

  function renderSupplyChart(poolKey, force = false) {
    const cfg = POOL_CHART_CONFIG[poolKey];
    const state = chartStates[poolKey];
    const card = document.getElementById(cfg.cardId);
    if (!card) return;

    const series = getChartSeries(poolKey);
    const tf = state.timeframe;
    const renderKey = `${tf}|${series.map(p => `${p.date}:${p.val.toFixed(2)}`).join(',')}`;
    if (!force && state.lastRenderKey === renderKey) return;
    state.lastRenderKey = renderKey;

    if (series.length === 0) {
      card.innerHTML = '<div class="chart-empty">No history recorded yet</div>';
      return;
    }

    const values = series.map(p => p.val);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const avgVal = values.reduce((acc, v) => acc + v, 0) / values.length;

    let yMin;
    let yMax;
    if (maxVal === minVal) {
      const pad = Math.max(maxVal * 0.04, 1);
      yMin = Math.max(0, minVal - pad);
      yMax = maxVal + pad;
    } else {
      const effectiveSpan = Math.max(maxVal - minVal, maxVal * 0.015);
      const mid = (minVal + maxVal) / 2;
      yMin = Math.max(0, mid - effectiveSpan * 0.62);
      yMax = mid + effectiveSpan * 0.62;
    }
    const ySpan = Math.max(0.01, yMax - yMin);
    const yMid = (yMin + yMax) / 2;

    const PLOT_TOP = 18;
    const PLOT_BOTTOM = 282;
    const valToY = (v) => PLOT_BOTTOM - ((v - yMin) / ySpan) * (PLOT_BOTTOM - PLOT_TOP);

    const tMin = series[0].ms;
    const tMax = series[series.length - 1].ms;
    const plotPoints = series.map(p => ({
      ...p,
      x: tMax > tMin ? ((p.ms - tMin) / (tMax - tMin)) * 1000 : 500,
      y: valToY(p.val)
    }));

    const avgY = valToY(avgVal);
    const avgTopPct = Math.max(10, Math.min(88, avgY / 3));

    const firstVal = series[0].val;
    const lastVal = series[series.length - 1].val;
    const diff = lastVal - firstVal;
    const pct = firstVal > 0 ? (diff / firstVal) * 100 : 0;
    const deltaClass = diff > 0.01 ? 'pos' : diff < -0.01 ? 'neg' : '';
    const deltaHTML = series.length >= 2
      ? `<span class="chart-delta ${deltaClass}">${formatChartDelta(diff, pct)}</span>`
      : '';

    const linePath = plotPoints.length >= 2 ? buildMonotonePath(plotPoints) : '';
    const areaPath = plotPoints.length >= 2
      ? `${linePath} L ${plotPoints[plotPoints.length - 1].x.toFixed(1)} 300 L ${plotPoints[0].x.toFixed(1)} 300 Z`
      : '';

    const tfButtonsHTML = ['1w', '1m', '6m', '1y']
      .map(key => `<button type="button" class="chart-tf-btn${tf === key ? ' active' : ''}" data-tf="${key}">${key}</button>`)
      .join('');

    let xLabelsHTML = '';
    if (tMax === tMin) {
      xLabelsHTML = `<span>${formatChartAxisDate(tMin, tf)}</span>`;
    } else {
      const steps = 3;
      const seen = new Set();
      const labels = [];
      for (let i = 0; i <= steps; i++) {
        const ms = tMin + ((tMax - tMin) * i) / steps;
        const text = formatChartAxisDate(ms, tf);
        if (!seen.has(text) || i === steps) {
          seen.add(text);
          labels.push(`<span>${text}</span>`);
        }
      }
      xLabelsHTML = labels.join('');
    }

    const latestPt = plotPoints[plotPoints.length - 1];

    card.innerHTML = `
      <div class="chart-header">
        <div class="chart-title-wrap">
          <span class="chart-dot ${cfg.dotClass}"></span>
          <span class="chart-title">${cfg.title}</span>
          ${deltaHTML}
        </div>
        <div class="chart-timeframes">${tfButtonsHTML}</div>
      </div>
      <div class="chart-body">
        <div class="chart-y-axis">
          <span>${formatChartAxisVal(yMax, ySpan)}</span>
          <span>${formatChartAxisVal(yMid, ySpan)}</span>
          <span>${formatChartAxisVal(yMin, ySpan)}</span>
        </div>
        <div class="chart-plot-area">
          <svg class="chart-svg" viewBox="0 0 1000 300" preserveAspectRatio="none">
            <defs>
              <linearGradient id="${cfg.gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.28"></stop>
                <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.01"></stop>
              </linearGradient>
            </defs>
            <line x1="0" y1="${PLOT_TOP}" x2="1000" y2="${PLOT_TOP}" stroke="rgba(255,255,255,0.05)" stroke-width="1" vector-effect="non-scaling-stroke"></line>
            <line x1="0" y1="150" x2="1000" y2="150" stroke="rgba(255,255,255,0.05)" stroke-width="1" vector-effect="non-scaling-stroke"></line>
            <line x1="0" y1="${PLOT_BOTTOM}" x2="1000" y2="${PLOT_BOTTOM}" stroke="rgba(255,255,255,0.06)" stroke-width="1" vector-effect="non-scaling-stroke"></line>
            <line x1="0" y1="${avgY.toFixed(1)}" x2="1000" y2="${avgY.toFixed(1)}" stroke="rgba(255,255,255,0.28)" stroke-width="1.2" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"></line>
            ${areaPath ? `<path d="${areaPath}" fill="url(#${cfg.gradId})"></path>` : ''}
            ${linePath ? `<path d="${linePath}" fill="none" stroke="${cfg.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"></path>` : ''}
          </svg>
          <div class="chart-avg-pill" style="top: ${avgTopPct.toFixed(1)}%">Avg ${formatChartFullVal(avgVal)}</div>
          <div class="chart-live-dot" style="left: ${(latestPt.x / 10).toFixed(2)}%; top: ${(latestPt.y / 3).toFixed(2)}%; background: ${cfg.color}; box-shadow: 0 0 8px ${cfg.color};"></div>
          <div class="chart-hover-line"></div>
          <div class="chart-hover-dot"></div>
          <div class="chart-tooltip">
            <div class="chart-tooltip-date"></div>
            <div class="chart-tooltip-val"></div>
          </div>
        </div>
      </div>
      <div class="chart-x-axis">${xLabelsHTML}</div>
    `;

    card.querySelectorAll('.chart-tf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextTf = btn.dataset.tf;
        if (nextTf && chartStates[poolKey].timeframe !== nextTf) {
          chartStates[poolKey].timeframe = nextTf;
          renderSupplyChart(poolKey, true);
        }
      });
    });

    const plotArea = card.querySelector('.chart-plot-area');
    if (plotArea) {
      bindChartHover(plotArea, plotPoints, cfg);
    }
  }

  async function loadAllPoolHistories() {
    await Promise.all(
      Object.entries(POOL_CHART_CONFIG).map(async ([poolKey, cfg]) => {
        try {
          const res = await fetch(`./${cfg.historyFile}?t=${Date.now()}`);
          if (res.ok) {
            const rows = await res.json();
            if (Array.isArray(rows)) {
              chartStates[poolKey].history = rows;
            }
          }
        } catch (err) {
          console.warn(`Failed to load ${cfg.historyFile}:`, err);
        }
        renderSupplyChart(poolKey);
      })
    );
  }

  // Update Plasma, Ethereum, and Morpho UI metrics in parallel
  async function refreshAllMetrics() {
    const lblStatus = document.getElementById('lbl-status');
    const statusIndicator = document.getElementById('status-indicator');

    lblStatus.textContent = 'Updating...';
    lblStatus.style.color = 'var(--text-secondary)';

    let plasmaError = null;
    let ethError = null;
    let morphoError = null;

    // 1. Fetch & Render Aave Plasma
    try {
      const data = await fetchPlasmaData();
      if (document.getElementById('val-plasma-net-apy')) {
        document.getElementById('val-plasma-net-apy').textContent = data.netApy.toFixed(2) + '%';
      }
      if (document.getElementById('val-plasma-utilization')) {
        document.getElementById('val-plasma-utilization').textContent = data.utilization.toFixed(2) + '%';
      }

      const gauge = document.getElementById('util-plasma-gauge');
      const strokeDasharray = 238.76;
      const offset = strokeDasharray - (strokeDasharray * Math.min(100, data.utilization) / 100);
      if (gauge) {
        gauge.style.strokeDashoffset = offset;
        if (data.utilization >= settings.utilizationThreshold) {
          gauge.classList.add('warning');
        } else {
          gauge.classList.remove('warning');
        }
      }

      if (document.getElementById('val-plasma-total-supply')) {
        document.getElementById('val-plasma-total-supply').textContent = formatM(data.totalSupply);
      }
      if (document.getElementById('val-plasma-total-borrow')) {
        document.getElementById('val-plasma-total-borrow').textContent = formatM(data.totalBorrow);
      }
      chartStates.plasma.liveM = data.totalSupply / 1e6;
      renderSupplyChart('plasma');
    } catch (err) {
      console.error("Aave Plasma error:", err);
      plasmaError = err.message;
    }

    // 2. Fetch & Render Aave Ethereum
    try {
      const data = await fetchAaveData();
      if (document.getElementById('val-net-apy')) {
        document.getElementById('val-net-apy').textContent = data.netApy.toFixed(2) + '%';
      }
      if (document.getElementById('val-utilization')) {
        document.getElementById('val-utilization').textContent = data.utilization.toFixed(2) + '%';
      }

      const gauge = document.getElementById('util-gauge');
      const strokeDasharray = 238.76;
      const offset = strokeDasharray - (strokeDasharray * Math.min(100, data.utilization) / 100);
      if (gauge) {
        gauge.style.strokeDashoffset = offset;
        if (data.utilization >= settings.utilizationThreshold) {
          gauge.classList.add('warning');
        } else {
          gauge.classList.remove('warning');
        }
      }

      if (document.getElementById('val-total-supply')) {
        document.getElementById('val-total-supply').textContent = formatM(data.totalSupply);
      }
      if (document.getElementById('val-total-borrow')) {
        document.getElementById('val-total-borrow').textContent = formatM(data.totalBorrow);
      }
      chartStates.ethereum.liveM = data.totalSupply / 1e6;
      renderSupplyChart('ethereum');
    } catch (err) {
      console.error("Aave Ethereum error:", err);
      ethError = err.message;
    }

    // 3. Fetch & Render Morpho
    try {
      const data = await fetchMorphoData();
      if (document.getElementById('morpho-net-apy')) {
        document.getElementById('morpho-net-apy').textContent = data.netApy.toFixed(2) + '%';
      }
      if (document.getElementById('morpho-total-assets')) {
        document.getElementById('morpho-total-assets').textContent = formatM(data.totalAssets);
      }

      chartStates.morpho.liveM = data.totalAssets / 1e6;
      renderSupplyChart('morpho');
      renderMorphoAllocations(data.allocations);
    } catch (err) {
      console.error("Morpho error:", err);
      morphoError = err.message;
    }

    // Status footer update
    const errors = [plasmaError, ethError, morphoError].filter(Boolean);
    if (errors.length > 0) {
      statusIndicator.className = 'status-dot error';
      lblStatus.textContent = errors.length === 3 ? 'Offline' : 'Partial Error';
      lblStatus.style.color = 'var(--accent-red)';
    } else {
      statusIndicator.className = 'status-dot';
      lblStatus.textContent = 'ONLINE';
      lblStatus.style.color = 'var(--accent-green)';
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

  // Plasma Test Trigger
  if (testPlasmaBtn) {
    testPlasmaBtn.addEventListener('click', async () => {
      const token = document.getElementById('telegramBotToken').value;
      const chatId = document.getElementById('telegramChatId').value;
      
      if (!token || !chatId) {
        showToast('Please fill out the Telegram Bot Token and Chat ID to run a test.', 'error');
        return;
      }

      testPlasmaBtn.disabled = true;
      const originalText = testPlasmaBtn.innerHTML;
      testPlasmaBtn.innerHTML = 'Sending...';

      try {
        const data = await fetchPlasmaData();
        const message = `*[TEST MESSAGE]*\n` +
                        `Aave Plasma Pool Alert\n` +
                        `• *Total Supply:* ${formatM(data.totalSupply)}\n` +
                        `• *Net APY:* ${data.netApy.toFixed(2)}%\n` +
                        `• *Utilization:* ${data.utilization.toFixed(2)}%`;

        await dispatchTelegramTest(token, chatId, message);
        showToast('Plasma test alert sent to Telegram successfully!');
        document.getElementById('lbl-last-alert').textContent = new Date().toLocaleTimeString();
      } catch (err) {
        showToast('Plasma test failed: ' + err.message, 'error');
      } finally {
        testPlasmaBtn.disabled = false;
        testPlasmaBtn.innerHTML = originalText;
      }
    });
  }

  // Ethereum Test Trigger
  if (testAlertBtn) {
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
        const message = `*[TEST MESSAGE]*\n` +
                        `Aave Ethereum Pool Alert\n` +
                        `• *Total Supply:* ${formatM(data.totalSupply)}\n` +
                        `• *Net APY:* ${data.netApy.toFixed(2)}%\n` +
                        `• *Utilization:* ${data.utilization.toFixed(2)}%`;

        await dispatchTelegramTest(token, chatId, message);
        showToast('Ethereum test alert sent to Telegram successfully!');
        document.getElementById('lbl-last-alert').textContent = new Date().toLocaleTimeString();
      } catch (err) {
        showToast('Ethereum test failed: ' + err.message, 'error');
      } finally {
        testAlertBtn.disabled = false;
        testAlertBtn.innerHTML = originalText;
      }
    });
  }

  // Morpho Test Trigger
  if (testMorphoBtn) {
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
        
        const threshold = parseFloat(document.getElementById('utilizationThreshold').value || settings.utilizationThreshold || '94.0');
        
        let primaryAlloc = null;
        data.allocations.forEach(alloc => {
          if (alloc.collateralSymbol === 'USDC (Idle)') return;
          if (!primaryAlloc || alloc.supplyAssets > primaryAlloc.supplyAssets) {
            primaryAlloc = alloc;
          }
        });

        const isBreached = primaryAlloc && primaryAlloc.marketUtilization >= threshold;

        const utilLine = primaryAlloc
          ? `• *Utilization:* ${primaryAlloc.marketUtilization.toFixed(2)}%${isBreached ? ' (BREACHED)' : ''}`
          : `• *Utilization:* N/A`;

        const message = `*[TEST MESSAGE]*\n` +
                        `Morpho Base Vault Status\n` +
                        `*Vault:* ${data.name}\n\n` +
                        `*Total Vault Assets:* ${formatM(data.totalAssets)}\n` +
                        `*Vault Net APY:* ${data.netApy.toFixed(2)}%\n` +
                        `${utilLine}`;

        await dispatchTelegramTest(token, chatId, message);
        showToast('Morpho test alert sent to Telegram successfully!');
        document.getElementById('lbl-last-alert').textContent = new Date().toLocaleTimeString();
      } catch (err) {
        showToast('Morpho test alert failed: ' + err.message, 'error');
      } finally {
        testMorphoBtn.disabled = false;
        testMorphoBtn.innerHTML = originalText;
      }
    });
  }

  const morphoAllocHeader = document.getElementById('morpho-alloc-header');
  if (morphoAllocHeader) {
    morphoAllocHeader.addEventListener('click', toggleMorphoAllocations);
  }

  // Initial load
  loadAllPoolHistories();
  loadConfig().finally(() => {
    refreshAllMetrics();
  });

  // Refresh live metrics every 10 seconds, history files every 5 minutes
  setInterval(refreshAllMetrics, 10000);
  setInterval(loadAllPoolHistories, 300000);
});
