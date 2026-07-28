import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateFromBackend, patchLifeManagementPersist } from "@/services/persistSync";

// Persist Finance/Planner dashboard data: localStorage + backend sync
patchLifeManagementPersist();
void hydrateFromBackend();

createRoot(document.getElementById("root")!).render(<App />);
