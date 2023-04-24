"use client";
import { Inter } from "next/font/google";
import { FormEvent, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Loader2, Send } from "lucide-react";
import clsx from "clsx";

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

    const prompt = formData.get("prompt") as string;

    if (!prompt) {
      return;
    }

    const response = await fetch(
      `/api/prompt?query=${encodeURIComponent(prompt)}`,
      {
        method: "GET",
      }
    );

    const { text } = await response.json();

    setAnswer(text);
    setLoading(false);
  };

  return (
    <main
      style={{ minHeight: "100svh" }}
      className="dark:bg-black flex flex-col items-center justify-between p-8"
    >
      <h1 className="text-xl font-bold">Megafon robot ready to serve</h1>
      <p>{answer}</p>
      <form className="w-full flex flex-col sm:flex-row" onSubmit={onSubmit}>
        <Input
          disabled={loading}
          className={`${clsx(loading === true && "opacity-40")}`}
          placeholder=""
          name="prompt"
        />
        <Button disabled={loading} className={`mt-2 sm:ml-2 sm:mt-0 `}>
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
