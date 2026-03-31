export type SseEvent = { event: string; data: any };

function parseSseBlock(block: string): SseEvent | null {
  const lines = block.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }

  const raw = dataLines.join("\n");
  if (!raw) return { event, data: {} };

  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: { text: raw } };
  }
}

export function parseSseBuffer(buf: string): { events: SseEvent[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() || "";
  const events: SseEvent[] = [];
  for (const block of parts) {
    if (!block.trim()) continue;
    const evt = parseSseBlock(block);
    if (evt) events.push(evt);
  }
  return { events, rest };
}

