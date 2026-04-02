export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const payment = req.headers["x-payment"] || req.query.payment;
  if (!payment) {
    return res.status(402).json({
      error: "Payment Required",
      x402: {
        price: "0.01", currency: "USDC", chain: "base",
        payTo: process.env.WALLET_ADDRESS || "0xYourWallet"
      }
    });
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
