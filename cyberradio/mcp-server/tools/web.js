// web.* — Tavily 网搜
// 不内置 query 模板; 由 Agent 决定查什么.
import axios from 'axios'

export function registerWebTools(register) {
  register({
    name: 'web.search',
    description: '使用 Tavily 进行网络搜索, 返回原始片段. Agent 自行决定如何使用.',
    inputSchema: {
      type: 'object',
      properties: {
        query:           { type: 'string' },
        max_results:     { type: 'number', default: 5 },
        depth:           { type: 'string', enum: ['basic','advanced'], default: 'basic' },
        include_domains: { type: 'array', items: { type: 'string' } },
        exclude_domains: { type: 'array', items: { type: 'string' } }
      },
      required: ['query']
    },
    handler: async ({ query, max_results = 5, depth = 'basic', include_domains, exclude_domains }) => {
      const key = process.env.TAVILY_API_KEY
      if (!key) return { error: 'TAVILY_API_KEY 未配置', results: [] }
      const body = {
        api_key: key, query, max_results,
        search_depth: depth
      }
      if (include_domains) body.include_domains = include_domains
      if (exclude_domains) body.exclude_domains = exclude_domains
      const r = await axios.post('https://api.tavily.com/search', body, { timeout: 15000 })
      return {
        query,
        results: (r.data?.results || []).map(x => ({
          title: x.title, url: x.url,
          snippet: (x.content || '').slice(0, 800),
          score: x.score
        })),
        answer: r.data?.answer || null
      }
    }
  })
}
