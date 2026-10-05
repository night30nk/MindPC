import { Routes, Route, Navigate } from "react-router";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/login" element={<Auth />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
