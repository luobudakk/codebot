const API_BASE =
  process.env.NEXT_PUBLIC_CSR_API_BASE_URL || "http://127.0.0.1:8787/api/v1";

async function request(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(text || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export function createSession(title) {
  return request("/security/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export function startScan(payload) {
  return request("/security/scans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getJob(jobId) {
  return request(`/security/jobs/${jobId}`);
}

export function getFindings(sessionId) {
  return request(`/security/sessions/${sessionId}/findings`);
}

export function ingestKnowledge(payload) {
  return request("/rag/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function retrieveKnowledge(payload) {
  return request("/rag/retrieve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function streamJob(jobId, onMessage) {
  const eventSource = new EventSource(`${API_BASE}/security/jobs/${jobId}/events`);
  eventSource.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // Ignore malformed payload and keep stream alive.
    }
  };
  return () => eventSource.close();
}

