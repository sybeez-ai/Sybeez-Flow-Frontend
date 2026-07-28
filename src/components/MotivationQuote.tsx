import { useEffect, useState } from "react";
import { Sparkles, RotateCcw } from "lucide-react";
import { getCachedMotivation, getRandomMotivation, DailyMotivation } from "@/services/motivationService";

interface MotivationQuoteProps {
  allowRefresh?: boolean;
}

const MotivationQuote = ({ allowRefresh = true }: MotivationQuoteProps) => {
  const [motivation, setMotivation] = useState<DailyMotivation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    // Get today's cached motivation on mount
    const today = getCachedMotivation();
    setMotivation(today);
    setImageLoaded(false);
  }, []);

  const handleRefresh = () => {
    setIsLoading(true);
    setImageLoaded(false);
    // Get a random motivation instead
    setTimeout(() => {
      const newMotivation = getRandomMotivation();
      setMotivation(newMotivation);
      setIsLoading(false);
    }, 300);
  };

  if (!motivation) {
    return null;
  }

  return (
    <div className="w-full mb-7">
      <div className="relative group rounded-2xl overflow-hidden glass-card transition-all duration-300 hover:shadow-[0_8px_40px_rgba(0,0,0,0.5)]">
        {/* Background Image */}
        <div className="relative h-48 sm:h-56 overflow-hidden">
          <img
            src={motivation.imageUrl}
            alt="Daily motivation"
            onLoad={() => setImageLoaded(true)}
            className={`w-full h-full object-cover transition-all duration-500 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            } group-hover:scale-105`}
          />
          {/* Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/20 to-black/60" />
          {/* Additional overlay for text contrast */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />
        </div>

        {/* Content */}
        <div className="absolute inset-0 flex flex-col justify-between p-6 sm:p-8">
          {/* Refresh Button */}
          {allowRefresh && (
            <div className="flex justify-end">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md px-3 py-1.5 text-xs sm:text-sm text-white/80 transition-all hover:bg-white/20 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed ring-1 ring-white/10"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          )}

          {/* Quote */}
          <div className="flex flex-col justify-end gap-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-yellow-300 flex-none mt-0.5" />
              <div className="flex-1">
                <p className="text-lg sm:text-xl font-semibold text-white leading-relaxed">
                  "{motivation.quote}"
                </p>
                <p className="mt-2 text-sm text-white/70">— {motivation.author}</p>
              </div>
            </div>

            {/* Theme Badge */}
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 backdrop-blur-md px-3 py-1 text-xs text-white/70 ring-1 ring-white/10 capitalize">
                <span className="w-2 h-2 rounded-full bg-yellow-300" />
                {motivation.theme}
              </div>
            </div>
          </div>
        </div>

        {/* Loading skeleton for image */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gradient-to-b from-muted/40 to-muted/60 animate-pulse" />
        )}
      </div>
    </div>
  );
};

export default MotivationQuote;
