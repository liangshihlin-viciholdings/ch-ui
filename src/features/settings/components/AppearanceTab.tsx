import { Palette, Monitor, Terminal } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useTheme } from "@/components/common/theme-provider";
import { useAppearance } from "@/contexts/AppearanceContext";
import { ThemeCard } from "./ThemeCard";

const DARK_THEMES = [
  {
    value: "dracula",
    label: "Dracula",
    colors: ["#BD93F9", "#FF79C6", "#8BE9FD"],
  },
  { value: "nord", label: "Nord", colors: ["#88C0D0", "#81A1C1", "#5E81AC"] },
  {
    value: "gruvbox-dark",
    label: "Gruvbox Dark",
    colors: ["#FE8019", "#FABD2F", "#B8BB26"],
  },
  {
    value: "tokyo-night",
    label: "Tokyo Night",
    colors: ["#7AA2F7", "#BB9AF7", "#7DCFFF"],
  },
  {
    value: "monokai-pro",
    label: "Monokai Pro",
    colors: ["#FF6188", "#A9DC76", "#FFD866"],
  },
  {
    value: "solarized-dark",
    label: "Solarized Dark",
    colors: ["#268BD2", "#2AA198", "#B58900"],
  },
  {
    value: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    colors: ["#CBA6F7", "#F38BA8", "#89B4FA"],
  },
  {
    value: "ayu-dark",
    label: "Ayu Dark",
    colors: ["#FF8F40", "#59C2FF", "#AAD94C"],
  },
  {
    value: "kanso",
    label: "Kansō",
    colors: ["#7E9CD8", "#957FB8", "#C0A36E"],
  },
  {
    value: "catppuccin-frappe",
    label: "Catppuccin Frappé",
    colors: ["#CA9EE6", "#E78284", "#8CAAEE"],
  },
] as const;

const LIGHT_THEMES = [
  {
    value: "github-light",
    label: "GitHub Light",
    colors: ["#0969DA", "#1A7F37", "#CF222E"],
  },
  {
    value: "gruvbox-light",
    label: "Gruvbox Light",
    colors: ["#AF3A03", "#B57614", "#79740E"],
  },
  {
    value: "catppuccin-latte",
    label: "Catppuccin Latte",
    colors: ["#7287FD", "#EA76CB", "#179299"],
  },
  {
    value: "one-light",
    label: "One Light",
    colors: ["#4078F2", "#C18401", "#50A14F"],
  },
  {
    value: "solarized-light",
    label: "Solarized Light",
    colors: ["#268BD2", "#2AA198", "#B58900"],
  },
  {
    value: "ayu-light",
    label: "Ayu Light",
    colors: ["#FF9940", "#399EE6", "#86B300"],
  },
  {
    value: "rose-pine-dawn",
    label: "Rosé Pine Dawn",
    colors: ["#907AA9", "#B4637A", "#286983"],
  },
] as const;

const FONT_FAMILIES = [
  { value: "system", label: "System Default" },
  { value: "jetbrains-mono", label: "JetBrains Mono" },
  { value: "fira-code", label: "Fira Code" },
  { value: "cascadia-code", label: "Cascadia Code" },
  { value: "source-code-pro", label: "Source Code Pro" },
  { value: "monaco", label: "Monaco" },
  { value: "consolas", label: "Consolas" },
  { value: "ibm-plex-mono", label: "IBM Plex Mono" },
] as const;

const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 32;

export function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const {
    uiFontSize,
    editorFontSize,
    editorFontFamily,
    editorVimMode,
    setUIFontSize,
    setEditorFontSize,
    setEditorFontFamily,
    setEditorVimMode,
  } = useAppearance();

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <Card className="shadow-lg border-muted">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Theme
          </CardTitle>
          <CardDescription>
            Select your preferred color theme for the interface
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Dark Themes</Label>
            <div className="grid grid-cols-2 gap-3">
              {DARK_THEMES.map((themeOption) => (
                <ThemeCard
                  key={themeOption.value}
                  theme={themeOption}
                  isSelected={theme === themeOption.value}
                  onSelect={() => setTheme(themeOption.value)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Light Themes</Label>
            <div className="grid grid-cols-2 gap-3">
              {LIGHT_THEMES.map((themeOption) => (
                <ThemeCard
                  key={themeOption.value}
                  theme={themeOption}
                  isSelected={theme === themeOption.value}
                  onSelect={() => setTheme(themeOption.value)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">System</Label>
            <Card
              className={`cursor-pointer transition-all duration-200 ${
                theme === "system"
                  ? "border-primary ring-2 ring-primary"
                  : "border-muted hover:border-primary/50"
              }`}
              onClick={() => setTheme("system")}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <span className="font-semibold">System Preference</span>
                    <p className="text-xs text-muted-foreground">
                      Automatically match your OS theme
                    </p>
                  </div>
                </div>
              </CardContent>
      </Card>

      {/* Editor Settings */}
      <Card className="shadow-lg border-muted">
        <CardHeader>
          <CardTitle className="text-2xl font-bold flex items-center gap-2">
            <Terminal className="h-6 w-6 text-primary" />
            Editor Settings
          </CardTitle>
          <CardDescription>
            Configure advanced editor behavior and keybindings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Vim Mode Toggle */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="vim-mode" className="text-sm font-medium">
                Vim Mode
              </Label>
              <p className="text-xs text-muted-foreground">
                Enable vim keybindings in the SQL editor. Includes motions, modes,
                surround operations (gsa/gsr/gsd), and relative line numbers.
              </p>
            </div>
            <Switch
              id="vim-mode"
              checked={editorVimMode}
              onCheckedChange={setEditorVimMode}
            />
          </div>
        </CardContent>
      </Card>

          </div>
        </CardContent>
      </Card>

      {/* Font Settings */}
      <Card className="shadow-lg border-muted">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Font Settings</CardTitle>
          <CardDescription>
            Adjust font family and sizes for the interface and code editor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Editor Font Family */}
          <div className="space-y-2">
            <Label htmlFor="font-family">Editor Font Family</Label>
            <Select value={editorFontFamily} onValueChange={setEditorFontFamily}>
              <SelectTrigger id="font-family" className="w-full">
                <SelectValue placeholder="Select font family" />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select the font family for the Monaco code editor. Fonts with
              ligature support will have them enabled automatically.
            </p>
          </div>

          {/* UI Font Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="ui-font-size" className="text-sm font-medium">
                UI Font Size
              </Label>
              <span className="text-sm font-mono text-muted-foreground">
                {uiFontSize}px
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-8 text-right">
                {FONT_SIZE_MIN}
              </span>
              <Slider
                id="ui-font-size"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={[uiFontSize]}
                onValueChange={(value) => setUIFontSize(value[0])}
                className="flex-1"
                aria-label="UI Font Size"
              />
              <span className="text-xs text-muted-foreground w-8">
                {FONT_SIZE_MAX}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Controls the font size for buttons, labels, menus, and other UI
              elements
            </p>
          </div>

          {/* Editor Font Size */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="editor-font-size" className="text-sm font-medium">
                Editor Font Size
              </Label>
              <span className="text-sm font-mono text-muted-foreground">
                {editorFontSize}px
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted-foreground w-8 text-right">
                {FONT_SIZE_MIN}
              </span>
              <Slider
                id="editor-font-size"
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                step={1}
                value={[editorFontSize]}
                onValueChange={(value) => setEditorFontSize(value[0])}
                className="flex-1"
                aria-label="Editor Font Size"
              />
              <span className="text-xs text-muted-foreground w-8">
                {FONT_SIZE_MAX}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Controls the font size for the Monaco code editor
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
