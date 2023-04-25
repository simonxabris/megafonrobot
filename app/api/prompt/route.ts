import { createClient } from "@supabase/supabase-js";
import { oneLine, stripIndent } from "common-tags";
import GPT3Tokenizer from "gpt3-tokenizer";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseClient = createClient(supabaseUrl!, supabaseKey!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const runtime = "edge";
export const GET = async (request: Request) => {
  const url = new URL(request.url);

  const params = url.searchParams;

  const query = params.get("query");

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

  const textEncoder = new TextEncoder();
  const transformStream = new TransformStream({
    async transform(chunk, controller) {
      const text = chunk;
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.length === 0) continue; // ignore empty message
        if (line.startsWith(":")) continue; // ignore sse comment message
        if (line === "data: [DONE]") {
          controller.terminate(); // Close the stream if the data is done
          break;
        }
        const json = JSON.parse(line.substring(6));
        const choiceText = json.choices?.[0]?.text || "";

        const encodedLine = textEncoder.encode(choiceText); // Encode the transformed stream into bytes
        controller.enqueue(encodedLine);
      }
    },
  });

  const outputReadableStream = completionResponse.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(transformStream);

  return new Response(outputReadableStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-control": "no-transform, public, max-age=86400",
    },
  });
};
