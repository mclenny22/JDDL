import { useNavigate } from "react-router";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="h-screen bg-white flex flex-col items-center justify-center font-['DM_Sans',sans-serif] gap-4">
      <p className="text-[#232323] text-2xl font-normal">Page not found.</p>
      <button onClick={() => navigate("/")} className="text-sm text-black/40 hover:text-black transition-colors">
        Go home
      </button>
    </div>
  );
}
