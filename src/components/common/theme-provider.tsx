import { createContext, useContext, useEffect, useState } from "react"

export type Theme =
  | "dracula"
  | "nord"
  | "gruvbox-dark"
  | "tokyo-night"
  | "monokai-pro"
  | "solarized-dark"
  | "catppuccin-mocha"
  | "ayu-dark"
  | "kanso"
  | "catppuccin-frappe"
  | "github-light"
  | "gruvbox-light"
  | "catppuccin-latte"
  | "one-light"
  | "solarized-light"
  | "ayu-light"
  | "rose-pine-dawn"
  | "hyperdx"
  | "system"

const LIGHT_THEMES: Theme[] = [
  "github-light", "gruvbox-light", "catppuccin-latte", "one-light",
  "solarized-light", "ayu-light", "rose-pine-dawn",
];
const DARK_THEMES: Theme[] = [
  "dracula", "nord", "gruvbox-dark", "tokyo-night",
  "monokai-pro", "solarized-dark", "catppuccin-mocha", "ayu-dark", "kanso", "catppuccin-frappe",
  "hyperdx",
];

export function isLightTheme(theme: Theme): boolean {
  if (theme === "system") {
    return !window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return LIGHT_THEMES.includes(theme);
}

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "kanso",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "kanso",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  useEffect(() => {
    const root = window.document.documentElement

    // Remove all theme classes
    root.classList.remove(
      "dracula",
      "nord",
      "gruvbox-dark",
      "tokyo-night",
      "monokai-pro",
      "solarized-dark",
      "catppuccin-mocha",
      "ayu-dark",
      "kanso",
      "catppuccin-frappe",
      "github-light",
      "gruvbox-light",
      "catppuccin-latte",
      "one-light",
      "solarized-light",
      "ayu-light",
      "rose-pine-dawn",
      "hyperdx",
      "dark"
    )

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dracula"
        : "github-light"

      root.classList.add(systemTheme)
      return
    }

    // Apply the selected theme
    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme)
      setTheme(theme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
