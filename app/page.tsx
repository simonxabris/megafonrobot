"use client";
import { Inter } from "next/font/google";
import { FormEvent, useRef, useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Loader2, Send } from "lucide-react";
import clsx from "clsx";
import { Prompt } from "../components/question";
import { Conversation } from "./types";

const inter = Inter({ subsets: ["latin"] });

const presets = [
  "Mit gondolsz Karácsony Gergelyrol?",
  "Ki mozgatja Karácsony Gergelyt?",
  "Mit buktatott le legutóbb Bohár Dániel?",
  "Miért támadja Brüsszel Magyarországot?",
];
const questions = [
  {
    role: "user",
    content: "Hogy tervezi Gyurcsany Ferenc elfoglalni a bal oldalt?",
  },
];

const Home = () => {
  const [answer, setAnswer] = useState<string | undefined>();
  const [conversation, setConversation] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

    const newConversation: Conversation[] = [
      ...conversation,
      { content: prompt, role: "user" },
    ];

    setConversation(newConversation);

    const response = await fetch(`/api/prompt`, {
      method: "POST",
      headers: {
        "Content-type": "application/json",
      },
      body: JSON.stringify({
        prompt: newConversation,
      }),
    });

    const reader = response.body!.getReader();

    const textDecoder = new TextDecoder();

    setConversation((c) => [...c, { role: "system", content: "" }]);

    // Read data from the stream
    async function readData() {
      try {
        const { value, done } = await reader.read();
        if (done) {
          setLoading(false);
          return;
        }

        const text = textDecoder.decode(value);

        setConversation((c) => {
          return [
            ...c.slice(0, -1),
            { role: "system", content: `${c.at(-1).content}${text}` },
          ];
        });

        // Continue reading the stream
        await readData();
      } catch (error) {
        setAnswer("Error reading stream");
      }
    }

    await readData();
  };

  const presetClick = (preset: string) => {
    if (inputRef.current) {
      inputRef.current.value = preset;
      inputRef.current.form?.dispatchEvent(
        new Event("submit", { cancelable: true, bubbles: true })
      );
    }
  };

  return (
    <main
      style={{ minHeight: "100svh" }}
      className="dark:bg-black flex flex-col items-center justify-between p-2 sm:p-8"
    >
      <h1 className="text-xl font-bold">Megafon Robot szolgálatra kész</h1>

      <div className="overflow-scroll">
        {conversation.length > 0 ? (
          <>
            {conversation.map(({ content, role }) => (
              <>
                <Prompt className="mb-8">
                  <p className="mb-4">
                    {role === "system" ? "V" : "K"}: {content}
                  </p>
                </Prompt>
              </>
            ))}
          </>
        ) : loading ? (
          <Loader2 className="animate-spin" />
        ) : (
          <div>
            <p className="text-center mb-8">
              Válassz az alábbi kérdések közül vagy írj egy sajátot:
            </p>
            <div className="flex flex-col sm:grid gap-4 sm:grid-cols-3 sm:grid-rows-3">
              {presets.map((preset, index) => (
                <Button
                  type="button"
                  onClick={() => presetClick(preset)}
                  variant="secondary"
                  key={index}
                >
                  {preset}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
      <form
        className="fixed bottom-0 inset-x-0 p-2 sm:p-8 bg-black  w-full flex flex-col sm:flex-row"
        onSubmit={onSubmit}
      >
        <Input
          ref={inputRef}
          disabled={loading}
          className={clsx(loading === true && "opacity-40")}
          placeholder=""
          name="prompt"
        />
        <Button disabled={loading} className={`mt-2 sm:ml-2 sm:mt-0 `}>
          Küldés
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
