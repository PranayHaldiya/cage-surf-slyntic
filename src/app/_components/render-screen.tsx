"use client";

import { useState } from "react";

interface RenderScreenProps {
  type: "select-one" | "select-multi" | "text" | "auth";
  prompt: string;
  options?: string[];
  onSubmit: (value: string) => void;
}

function SubmitButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-full bg-[#34D399] px-10 py-4 text-base font-semibold text-[#0C0F15] transition-all duration-300 hover:bg-[#2BBD88] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399]"
    >
      {children}
    </button>
  );
}

function OptionButton({
  onClick,
  selected,
  children,
}: {
  onClick: () => void;
  selected?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`cursor-pointer rounded-xl border px-6 py-4 text-left text-base font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34D399] ${
        selected
          ? "border-[#34D399] bg-[#34D399]/10 text-[#E4E2DC]"
          : "border-white/10 bg-[#151920] text-[#E4E2DC] hover:border-[#34D399]/40 hover:shadow-sm"
      }`}
    >
      {children}
    </button>
  );
}

function StepHeader({ prompt }: { prompt: string }) {
  return (
    <div className="space-y-2 text-center">
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7B838D]">
        Please review this step carefully
      </div>
      <h2 className="text-center text-xl font-bold text-[#E4E2DC]">{prompt}</h2>
    </div>
  );
}

export function RenderScreen({ type, prompt, options, onSubmit }: RenderScreenProps) {
  const [textValue, setTextValue] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  if (type === "select-one") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-[#151920] p-8 shadow-[0_4px_60px_rgba(0,0,0,0.2)]">
        <StepHeader prompt={prompt} />
        <div className="flex w-full max-w-lg flex-col gap-3">
          {options?.map((option) => (
            <OptionButton key={option} onClick={() => onSubmit(option)}>
              {option}
            </OptionButton>
          ))}
        </div>
      </div>
    );
  }

  if (type === "select-multi") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-[#151920] p-8 shadow-[0_4px_60px_rgba(0,0,0,0.2)]">
        <StepHeader prompt={prompt} />
        <div className="flex w-full max-w-lg flex-col gap-3">
          {options?.map((option) => {
            const isSelected = selectedOptions.includes(option);
            return (
              <OptionButton
                key={option}
                selected={isSelected}
                onClick={() =>
                  setSelectedOptions((prev) =>
                    isSelected ? prev.filter((o) => o !== option) : [...prev, option],
                  )
                }
              >
                <span className="mr-3 inline-flex h-5 w-5 items-center justify-center rounded border-2 border-current align-middle">
                  {isSelected && <span className="block h-2.5 w-2.5 rounded-sm bg-[#34D399]" />}
                </span>
                {option}
              </OptionButton>
            );
          })}
        </div>
        <SubmitButton onClick={() => onSubmit(selectedOptions.join(", "))} disabled={selectedOptions.length === 0}>
          Submit
        </SubmitButton>
      </div>
    );
  }

  if (type === "text") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-[#151920] p-8 shadow-[0_4px_60px_rgba(0,0,0,0.2)]">
        <StepHeader prompt={prompt} />
        <textarea
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          placeholder="Type your answer here..."
          className="w-full max-w-lg rounded-xl border border-white/10 bg-[#1C2129] p-4 text-base text-[#E4E2DC] placeholder:text-[#555860] focus:border-[#34D399] focus:outline-none"
          rows={4}
        />
        <SubmitButton onClick={() => onSubmit(textValue)} disabled={!textValue.trim()}>
          Submit
        </SubmitButton>
      </div>
    );
  }

  if (type === "auth") {
    return (
      <div className="flex flex-col items-center gap-6 rounded-2xl bg-[#151920] p-8 shadow-[0_4px_60px_rgba(0,0,0,0.2)]">
        <StepHeader prompt={prompt} />
        <p className="max-w-md text-center text-base leading-relaxed text-[#878A90]">
          Please log in using the browser on the left side of the screen. When you are done, click the button below.
        </p>
        <SubmitButton onClick={() => onSubmit("User completed authentication")}>
          I&apos;m Done Logging In
        </SubmitButton>
      </div>
    );
  }

  return null;
}
