export default async function handler(req, res) {
  const { address, chain = "eth" } = req.query;
  if (!address) return res.status(400).json({ error: "address required" });

  const apiKey = process.env.ALCHEMY_API_KEY;
  const url = `https://eth-mainnet.g.alchemy.com/v2/${apiKey}/getTokenMetadata?contractAddress=${address}`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    res.status(200).json({ address, chain, result: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}