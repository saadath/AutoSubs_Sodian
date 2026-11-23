import { useState } from "react";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mic, History, Cpu, FolderOpen, Settings, Info, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import RecorderPage from "@/pages/RecorderPage";
import HistoryPage from "@/pages/HistoryPage";
import ModelsPage from "@/pages/ModelsPage";
import AudioLibraryPage from "@/pages/AudioLibraryPage";
import SettingsPage from "@/pages/SettingsPage";
import AboutPage from "@/pages/AboutPage";

type NavKey = "recorder" | "history" | "models" | "library" | "settings" | "about";

const navItems: { key: NavKey; label: string; icon: any }[] = [
  { key: "recorder", label: "Recorder", icon: Mic },
  { key: "history", label: "History", icon: History },
  { key: "models", label: "AI Models", icon: Cpu },
  { key: "library", label: "Audio Library", icon: FolderOpen },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "about", label: "About", icon: Info },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

function Shell() {
  const [active, setActive] = useState<NavKey>("recorder");

  return (
    <div className="h-screen flex bg-background text-foreground">
      <aside className="w-60 border-r bg-card/50 flex flex-col">
        <div className="px-4 py-5 border-b">
          <div className="text-lg font-semibold tracking-tight">Offline STT</div>
          <div className="text-xs text-muted-foreground">Professional Speech to Text</div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const selected = active === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActive(item.key)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  selected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">v1.0.0</span>
          <ThemeToggle />
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        {active === "recorder" && <RecorderPage />}
        {active === "history" && <HistoryPage />}
        {active === "models" && <ModelsPage />}
        {active === "library" && <AudioLibraryPage />}
        {active === "settings" && <SettingsPage />}
        {active === "about" && <AboutPage />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Shell />
      </TooltipProvider>
    </ThemeProvider>
  );
}
