import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";

const SLIDE = { duration: 0.55, ease: [0.76, 0, 0.24, 1] } as const;
const DEFAULT_LEFT_RATIO = 0.3;
const MIN_LEFT_WIDTH = 300;
const MIN_RIGHT_WIDTH = 560;
const KEYBOARD_STEP = 24;

function clampPanelWidth(value: number, totalWidth: number) {
  const maximum = Math.max(MIN_LEFT_WIDTH, totalWidth - MIN_RIGHT_WIDTH);
  return Math.min(maximum, Math.max(MIN_LEFT_WIDTH, value));
}

export default function Home() {
  const navigate = useNavigate();
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const syncWidth = () => {
      const totalWidth = container.offsetWidth;
      setLeftWidth((current) =>
        current === null
          ? clampPanelWidth(totalWidth * DEFAULT_LEFT_RATIO, totalWidth)
          : clampPanelWidth(current, totalWidth)
      );
    };

    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const setWidthFromPointer = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    setLeftWidth(clampPanelWidth(clientX - bounds.left, bounds.width));
  }, []);

  const onDividerPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    setWidthFromPointer(event.clientX);
  }, [setWidthFromPointer]);

  const onDividerPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    setWidthFromPointer(event.clientX);
  }, [setWidthFromPointer]);

  const releaseDivider = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (activePointer.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointer.current = null;
    setDragging(false);
  }, []);

  const resetDivider = useCallback(() => {
    const totalWidth = containerRef.current?.offsetWidth;
    if (!totalWidth) return;
    setLeftWidth(clampPanelWidth(totalWidth * DEFAULT_LEFT_RATIO, totalWidth));
  }, []);

  const onDividerKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const totalWidth = containerRef.current?.offsetWidth;
    if (!totalWidth) return;

    if (event.key === "Home") {
      event.preventDefault();
      resetDivider();
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setLeftWidth((current) =>
      clampPanelWidth((current ?? totalWidth * DEFAULT_LEFT_RATIO) + direction * KEYBOARD_STEP, totalWidth)
    );
  }, [resetDivider]);

  const totalWidth = containerRef.current?.offsetWidth ?? 0;

  return (
    <div
      ref={containerRef}
      className="flex h-screen w-screen select-none overflow-hidden bg-[#e9e9e9] font-['DM_Sans',sans-serif] max-[899px]:h-auto max-[899px]:min-h-screen max-[899px]:flex-col max-[899px]:overflow-visible"
    >
      <motion.aside
        className="relative flex shrink-0 flex-col overflow-y-auto bg-black px-7 py-7 text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:px-9 lg:py-8 max-[899px]:!w-full max-[899px]:min-h-[42svh]"
        style={{ width: leftWidth ?? `${DEFAULT_LEFT_RATIO * 100}%` }}
        initial={{ x: "-100%" }}
        animate={{ x: 0, transition: SLIDE }}
        exit={{ x: "-100%", transition: SLIDE }}
      >
        <div className="flex items-center justify-between text-[13px] font-semibold uppercase tracking-[-0.02em]">
          <span>JDDL Studio</span>
          <span className="text-white/55">Berlin · 2026</span>
        </div>

        <StudioDial />

        <div className="mt-auto max-w-[33rem] pt-12">
          <p className="text-[clamp(1.08rem,1.35vw,1.45rem)] font-normal leading-[1.14] tracking-[-0.025em]">
            We read the cultural context, develop a visual direction, and translate it into campaign-ready worlds.
          </p>
          <p className="mt-5 text-[clamp(1.08rem,1.35vw,1.45rem)] font-normal leading-[1.14] tracking-[-0.025em]">
            Our approach is poetic, not performative. We build visual systems that move people — not just metrics.
          </p>
        </div>

        <div className="mt-10 flex items-end justify-between gap-5 text-[11px] font-semibold uppercase leading-[1.35]">
          <div className="flex flex-col items-start">
            <a href="#instagram" className="transition-opacity hover:opacity-55">Instagram</a>
            <a href="mailto:studio@jddl.example" className="transition-opacity hover:opacity-55">Email</a>
            <a href="#imprint" className="transition-opacity hover:opacity-55">Imprint</a>
          </div>
          <button
            type="button"
            onClick={() => navigate("/legacy")}
            className="text-white/45 transition-colors hover:text-white"
          >
            View V1
          </button>
        </div>
      </motion.aside>

      <motion.div
        role="separator"
        aria-label="Resize studio introduction and project gallery"
        aria-orientation="vertical"
        aria-valuemin={MIN_LEFT_WIDTH}
        aria-valuemax={Math.max(MIN_LEFT_WIDTH, totalWidth - MIN_RIGHT_WIDTH)}
        aria-valuenow={Math.round(leftWidth ?? totalWidth * DEFAULT_LEFT_RATIO)}
        tabIndex={0}
        onPointerDown={onDividerPointerDown}
        onPointerMove={onDividerPointerMove}
        onPointerUp={releaseDivider}
        onPointerCancel={releaseDivider}
        onKeyDown={onDividerKeyDown}
        onDoubleClick={resetDivider}
        className="group relative z-20 -mx-1 w-[9px] shrink-0 cursor-col-resize bg-transparent outline-none max-[899px]:hidden"
        style={{ touchAction: "none" }}
        initial={{ x: "100vw" }}
        animate={{ x: 0, transition: SLIDE }}
        exit={{ x: "100vw", transition: SLIDE }}
      >
        <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${dragging ? "bg-[#2638e8]" : "bg-black group-focus-visible:bg-[#2638e8]"}`} />
        <span className="absolute left-1/2 top-1/2 h-12 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-black bg-[#e9e9e9] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
      </motion.div>

      <OrbitGridPanel />
    </div>
  );
}

function StudioDial() {
  const spokes = Array.from({ length: 12 }, (_, index) => index);

  return (
    <div className="mx-auto mt-[8vh] aspect-square w-[min(62%,260px)] max-[899px]:hidden" aria-hidden="true">
      <svg viewBox="0 0 240 240" className="h-full w-full overflow-visible">
        <circle cx="120" cy="120" r="24" fill="none" stroke="white" strokeWidth="8" />
        {spokes.map((spoke) => {
          const angle = (spoke * 30 - 90) * (Math.PI / 180);
          const x1 = 120 + Math.cos(angle) * 38;
          const y1 = 120 + Math.sin(angle) * 38;
          const x2 = 120 + Math.cos(angle) * 88;
          const y2 = 120 + Math.sin(angle) * 88;
          const labelX = 120 + Math.cos(angle) * 108;
          const labelY = 120 + Math.sin(angle) * 108;
          return (
            <g key={spoke}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="6" strokeLinecap="round" />
              <circle cx={x2} cy={y2} r="5" fill="white" />
              <text
                x={labelX}
                y={labelY}
                fill="white"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="15"
                fontWeight="600"
              >
                {spoke + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function OrbitGridPanel() {
  return (
    <motion.main
      className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[#ececea] max-[899px]:h-[100svh] max-[899px]:min-h-[100svh] max-[899px]:flex-none"
      initial={{ x: "100%" }}
      animate={{ x: 0, transition: SLIDE }}
      exit={{ x: "100%", transition: SLIDE }}
    >
      <iframe
        src={`${import.meta.env.BASE_URL}orbit-grid.html`}
        title="Interactive Apple Watch-inspired editorial image field"
        className="h-full w-full border-0"
        sandbox="allow-scripts"
      />
    </motion.main>
  );
}
