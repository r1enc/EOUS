import type { ProviderError } from "../provider-sdk/error";
import type { ProviderHttpResult } from "../provider-runtime/transport";

type OpenAiExchange = Extract<ProviderHttpResult, { success: true }>;
type ParsedEvent =
  { success: true; value: unknown } | { success: false; error: ProviderError };

const invalidEvent: ProviderError = {
  code: "OPENAI_INVALID_STREAM",
  message: "OpenAI returned an invalid stream",
  category: "validation"
};

// This handles SSE framing only. OpenAI event semantics stay in the adapter.
export async function* readOpenAiEvents(
  exchange: OpenAiExchange
): AsyncIterable<ParsedEvent> {
  const body = exchange.response.body;
  if (!body) {
    exchange.close();
    yield { success: false, error: invalidEvent };
    return;
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    exchange.close();
    yield { success: false, error: invalidEvent };
    return;
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  const dispatch = (): ParsedEvent | undefined => {
    if (dataLines.length === 0) {
      eventName = "";
      return;
    }
    const data = dataLines.join("\n");
    dataLines = [];
    try {
      const value: unknown = JSON.parse(data);
      if (
        typeof value !== "object" ||
        value === null ||
        !("type" in value) ||
        typeof value.type !== "string" ||
        (eventName !== "" && eventName !== value.type)
      ) {
        return { success: false, error: invalidEvent };
      }
      return { success: true, value };
    } catch {
      return { success: false, error: invalidEvent };
    } finally {
      eventName = "";
    }
  };
  const consumeLine = (line: string): ParsedEvent | undefined => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") return dispatch();
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    if (field === "data") dataLines.push(value);
    return;
  };

  try {
    while (true) {
      const chunk = await exchange.readChunk(reader);
      if (!chunk.success) {
        yield chunk;
        return;
      }
      if (chunk.value.done) {
        buffer += decoder.decode();
      } else {
        buffer += decoder.decode(chunk.value.value, { stream: true });
      }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const event = consumeLine(line);
        if (event) {
          yield event;
          if (!event.success) return;
        }
      }
      if (chunk.value.done) {
        if (buffer !== "") {
          const event = consumeLine(buffer);
          if (event) yield event;
        }
        const event = dispatch();
        if (event) yield event;
        return;
      }
    }
  } catch {
    yield { success: false, error: invalidEvent };
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The public failure is already normalized.
    }
    reader.releaseLock();
    exchange.close();
  }
}
