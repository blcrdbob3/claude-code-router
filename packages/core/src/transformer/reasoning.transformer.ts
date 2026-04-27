import { UnifiedChatRequest } from "@/types/llm";
import { Transformer, TransformerOptions } from "../types/transformer";

export class ReasoningTransformer implements Transformer {
  static TransformerName = "reasoning";
  public logger?: any;
  enable: any;

  constructor(private readonly options?: TransformerOptions) {
    this.enable = this.options?.enable ?? true;
  }

  async transformRequestIn(
    request: UnifiedChatRequest
  ): Promise<UnifiedChatRequest> {
    if (!this.enable) {
      request.thinking = {
        effort: "none",
        max_tokens: 0,
        enabled: false,
      };
      request.enable_thinking = false;
      return request;
    }
    if (request.reasoning) {
      request.thinking = {
        effort: request.reasoning.effort ?? "medium",
        max_tokens: request.reasoning.max_tokens,
        enabled: true,
      };
      request.enable_thinking = true;
    }
    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    if (!this.enable) return response;
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      if (jsonResponse.choices[0]?.message.reasoning_content) {
        jsonResponse.thinking = {
          content: jsonResponse.choices[0]?.message.reasoning_content
        }
      }
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      if (!response.body) {
        return response;
      }

      const logger = this.logger;
      const decoder = new TextDecoder();
      const enc = new TextEncoder();
      let reasoningContent = "";
      let isReasoningComplete = false;
      let buffer = "";

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();

          const processLine = (line: string, controller: ReadableStreamDefaultController) => {
            if (logger && logger.debug) {
              logger.debug({ line }, "Processing reason line");
            }

            if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.choices?.[0]?.delta?.reasoning_content) {
                  reasoningContent += data.choices[0].delta.reasoning_content;
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          thinking: {
                            content: data.choices[0].delta.reasoning_content,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  const thinkingLine = `data: ${JSON.stringify(thinkingChunk)}\n\n`;
                  controller.enqueue(enc.encode(thinkingLine));
                  return;
                }

                if (
                  (data.choices?.[0]?.delta?.content ||
                    data.choices?.[0]?.delta?.tool_calls) &&
                  reasoningContent &&
                  !isReasoningComplete
                ) {
                  isReasoningComplete = true;
                  const signature = Date.now().toString();

                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          content: null,
                          thinking: {
                            content: reasoningContent,
                            signature: signature,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  const thinkingLine = `data: ${JSON.stringify(thinkingChunk)}\n\n`;
                  controller.enqueue(enc.encode(thinkingLine));
                }

                if (data.choices?.[0]?.delta?.reasoning_content) {
                  delete data.choices[0].delta.reasoning_content;
                }

                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  if (isReasoningComplete) {
                    data.choices[0].index++;
                  }
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(enc.encode(modifiedLine));
                }
              } catch (e) {
                controller.enqueue(enc.encode(line + "\n"));
              }
            } else {
              controller.enqueue(enc.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, controller);
                } catch (error) {
                  if (logger && logger.error) logger.error("Error processing line: " + line);
                  controller.enqueue(enc.encode(line + "\n"));
                }
              }
            }
          } catch (error) {
            controller.error(error);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              // Ignore close errors
            }
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return response;
  }
}