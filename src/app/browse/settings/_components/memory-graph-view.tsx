"use client";

import { MemoryGraph } from "@supermemory/memory-graph";
import type { DocumentWithMemories } from "@supermemory/memory-graph";
import { useEffect, useState } from "react";

export function MemoryGraphView() {
  const [documents, setDocuments] = useState<DocumentWithMemories[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetch("/api/graph")
      .then((res) => res.json())
      .then((data) => {
        setDocuments((data as { documents?: DocumentWithMemories[] }).documents ?? []);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });
  }, []);

  return (
    <div className="h-full w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-[#1a1a1a]">
      <MemoryGraph
        documents={documents}
        isLoading={isLoading}
        error={error}
        variant="consumer"
        showSpacesSelector={false}
      >
        <div className="flex h-full items-center justify-center text-center">
          <div>
            <p className="text-lg font-medium text-[#888]">No memories yet</p>
            <p className="mt-1 text-base text-[#666]">
              Start browsing and your memory graph will appear here.
            </p>
          </div>
        </div>
      </MemoryGraph>
    </div>
  );
}
