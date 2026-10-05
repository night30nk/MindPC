import { useNavigate, useLocation } from "react-router";
import { getUserTimeZone } from "./api";

const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    user = null;
  }

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const isAuthPage = location.pathname === "/login";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div
            onClick={() => navigate("/")}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-500 transition-colors">
              M
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-white">
                MindPC
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs font-medium text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">
                Web Dashboard
              </span>
            </div>
          </div>

          {!isAuthPage && token && (
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-slate-200">
                  {user?.name || user?.email || "User"}
                </span>
                <span className="text-xs text-slate-400">
                  {getUserTimeZone()}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Page Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>

      {/* Minimal Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        MindPC &copy; {new Date().getFullYear()} — Digital Wellbeing & Productivity Tracker
      </footer>
    </div>
  );
};

export default Layout;
