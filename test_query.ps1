$query = 'query {
  vaultByAddress(address: "0xbeefe94c8ad530842bfe7d8b397938ffc1cb83b2", chainId: 8453) {
    name
    symbol
    state {
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
}'
$body = @{ query = $query } | ConvertTo-Json
$res = Invoke-WebRequest -Uri "https://api.morpho.org/graphql" -Method Post -Body $body -ContentType "application/json"
$res.Content
