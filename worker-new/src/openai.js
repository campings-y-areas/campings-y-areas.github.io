function parseJsonText(text) {
  const value = String(text ?? "").trim();
  if (!value) throw new Error("OpenAI devolvió contenido vacío");
  try {
    return JSON.parse(value);
  } catch {
    throw new Error("OpenAI devolvió JSON inválido");
  }
}

function outputText(payload) {
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
      if (content?.type === "refusal") throw new Error("OpenAI rechazó generar la respuesta");
    }
  }
  if (typeof payload?.output_text === "string") return payload.output_text;
  throw new Error("OpenAI no devolvió texto utilizable");
}

export async function generateJson(env, prompt, { imageSearch = false } = {}) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY no configurada");
  const model = env.OPENAI_MODEL || "gpt-5.6";
  let response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model,
        input: prompt,
        text: { format: { type: "json_object" } },
        ...(imageSearch ? {
          tools: [{
            type: "web_search",
            search_content_types: ["image"],
            image_settings: { max_results: 12, caption: true }
          }],
          include: ["web_search_call.results"]
        } : {})
      })
    });
  } catch (error) {
    throw new Error(`OpenAI no disponible: ${error?.message || "error de red"}`);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ? `OpenAI: ${payload.error.message}` : `OpenAI HTTP ${response.status}`);
  return parseJsonText(outputText(payload));
}
