export function extractOpenAiOutputText(response: unknown) {
  if (response && typeof response === 'object' && 'output_text' in response && typeof response.output_text === 'string') return response.output_text;
  if (!response || typeof response !== 'object' || !('output' in response) || !Array.isArray(response.output)) return '';
  return response.output.flatMap(item => item && typeof item === 'object' && 'content' in item && Array.isArray(item.content) ? item.content : [])
    .map(content => content && typeof content === 'object' && 'text' in content && typeof content.text === 'string' ? content.text : '').join('').trim();
}

export async function createOpenAiJson(args: { apiKey: string; developer: string; user: string; schemaName: string; schema: Record<string, unknown>; timeoutMs?: number; request?: typeof fetch }) {
  const response = await (args.request || fetch)('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', store: false,
      input: [{ role: 'developer', content: args.developer }, { role: 'user', content: args.user }],
      text: { format: { type: 'json_schema', name: args.schemaName, strict: true, schema: args.schema } }, max_output_tokens: 1800 }),
    cache: 'no-store', signal: AbortSignal.timeout(args.timeoutMs || 10_000),
  });
  if (!response.ok) throw new Error(`OpenAI Responses API: HTTP ${response.status}`);
  const output = extractOpenAiOutputText(await response.json()); if (!output) throw new Error('OpenAI Responses APIの出力が空です。');
  return JSON.parse(output) as unknown;
}
