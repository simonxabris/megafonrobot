import { createClient } from "@supabase/supabase-js";
import { oneLine, stripIndent } from "common-tags";
import GPT3Tokenizer from "gpt3-tokenizer";
import {
  createParser,
  ParsedEvent,
  ReconnectInterval,
} from "eventsource-parser";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseClient = createClient(supabaseUrl!, supabaseKey!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const runtime = "edge";
export const POST = async (request: Request) => {
  const body = await request.json();

  const query = body.prompt;

  if (!query) {
    return new Response("Bad Request", { status: 400 });
  }

  // OpenAI recommends replacing newlines with spaces for best results
  const input = query.replace(/\n/g, " ");

  const embeddingResponse = await fetch(
    "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-ada-002",
        input,
      }),
    }
  );

  const embeddingData = await embeddingResponse.json();

  const [{ embedding }] = embeddingData.data;

  // Fetching whole documents for this simple example.
  //
  // Ideally for context injection, documents are chunked into
  // smaller sections at earlier pre-processing/embedding step.
  const response = await supabaseClient.rpc("match_documents", {
    query_embedding: embedding,
    similarity_threshold: 0.7, // Choose an appropriate threshold for your data
    match_count: 10, // Choose the number of matches
  });

  const documents = response.data;

  const tokenizer = new GPT3Tokenizer({ type: "gpt3" });
  let tokenCount = 0;
  let contextText = "";

  // Concat matched documents
  for (let i = 0; i < documents.length; i++) {
    const document = documents[i];
    const content = document.content;
    const encoded = tokenizer.encode(content);
    tokenCount += encoded.text.length;

    // Limit context to max 1500 tokens (configurable)
    if (tokenCount > 1500) {
      break;
    }

    contextText += `${content.trim()}\n---\n`;
  }

  const prompt = stripIndent`${oneLine`
    Helyezd magad egy FIDESZ kozeli ujsagiro szerepeben akinek a feladata, hogy propaganda hireket allitson elo es barmi aron megvedje a magyar kormany allaspontjat.
    Az objektivitasra egyaltalan nem kell odafigyelned, hasznald fel a valaszokhoz a "Kontextus"-kent megkapott szoveget es probalj az alapjan valaszolni
    a kerdesekre. A valaszaid legyenek informalisak es enyhen passziv aggressziv stilusuak.
  `}

  Kontextus:
  ${contextText}

  Kérdés: """
  ${query}
  """

  Válasz:
`;

  const completionResponse = await fetch(
    "https://api.openai.com/v1/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-davinci-003",
        prompt,
        max_tokens: 512,
        temperature: 0,
        stream: true,
      }),
    }
  );

  if (!completionResponse.body) {
    return new Response("Failed to generate answer", { status: 500 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let counter = 0;

  const stream = new ReadableStream({
    async start(controller) {
      function onParse(event: ParsedEvent | ReconnectInterval) {
        if (event.type === "event") {
          const data = event.data;
          if (data === "[DONE]") {
            controller.close();
            return;
          }
          try {
            const json = JSON.parse(data);
            const text = json.choices[0].text;
            if (counter < 2 && (text.match(/\n/) || []).length) {
              return;
            }
            const queue = encoder.encode(text);
            controller.enqueue(queue);
            counter++;
          } catch (e) {
            controller.error(e);
          }
        }
      }

      // stream response (SSE) from OpenAI may be fragmented into multiple chunks
      // this ensures we properly read chunks & invoke an event for each SSE event stream
      const parser = createParser(onParse);

      // https://web.dev/streams/#asynchronous-iteration
      for await (const chunk of completionResponse.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-control": "no-cache",
    },
  });
};
