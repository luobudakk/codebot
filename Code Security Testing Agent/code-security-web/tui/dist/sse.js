"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSseBuffer = parseSseBuffer;
function parseSseBlock(block) {
    const lines = block.split("\n");
    let event = "message";
    const dataLines = [];
    for (const line of lines) {
        if (line.startsWith("event:"))
            event = line.slice(6).trim();
        if (line.startsWith("data:"))
            dataLines.push(line.slice(5).trim());
    }
    const raw = dataLines.join("\n");
    if (!raw)
        return { event, data: {} };
    try {
        return { event, data: JSON.parse(raw) };
    }
    catch {
        return { event, data: { text: raw } };
    }
}
function parseSseBuffer(buf) {
    const parts = buf.split("\n\n");
    const rest = parts.pop() || "";
    const events = [];
    for (const block of parts) {
        if (!block.trim())
            continue;
        const evt = parseSseBlock(block);
        if (evt)
            events.push(evt);
    }
    return { events, rest };
}
