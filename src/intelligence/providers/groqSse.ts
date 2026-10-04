import type { ProviderError } from "../provider-sdk/error";
import type { ProviderHttpResult } from "../provider-runtime/transport";

type GroqExchange = Extract<ProviderHttpResult, { success: true }>;
type ParsedEvent =
  | { success: true; done: true }
  | { success: true; done: false; value: unknown }
  | { success: false; error: ProviderError };

const invalidStream: ProviderError = {
  code: "GROQ_INVALID_STREAM",
  message: "Groq returned an invalid stream",
  category: "validation"
};

// Groq Chat Completions sends data-only SSE frames and a final [DONE] frame.
export async function* readGroqEvents(
  exchange: GroqExchange
): AsyncIterable<ParsedEvent> {
  const body = exchange.response.body;
  if (!body) {
    exchange.close();
    yield { success: false, error: invalidStream };
    return;
  }
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    exchange.close();
    yield { success: false, error: invalidStream };
    return;
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let dataLines: string[] = [];
  const dispatch = (): ParsedEvent | undefined => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    if (data === "[DONE]") return { success: true, done: true };
    try {
      const value: unknown = JSON.parse(data);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { success: false, error: invalidStream };
      }
      return { success: true, done: false, value };
    } catch {
      return { success: false, error: invalidStream };
    }
  };
  const consumeLine = (line: string): ParsedEvent | undefined => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") return dispatch();
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== "data") return;
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    dataLines.push(value);
  };

  try {
    while (true) {
      const chunk = await exchange.readChunk(reader);
      if (!chunk.success) {
        yield chunk;
        return;
      }
      buffer += chunk.value.done
        ? decoder.decode()
        : decoder.decode(chunk.value.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const item = consumeLine(line);
        if (item) {
          yield item;
          if (!item.success || item.done) return;
        }
      }
      if (chunk.value.done) {
        if (buffer !== "") {
          const item = consumeLine(buffer);
          if (item) {
            yield item;
            if (!item.success || item.done) return;
          }
        }
        const item = dispatch();
        if (item) yield item;
        return;
      }
    }
  } catch {
    yield { success: false, error: invalidStream };
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Native stream details must not enter public errors.
    }
    reader.releaseLock();
    exchange.close();
  }
}
