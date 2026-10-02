import { createRoot } from "react-dom/client";
import { SignUpPage } from "./modules/users/infrastructure/ui/pages/sign-up-page/sign-up-page";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(<SignUpPage />);
