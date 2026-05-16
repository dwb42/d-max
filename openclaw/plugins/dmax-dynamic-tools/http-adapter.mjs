const DMAX_TOOL_PREFIX = "d-max__";
const DEFAULT_TIMEOUT_MS = 60_000;

export function exposedToolName(toolName) {
  return toolName.startsWith(DMAX_TOOL_PREFIX) ? toolName : `${DMAX_TOOL_PREFIX}${toolName}`;
}

export function internalToolName(exposedName) {
  return exposedName.startsWith(DMAX_TOOL_PREFIX) ? exposedName.slice(DMAX_TOOL_PREFIX.length) : exposedName;
}

export function textResult(payload, isError = false) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text }],
    isError
  };
}

export async function executeDmaxTool(exposedName, params, options = {}) {
  const token = options.token ?? process.env.DMAX_INTERNAL_TOOL_TOKEN;
  if (!token) {
    return textResult({ ok: false, error: "DMAX_INTERNAL_TOOL_TOKEN is not configured." }, true);
  }

  const toolName = internalToolName(exposedName);
  const endpointUrl = buildToolEndpointUrl(options.endpointUrl ?? process.env.DMAX_TOOL_ENDPOINT_URL, toolName);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        input: params && typeof params === "object" ? params : {},
        traceId: options.traceId
      }),
      signal: controller.signal
    });
    const payload = await readJsonResponse(response);

    if (!response.ok) {
      return textResult(
        {
          ok: false,
          error: payload && typeof payload.error === "string" ? payload.error : `DMAX tool endpoint returned HTTP ${response.status}.`
        },
        true
      );
    }

    if (!payload || payload.ok !== true || !("result" in payload)) {
      return textResult({ ok: false, error: "DMAX tool endpoint returned an unexpected response." }, true);
    }

    const result = payload.result;
    const isError = result?.ok === false && !("requiresConfirmation" in result);
    return textResult(result, isError);
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return textResult(
      {
        ok: false,
        error: aborted ? `DMAX tool endpoint timed out after ${Math.round(timeoutMs / 1000)}s.` : error instanceof Error ? error.message : String(error)
      },
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function buildToolEndpointUrl(baseUrl, toolName) {
  const base = (baseUrl || "http://dmax-api:3088/internal/openclaw/tools").replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(toolName)}`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: "DMAX tool endpoint returned non-JSON response." };
  }
}
