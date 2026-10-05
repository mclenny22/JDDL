import { useParams, useNavigate } from "react-router";
import { motion } from "motion/react";
import { projects } from "@/data/projects";
import { ArrowLeft } from "lucide-react";

const DETAIL_IMAGES = [
  "https://images.unsplash.com/photo-1561070791-2526d30994b5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=900&q=80",
  "https://images.unsplash.com/photo-1561070791-36c11767b26a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&w=900&q=80",
];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="h-screen bg-[#111] flex items-center justify-center text-white/40 font-['DM_Sans',sans-serif]">
        Project not found.
      </div>
    );
  }

  return (
    <motion.div
      className="h-screen bg-[#111] font-['DM_Sans',sans-serif] text-white overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 } }}
      exit={{ opacity: 0, transition: { duration: 0.25, ease: "easeIn" } }}
    >
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-6 left-6 z-50 flex items-center gap-2 text-white/60 hover:text-white transition-colors duration-200 text-sm font-medium group"
      >
        <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
        Back
      </button>

      <div className="max-w-5xl mx-auto px-8 pt-24 pb-28">

        {/* Hero image */}
        <div className="w-full rounded-2xl overflow-hidden mb-12">
          <img src={project.image} alt={project.title} className="w-full object-cover max-h-[70vh]" />
        </div>

        {/* Meta row */}
        <div className="flex items-start justify-between gap-8 mb-8">
          <div>
            <p className="text-white/40 text-[11px] font-medium uppercase tracking-widest mb-2">
              {project.client}
            </p>
            <h1 className="text-[clamp(2.4rem,5vw,4rem)] font-normal leading-[1.05] tracking-[-0.02em]">
              {project.title}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 pt-1 shrink-0">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="bg-white/10 text-white text-[12px] font-semibold px-3 py-1 rounded-full leading-tight border border-white/15"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 mb-10" />

        {/* Intro copy */}
        <div className="max-w-2xl mb-16">
          <p className="text-white/50 text-[15px] leading-relaxed mb-6 font-normal">{project.description}</p>
          <p className="text-white/80 text-[17px] leading-[1.75] font-light">{project.longDescription}</p>
        </div>

        {/* Section — Approach */}
        <div className="grid grid-cols-2 gap-12 mb-16 items-start">
          <div>
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-widest mb-4">Approach</p>
            <p className="text-white/75 text-[16px] leading-[1.8] font-light">
              Every project begins with a period of immersion — understanding not just what a brand does, but where it
              sits culturally and where it could go. We resist the urge to resolve ambiguity too quickly. The
              interesting work lives in the tension before clarity arrives.
            </p>
          </div>
          <div>
            <p className="text-white/30 text-[11px] font-medium uppercase tracking-widest mb-4">Outcome</p>
            <p className="text-white/75 text-[16px] leading-[1.8] font-light">
              The result is a system that moves — one that gives the brand room to grow without losing coherence.
              Not a rulebook but a sensibility. Something the team can carry into spaces we never anticipated and
              still recognise as theirs.
            </p>
          </div>
        </div>

        {/* Side-by-side images */}
        <div className="grid grid-cols-2 gap-3 mb-16">
          {DETAIL_IMAGES.map((src, i) => (
            <div key={i} className="rounded-2xl overflow-hidden aspect-[4/5]">
              <img src={src} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>

        {/* Section — Credits */}
        <div className="border-t border-white/10 pt-10">
          <p className="text-white/30 text-[11px] font-medium uppercase tracking-widest mb-6">Credits</p>
          <div className="grid grid-cols-3 gap-8">
            {[
              { role: "Creative Direction", name: "Studio" },
              { role: "Design", name: "Studio & Partners" },
              { role: "Photography", name: "On location" },
            ].map(({ role, name }) => (
              <div key={role}>
                <p className="text-white/35 text-[12px] mb-1">{role}</p>
                <p className="text-white/70 text-[14px] font-medium">{name}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
