"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
}

export default function SearchBar({ onSearch, initialQuery = "" }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch(query);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, onSearch]);

  return (
    <div className="relative w-full group">
      {/* glow line on focus */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ boxShadow: "0 0 0 1px rgba(2,158,231,0.35), 0 0 20px rgba(2,158,231,0.08)" }}
      />

      <Search
        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-[#029EE7] transition-colors pointer-events-none"
        size={15}
      />

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="// search modules..."
        className="w-full pl-11 pr-10 py-3.5 bg-white/[0.025] border border-white/[0.07] rounded-xl text-white placeholder-slate-700 font-mono text-sm focus:outline-none focus:border-[#029EE7]/30 focus:bg-white/[0.04] transition-all"
        style={{ caretColor: "#029EE7" }}
      />

      {query && (
        <button
          onClick={() => setQuery("")}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
