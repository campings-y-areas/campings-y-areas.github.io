function parseJsonText(text) {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("OpenAI devolvió contenido vacío");
  return JSON.parse(value);
}

function outputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("OpenAI no devolvió texto utilizable");
}

export async function generateJson(env, prompt) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  const model = env.OPENAI_MODEL || "gpt-5.6";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: prompt,
      text: { format: { type: "json_object" } }
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  return parseJsonText(outputText(payload));
}
