import { createMemoryRouter } from "react-router";
import Root from "./Root";
import Home from "./pages/Home";
import HomeLegacy from "./pages/HomeLegacy";
import ProjectPage from "./pages/ProjectPage";
import NotFound from "./pages/NotFound";

export const router = createMemoryRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Home },
      { path: "legacy", Component: HomeLegacy },
      { path: "project/:id", Component: ProjectPage },
      { path: "*", Component: NotFound },
    ],
  },
]);
