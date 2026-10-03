import type { ProviderError } from "../provider-sdk/error";
import type { ProviderHttpResult } from "../provider-runtime/transport";

type GeminiExchange = Extract<ProviderHttpResult, { success: true }>;
type ParsedChunk =
  { success: true; value: unknown } | { success: false; error: ProviderError };

const invalidStream: ProviderError = {
  code: "GEMINI_INVALID_STREAM",
  message: "Gemini returned an invalid stream",
  category: "validation"
};

// Gemini streams GenerateContentResponse JSON objects in SSE data frames.
export async function* readGeminiChunks(
  exchange: GeminiExchange
): AsyncIterable<ParsedChunk> {
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
  const dispatch = (): ParsedChunk | undefined => {
    if (dataLines.length === 0) return;
    const data = dataLines.join("\n");
    dataLines = [];
    try {
      const value: unknown = JSON.parse(data);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { success: false, error: invalidStream };
      }
      return { success: true, value };
    } catch {
      return { success: false, error: invalidStream };
    }
  };
  const consumeLine = (line: string): ParsedChunk | undefined => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (line === "") return dispatch();
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    if (field !== "data") return;
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    dataLines.push(value);
    return;
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
          if (!item.success) return;
        }
      }
      if (chunk.value.done) {
        if (buffer !== "") {
          const item = consumeLine(buffer);
          if (item) yield item;
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
      // Public errors remain independent of native stream details.
    }
    reader.releaseLock();
    exchange.close();
  }
}
