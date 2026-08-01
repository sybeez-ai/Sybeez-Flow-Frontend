import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { SYBEEZ_LOGO_SRC } from "@/components/ChatAvatars";
import { useAuth } from "@/contexts/AuthContext";
import {
  clearTourPending,
  isTourDone,
  isTourPending,
  markTourDone,
} from "@/services/authService";

type TourStep = {
  id: string;
  title: string;
  body: string;
  /** CSS selector for spotlight target; omit for centered welcome */
  target?: string;
  placement?: "right" | "left" | "bottom" | "top" | "center";
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Sybeez Flow",
    body: "Your calm personal OS for money, plans, and daily clarity. Take a 30-second tour — you can skip anytime.",
    placement: "center",
  },
  {
    id: "workspace",
    title: "Your workspace",
    body: "Finance, Life Planner, Diary, Gmail, and Documents — each module is one click away from the sidebar.",
    target: "[data-tour='workspace']",
    placement: "right",
  },
  {
    id: "home",
    title: "Home overview",
    body: "Start from Home for a daily finance and productivity snapshot. Open any workspace to use ASK AI when you need help.",
    target: "[data-tour='home-brand']",
    placement: "bottom",
  },
  {
    id: "profile",
    title: "Your profile",
    body: "Account, currency, and feedback live here. Everything stays private to your account.",
    target: "[data-tour='profile']",
    placement: "right",
  },
];

type Rect = { top: number; left: number; width: number; height: number };

function measure(selector?: string): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const AppOnboardingTour = () => {
  const { user, loading } = useAuth();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (loading || !user?.id) return;
    if (isTourDone(user.id)) {
      clearTourPending();
      return;
    }
    if (!isTourPending(user.id)) return;
    const t = window.setTimeout(() => {
      setActive(true);
      setStepIndex(0);
    }, 650);
    return () => window.clearTimeout(t);
  }, [user?.id, loading]);

  const step = STEPS[stepIndex];
  const pad = 10;

  const refresh = useCallback(() => {
    setRect(measure(step?.target));
  }, [step?.target]);

  useLayoutEffect(() => {
    if (!active) return;
    refresh();
    const onResize = () => refresh();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [active, stepIndex, refresh]);

  const finish = useCallback(() => {
    if (user?.id) markTourDone(user.id);
    else clearTourPending();
    setActive(false);
  }, [user?.id]);

  const next = useCallback(() => {
    if (stepIndex >= STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  }, [stepIndex, finish]);

  const cardStyle = useMemo(() => {
    if (!step || step.placement === "center" || !rect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "min(400px, calc(100vw - 32px))",
      } as CSSProperties;
    }
    const gap = 16;
    const width = Math.min(360, window.innerWidth - 32);
    let top = rect.top;
    let left = rect.left + rect.width + gap;
    if (step.placement === "bottom") {
      top = rect.top + rect.height + gap;
      left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    } else if (step.placement === "top") {
      top = Math.max(16, rect.top - 180);
      left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    } else if (step.placement === "left") {
      left = Math.max(16, rect.left - width - gap);
    }
    if (left + width > window.innerWidth - 16) {
      left = Math.max(16, window.innerWidth - width - 16);
    }
    if (top + 220 > window.innerHeight - 16) {
      top = Math.max(16, window.innerHeight - 236);
    }
    return { top, left, width, transform: "none" } as CSSProperties;
  }, [step, rect]);

  if (!active || !step) return null;

  const hole = rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* Dim overlay with spotlight cutout */}
      {hole ? (
        <svg className="absolute inset-0 h-full w-full pointer-events-none" aria-hidden>
          <defs>
            <mask id="sybeez-tour-mask">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={hole.left}
                y={hole.top}
                width={hole.width}
                height={hole.height}
                rx="14"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.72)"
            mask="url(#sybeez-tour-mask)"
          />
          <rect
            x={hole.left}
            y={hole.top}
            width={hole.width}
            height={hole.height}
            rx="14"
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="1.5"
            className="animate-pulse"
          />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" />
      )}

      <div
        className="absolute z-[101] rounded-2xl border border-white/10 bg-[#121212]/95 p-5 shadow-2xl backdrop-blur-xl"
        style={cardStyle}
      >
        <div className="mb-4 flex items-center gap-3">
          <img
            src={SYBEEZ_LOGO_SRC}
            alt=""
            className="h-9 w-9 rounded-xl object-contain bg-white/[0.04] ring-1 ring-white/10"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/40">
              Sybeez Flow · {stepIndex + 1}/{STEPS.length}
            </p>
            <h2 className="text-[17px] font-semibold tracking-tight text-white">{step.title}</h2>
          </div>
        </div>
        <p className="text-[13.5px] leading-relaxed text-white/65">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-[12px] text-white/40 transition-colors hover:text-white/70"
          >
            Skip tour
          </button>
          <button
            type="button"
            onClick={next}
            className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {stepIndex >= STEPS.length - 1 ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AppOnboardingTour;
