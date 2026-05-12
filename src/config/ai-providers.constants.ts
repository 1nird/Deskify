export interface AIProvider {
  id: string;
  name: string;
  defaultModel: string;
  curl: string;
  responseContentPath: string;
  streaming: boolean;
}

export const AI_PROVIDERS: AIProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultModel: "gpt-4o",
    curl: `curl https://api.openai.com/v1/chat/completions \\\
  -H "Content-Type: application/json" \\\
  -H "Authorization: Bearer {{API_KEY}}" \\\
  -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    defaultModel: "claude-opus-4-5",
    curl: `curl https://api.anthropic.com/v1/messages \\\
  -H "x-api-key: {{API_KEY}}" \\\
  -H "anthropic-version: 2023-06-01" \\\
  -H "anthropic-dangerous-direct-browser-access: true" \\\
  -H "content-type: application/json" \\\
  -d '{
    "model": "{{MODEL}}",
    "system": "{{SYSTEM_PROMPT}}",
    "messages": [{"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "{{IMAGE}}"}}]}],
    "max_tokens": 1024
  }'`,
    responseContentPath: "content[0].text",
    streaming: true,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    defaultModel: "gemini-2.5-flash-lite",
    curl: `curl "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" \\\
  -H "Authorization: Bearer {{API_KEY}}" \\\
  -H "Content-Type: application/json" \\\
  -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "grok",
    name: "xAI Grok",
    defaultModel: "grok-3-fast",
    curl: `curl https://api.x.ai/v1/chat/completions \\\
  -H "Content-Type: application/json" \\\
  -H "Authorization: Bearer {{API_KEY}}" \\\
  -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    defaultModel: "mistral-large-latest",
    curl: `curl https://api.mistral.ai/v1/chat/completions \\\
  -H "Content-Type: application/json" \\\
  -H "Authorization: Bearer {{API_KEY}}" \\\
  -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": "data:image/png;base64,{{IMAGE}}"}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "groq",
    name: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    curl: `curl https://api.groq.com/openai/v1/chat/completions \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer {{API_KEY}}" \
    -d '{
      "model": "{{MODEL}}",
      "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}],
      "temperature": 1,
      "max_completion_tokens": 8192,
      "top_p": 1,
      "stream": true,
      "stop": null
    }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    defaultModel: "llama-3.1-sonar-large-128k-online",
    curl: `curl -X POST https://api.perplexity.ai/chat/completions \\\
  -H "Authorization: Bearer {{API_KEY}}" \\\
  -H "Content-Type: application/json" \\\
  -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultModel: "google/gemini-2.0-flash-lite-001",
    curl: `curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {{API_KEY}}" \
  -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    defaultModel: "llama3.2",
    curl: `curl -X POST http://localhost:11434/v1/chat/completions \\\
    -H "Authorization: Bearer {{API_KEY}}" \\\
    -H "Content-Type: application/json" \\\
    -d '{
    "model": "{{MODEL}}",
    "messages": [{"role": "system", "content": "{{SYSTEM_PROMPT}}"}, {"role": "user", "content": [{"type": "text", "text": "{{TEXT}}"}, {"type": "image_url", "image_url": {"url": "data:image/png;base64,{{IMAGE}}"}}]}]
  }'`,
    responseContentPath: "choices[0].message.content",
    streaming: true,
  },
];
