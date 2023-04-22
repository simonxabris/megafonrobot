"use client";
import { Inter } from "next/font/google";
import { FormEvent, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Loader2, Send } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

const Home = () => {
  const [answer, setAnswer] = useState("Ask a question first");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);

    const formData = new FormData(event.target as HTMLFormElement);

    const prompt = formData.get("prompt");

    if (!prompt) {
      return;
    }

    const response = await fetch("/api/prompt", {
      method: "POST",
      body: JSON.stringify({
        query: prompt,
      }),
    });

    const { text } = await response.json();

    setAnswer(text);
    setLoading(false);
  };

  return (
    <main className="dark:bg-black flex min-h-screen flex-col items-center justify-between p-8">
      <h1 className="text-xl font-bold">Megafon robot ready to serve</h1>
      <p>{answer}</p>
      <form className="w-full flex" onSubmit={onSubmit}>
        <Input placeholder="" name="prompt" />
        <Button disabled={loading} className="ml-2">
          Send
          {loading ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="ml-2 h-4 w-4" />
          )}
        </Button>
      </form>
    </main>
  );
};

export default Home;
