export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const ALCHEMY_BASE = "https://base-mainnet.g.alchemy.com/v2/2r5WxhBAO4ALEJmlUtUUs";
  const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const WALLET = process.env.WALLET_ADDRESS;
  const PRICE = BigInt("10000"); // 0.01 USDC (6 decimals)

  // x402決済検証
  async function verifyPayment(txHash) {
    try {
      const r = await fetch(ALCHEMY_BASE, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          id: 1, jsonrpc: "2.0", method: "eth_getTransactionReceipt",
          params: [txHash]
        })
      });
      const data = await r.json();
      const receipt = data.result;
      if (!receipt || receipt.status !== "0x1") return false;

      // USDCのTransferイベントを確認
      const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== USDC_BASE.toLowerCase()) continue;
        if (log.topics[0] !== transferTopic) continue;
        const to = "0x" + log.topics[2].slice(26);
        const amount = BigInt(log.data);
        if (to.toLowerCase() === WALLET.toLowerCase() && amount >= PRICE) {
          return true;
        }
      }
      return false;
    } catch(e) { return false; }
  }

  const payment = req.headers["x-payment"] || req.query.payment;
  if (!payment) {
    return res.status(402).json({
      error: "Payment Required",
      x402: {
        price: "0.01", currency: "USDC", chain: "base",
        payTo: WALLET,
        asset: USDC_BASE,
        instruction: "Send 0.01 USDC on Base chain, then pass tx hash as ?payment=0x..."
      }
    });
  }

  // txハッシュの検証
  if (payment.startsWith("0x") && payment.length === 66) {
    const valid = await verifyPayment(payment);
    if (!valid) {
      return res.status(402).json({ error: "Payment not verified", message: "有効なUSDC送金が確認できませんでした" });
    }
  }

  const address = req.query.address || req.body?.address;
  const chain = req.query.chain || "ethereum";
  if (!address) return res.status(400).json({ error: "address required" });

  const CHAINS = {
    ethereum:"1", eth:"1", base:"8453", bsc:"56",
    polygon:"137", arbitrum:"42161", solana:"solana"
  };
  const chainId = CHAINS[chain.toLowerCase()] || "1";

  try {
    const url = chainId === "solana"
      ? "https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses=" + address
      : "https://api.gopluslabs.io/api/v1/token_security/" + chainId + "?contract_addresses=" + address;

    const r = await fetch(url);
    const json = await r.json();
    const d = json.result?.[address.toLowerCase()] || json.result?.[address] || {};

    const risks = [];
    if (d.is_honeypot === "1") risks.push("ハニーポット検出");
    if (d.is_blacklisted === "1") risks.push("ブラックリスト登録");
    if (d.can_take_back_ownership === "1") risks.push("オーナーシップ奪還可能");
    if (d.selfdestruct === "1") risks.push("自己破壊機能あり");
    if (parseFloat(d.sell_tax) > 0.1) risks.push("売り税高い: " + (parseFloat(d.sell_tax)*100).toFixed(1) + "%");

    const warnings = [];
    if (d.is_mintable === "1") warnings.push("ミント可能");
    if (d.transfer_pausable === "1") warnings.push("転送停止機能あり");
    if (d.is_proxy === "1") warnings.push("プロキシコントラクト");

    return res.status(200).json({
      success: true,
      data: {
        address, chain: chainId,
        score: risks.length > 0 ? "DANGER" : warnings.length > 0 ? "CAUTION" : "SAFE",
        risks, warnings,
        name: d.token_name || "Unknown",
        symbol: d.token_symbol || "???",
        checkedAt: new Date().toISOString()
      }
    });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
