"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  rating: number;
  count?: number;
  onRate?: (rating: number) => void;
  readonly?: boolean;
}

export default function StarRating({
  rating,
  count,
  onRate,
  readonly = false,
}: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const displayRating = hovered !== null ? hovered : rating;

  const getStarFill = (starIndex: number): "full" | "half" | "empty" => {
    const value = displayRating;
    if (value >= starIndex) return "full";
    if (value >= starIndex - 0.5) return "half";
    return "empty";
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = getStarFill(star);
          return (
            <button
              key={star}
              type="button"
              disabled={readonly}
              onClick={() => onRate && onRate(star)}
              onMouseEnter={() => !readonly && setHovered(star)}
              onMouseLeave={() => !readonly && setHovered(null)}
              className={`relative ${readonly ? "cursor-default" : "cursor-pointer hover:scale-110"} transition-transform duration-100`}
              aria-label={`Rate ${star} stars`}
            >
              {fill === "half" ? (
                <span className="relative inline-block w-4 h-4">
                  <Star size={16} className="absolute inset-0 text-slate-600" fill="transparent" />
                  <span className="absolute inset-0 overflow-hidden w-1/2">
                    <Star size={16} className="text-amber-400" fill="currentColor" />
                  </span>
                </span>
              ) : (
                <Star
                  size={16}
                  className={fill === "full" ? "text-amber-400" : "text-slate-600"}
                  fill={fill === "full" ? "currentColor" : "transparent"}
                />
              )}
            </button>
          );
        })}
      </div>
      {count !== undefined && (
        <span className="text-slate-400 text-sm">
          {rating.toFixed(1)} ({count.toLocaleString()})
        </span>
      )}
    </div>
  );
}
