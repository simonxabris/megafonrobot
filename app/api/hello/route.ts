export async function POST(request: Request) {
  const data = await request.text();

  console.log("data: ", data);

  return new Response("Hello, Next.js!");
}
