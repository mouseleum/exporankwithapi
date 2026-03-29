export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { companies } = req.body;

  if (!companies || !Array.isArray(companies) || !companies.length) {
    return res.status(400).json({ error: 'Missing companies array' });
  }

  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'PDL_API_KEY not configured' });

  const results = [];

  // Process in batches of 5 to avoid rate limits
  for (let i = 0; i < companies.length; i += 5) {
    const batch = companies.slice(i, i + 5);

    const promises = batch.map(async (company) => {
      try {
        const params = new URLSearchParams({
          name: company.name,
          api_key: apiKey
        });
        // Add country if available (improves match accuracy)
        if (company.country) {
          params.append('location', company.country);
        }

        const response = await fetch(
          `https://api.peopledatalabs.com/v5/company/enrich?${params.toString()}`,
          { method: 'GET', headers: { 'Accept': 'application/json' } }
        );

        if (response.status === 200) {
          const data = await response.json();
          return {
            name: company.name,
            matched: true,
            employee_count: data.employee_count || null,
            employee_range: data.size || null,
            industry: data.industry || null,
            revenue_range: data.inferred_revenue || null,
            founded: data.founded || null,
            linkedin_url: data.linkedin_url || null,
            tags: data.tags || []
          };
        } else if (response.status === 404) {
          return { name: company.name, matched: false };
        } else {
          return { name: company.name, matched: false, error: response.status };
        }
      } catch (err) {
        return { name: company.name, matched: false, error: err.message };
      }
    });

    const batchResults = await Promise.all(promises);
    results.push(...batchResults);

    // Small delay between batches to respect rate limits
    if (i + 5 < companies.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return res.status(200).json({ results });
}
