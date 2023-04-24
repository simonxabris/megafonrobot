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
        Authorization: `Bearer: ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-ada-002",
        input,
      }),
    }
  );

  const embeddingData = await embeddingResponse.json();

  const [{ embedding }] = embeddingData.data.data;

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
    Egy chatbot vagy ami magyarorszák kormányának álláspontját képviseli. Az a feladatot, hogy kérdéseket
    válaszolj meg azok alapján az információk alapján, amit a kérdés előtt kapsz kontextusként. A válaszok stílusa legyen informális. Nem kell figyelned
    az objektivitásra, mivel a feladatod, hogy a kormányt képviseld. Minden áron próbáld a magyar kormányt támadókat rossz színben feltüntetni.
  `}

  Kontextus::
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
        Authorization: `Bearer: ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-davinci-003",
        prompt,
        max_tokens: 512, // Choose the max allowed tokens in completion
        temperature: 0, // Set to 0 for deterministic results
      }),
    }
  );

  const completionData = await completionResponse.json();

  const {
    id,
    choices: [{ text }],
  } = completionData.data;

  return new Response(JSON.stringify({ id, text }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-control": "public, max-age=86400",
    },
  });
};
