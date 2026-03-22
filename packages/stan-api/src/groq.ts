// Lightweight Groq LLM call for one-sentence tip rationale.
// Gracefully falls back to null if GROQ_API_KEY is not set or call fails.

interface RationaleContext {
  triggerType: string
  conviction: string
  momentumScore: number
  tipAmount: number
  eventSummary: string
}

export async function getTipRationale(ctx: RationaleContext): Promise<string | null> {
  const key = process.env.GROQ_API_KEY
  if (!key) return null

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: 'You are STAN, an AI super-fan agent that tips Rumble creators at exactly the right moment. Write one punchy sentence (max 15 words) explaining why this tip fires NOW. No quotes. Capture the energy of the moment.',
          },
          {
            role: 'user',
            content: `Trigger: ${ctx.triggerType}. Conviction: ${ctx.conviction} (${Math.round(ctx.momentumScore * 100)}% momentum). Tip: $${ctx.tipAmount.toFixed(2)}. ${ctx.eventSummary}`,
          },
        ],
        max_tokens: 50,
        temperature: 0.8,
      }),
    })

    if (!res.ok) return null
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    return json.choices?.[0]?.message?.content?.trim() ?? null
  } catch {
    return null
  }
}
