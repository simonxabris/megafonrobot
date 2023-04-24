import { createClient } from "@supabase/supabase-js";
import GPT3Tokenizer from "gpt3-tokenizer";
import { Configuration, OpenAIApi } from "openai";
import { stripIndent, oneLine } from "common-tags";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseClient = createClient(supabaseUrl!, supabaseKey!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export const GET = async (request: Request) => {
  const url = new URL(request.url);

  const params = url.searchParams;

  const query = params.get("query");

  if (!query) {
    return new Response("Bad Request", { status: 400 });
  }

  // OpenAI recommends replacing newlines with spaces for best results
  const input = query.replace(/\n/g, " ");

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);

  // Generate a one-time embedding for the query itself
  const embeddingResponse = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input,
  });

  const [{ embedding }] = embeddingResponse.data.data;

  // Fetching whole documents for this simple example.
  //
  // Ideally for context injection, documents are chunked into
  // smaller sections at earlier pre-processing/embedding step.
  const response = await supabaseClient.rpc("match_documents", {
    query_embedding: embedding,
    similarity_threshold: 0.5, // Choose an appropriate threshold for your data
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
    válaszolj meg azok alapján az információk alapján, amit a kérdés előtt kapsz kontextusként, de ezeken
    kívül bármilyen más információt is felhasználhatsz. A válaszok stílusa legyen informális. Nem kell figyelned
    az objektivitásra, mivel a feladatod, hogy a kormányt képviseld.
  `}

  Kontextus::
  ${contextText}

  Kérdés: """
  ${query}
  """

  Válasz:
`;

  // In production we should handle possible errors
  const completionResponse = await openai.createCompletion({
    model: "text-davinci-003",
    prompt,
    max_tokens: 512, // Choose the max allowed tokens in completion
    temperature: 0, // Set to 0 for deterministic results
  });

  const {
    id,
    choices: [{ text }],
  } = completionResponse.data;

  return new Response(JSON.stringify({ id, text }), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-control": "public, max-age=86400",
    },
  });
};
