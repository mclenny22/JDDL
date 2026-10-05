import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { projects, type Project } from "@/data/projects";

const SLIDE = { duration: 0.55, ease: [0.76, 0, 0.24, 1] } as const;

const ALL_TAGS = ["Branding", "Web", "Graphic", "CGI", "Illustration", "Editorial", "Merchandise", "Spatial", "Packaging"];
const MIN_WIDTH = 500;

export default function HomeLegacy() {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftWidth, setLeftWidth] = useState<number | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (leftWidth === null && containerRef.current) {
      setLeftWidth(containerRef.current.offsetWidth * 0.42);
    }
  }, [leftWidth]);

  const onDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startX.current = e.clientX;
      startWidth.current = leftWidth ?? (containerRef.current?.offsetWidth ?? 800) * 0.42;

      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current || !containerRef.current) return;
        const totalWidth = containerRef.current.offsetWidth;
        const delta = e.clientX - startX.current;
        const next = Math.min(totalWidth - MIN_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
        setLeftWidth(next);
      };

      const onMouseUp = () => {
        dragging.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [leftWidth]
  );

  const toggleTag = (tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const clearTags = () => setActiveTags([]);

  const filteredProjects =
    activeTags.length === 0 ? projects : projects.filter((p) => activeTags.some((t) => p.tags.includes(t)));

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen flex overflow-hidden font-['DM_Sans',sans-serif] select-none"
    >
      {/* Left panel — scrollable manifesto */}
      <motion.div
        className="shrink-0 overflow-y-auto bg-white px-8 py-8 lg:px-10 lg:py-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ width: leftWidth ?? "42%" }}
        initial={{ x: "-100%" }}
        animate={{ x: 0, transition: SLIDE }}
        exit={{ x: "-100%", transition: SLIDE }}
      >
        <p
          className="text-[clamp(1.6rem,3vw,3.2rem)] leading-[1.12] text-black font-normal tracking-[-0.01em]"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          <span className="block mb-[0.9em]">We believe brands need more than design.</span>
          <span className="block mb-[0.9em]">They need cultural authorship.</span>
          <span className="block mb-[0.9em]">
            We bring together artists, designers, and creative thinkers who understand how visual culture moves.
          </span>
          <span className="block mb-[0.9em]">
            We help brands develop a distinct point of view and turn it into campaign worlds, visual languages, and
            creative systems that feel connected to contemporary culture.
          </span>
          <span className="block mb-[0.9em]">We combine individual artistic edge with collective structure.</span>
          <span className="block">
            We are not here to make brands look polished. We are here to make them feel present, specific, and
            culturally alive.
          </span>
        </p>
      </motion.div>

      {/* Draggable divider */}
      <motion.div
        onMouseDown={onDividerMouseDown}
        className="w-[5px] shrink-0 bg-[#e8e8e8] hover:bg-[#ccc] active:bg-[#bbb] cursor-col-resize transition-colors duration-150 z-10 relative flex items-center justify-center"
        initial={{ x: "100vw" }}
        animate={{ x: 0, transition: SLIDE }}
        exit={{ x: "100vw", transition: SLIDE }}
      >
        <div className="absolute w-8 h-8 rounded-full bg-white shadow-md border border-[#e0e0e0] flex items-center justify-center gap-[3px] pointer-events-none">
          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
            <path d="M3.5 1L1 5L3.5 9" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8.5 1L11 5L8.5 9" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </motion.div>

      {/* Right panel — dark, with filter + grid */}
      <motion.div
        className="flex-1 flex flex-col bg-[#111] overflow-hidden"
        initial={{ x: "100%" }}
        animate={{ x: 0, transition: SLIDE }}
        exit={{ x: "100%", transition: SLIDE }}
      >
        {/* Sticky filter row */}
        <div className="shrink-0 px-5 py-4 flex flex-wrap gap-[6px] items-center border-b border-white/10">
          <button
            onClick={clearTags}
            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors leading-tight ${
              activeTags.length === 0 ? "bg-white text-[#111]" : "bg-white/10 text-white/60 hover:bg-white/15"
            }`}
          >
            All
          </button>

          {ALL_TAGS.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors leading-tight border ${
                  active
                    ? "bg-white text-[#111] border-white"
                    : "bg-transparent text-white/60 border-white/25 hover:border-white/50 hover:text-white/80"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* Scrollable thumbnail grid */}
        <div className="flex-1 overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="columns-2 gap-3 space-y-3">
            {filteredProjects.map((project) => (
              <ThumbnailCard key={project.id} project={project} />
            ))}
          </div>

          {filteredProjects.length === 0 && (
            <div className="flex items-center justify-center h-40 text-white/30 text-sm">
              No projects match the selected filters.
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ThumbnailCard({ project }: { project: Project }) {
  const [hovered, setHovered] = useState(false);
  const navigate = useNavigate();

  return (
    <div
      className={`relative overflow-hidden rounded-2xl cursor-pointer break-inside-avoid ${project.aspect}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/project/${project.id}`)}
    >
      {/* Image */}
      <img
        src={project.image}
        alt={project.title}
        className={`absolute inset-0 w-full h-full object-cover transition-[filter,brightness] duration-300 ease-in-out ${
          hovered ? "blur-[6px] brightness-75" : "blur-0 brightness-100"
        }`}
      />

      {/* Tag pills — always visible */}
      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-10">
        {project.tags.map((tag) => (
          <span
            key={tag}
            className="bg-white text-[#232323] text-[12px] font-semibold px-3 py-1 rounded-full leading-tight"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Hover overlay — description bottom-left */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-end p-4 transition-opacity duration-300 ease-in-out ${
          hovered ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex flex-col items-start text-left">
          <p className="text-white/50 text-[10px] font-medium uppercase tracking-widest mb-0.5 leading-tight">
            {project.client}
          </p>
          <p className="text-white text-[14px] font-medium leading-snug mb-1">{project.title}</p>
          <p className="text-white/70 text-[12px] font-light leading-snug max-w-[220px]">{project.description}</p>
        </div>
      </div>
    </div>
  );
}
