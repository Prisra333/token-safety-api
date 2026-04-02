export default async function handler(req, res) {
  const { address, chain = "eth" } = req.query;
  if (!address) return res.status(400).json({ error: "address required" });

  const apiKey = process.env.ALCHEMY_API_KEY;
  const url = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alchemy_getTokenMetadata",
        params: [address]
      })
    });
    const data = await r.json();
    res.status(200).json({ address, chain, result: data.result, error: data.error });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}