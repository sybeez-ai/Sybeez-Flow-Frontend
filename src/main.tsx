import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { patchLifeManagementPersist } from "@/services/persistSync";

// Persist Finance/Planner dashboard data: localStorage + backend sync (per user after login)
patchLifeManagementPersist();

createRoot(document.getElementById("root")!).render(<App />);
