export async function collectionApi(
  url: string,
  method = "GET",
  body?: unknown,
) {
  const r = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Please try again.");
  return data;
}
