import { Outlet, useLocation } from "react-router";
import { AnimatePresence } from "motion/react";

export default function Root() {
  const location = useLocation();
  return (
    <div className="h-screen w-screen overflow-hidden">
      <AnimatePresence mode="wait">
        <Outlet key={location.pathname} />
      </AnimatePresence>
    </div>
  );
}
