
export default async function handler(req: any, res: any) {
  const hasKey = !!process.env.API_KEY;
  // Node.jsランタイムでは res.json() を使用して確実にJSONを返します
  res.status(200).json({ status: hasKey ? 'ok' : 'missing' });
}
