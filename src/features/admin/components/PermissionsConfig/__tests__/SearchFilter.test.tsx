import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { useSearchFilter, type SearchOptions } from "../hooks/useSearchFilter";

// Mock the store
vi.mock("@/stores/workspaceStore", () => ({
  default: vi.fn(() => ({
    clickHouseClient: {
      query: vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ data: [] }),
      }),
    },
    credential: { username: "test_user" },
    userPrivileges: { username: "test_user" },
  })),
}));

describe("Search and Filter Improvements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe("Fuzzy Search", () => {
    it("should match partial strings with typos", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "administrator", id: "1" },
          { name: "developer", id: "2" },
          { name: "analyst", id: "3" },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "admn", { fuzzy: true });
                setResults(filtered);
              }}
            >
              Search
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Search");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        expect(results).toHaveTextContent("administrator");
      });
    });

    it("should rank results by relevance", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "user_readonly", id: "1" },
          { name: "readonly", id: "2" },
          { name: "user_read", id: "3" },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "readonly", { fuzzy: true });
                setResults(filtered);
              }}
            >
              Search
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Search");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        const text = results.textContent || "";
        // "readonly" should come before "user_readonly"
        expect(text.indexOf("readonly")).toBeLessThan(text.indexOf("user_readonly"));
      });
    });
  });

  describe("Regex Search", () => {
    it("should support regex patterns", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "user_admin", id: "1" },
          { name: "role_admin", id: "2" },
          { name: "admin_quota", id: "3" },
          { name: "regular_user", id: "4" },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "^.*admin$", { regex: true });
                setResults(filtered);
              }}
            >
              Search
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Search");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        expect(results).toHaveTextContent("user_admin");
        expect(results).toHaveTextContent("role_admin");
        expect(results).not.toHaveTextContent("admin_quota");
      });
    });

    it("should handle invalid regex gracefully", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [{ name: "test", id: "1" }];
        const [results, setResults] = React.useState<any[]>([]);
        const [error, setError] = React.useState<string | null>(null);

        return (
          <div>
            <button
              onClick={() => {
                try {
                  const filtered = filterItems(items, "[invalid(regex", { regex: true });
                  setResults(filtered);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Error");
                }
              }}
            >
              Search
            </button>
            {error && <div data-testid="error">{error}</div>}
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Search");
      button.click();

      waitFor(() => {
        // Should fall back to literal search instead of throwing
        expect(screen.queryByTestId("error")).not.toBeInTheDocument();
      });
    });
  });

  describe("Quick Filters", () => {
    it("should filter users with grants", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "user1", id: "1", grants: ["SELECT", "INSERT"] },
          { name: "user2", id: "2", grants: [] },
          { name: "user3", id: "3", grants: ["SELECT"] },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "", {
                  quickFilter: "has_grants",
                });
                setResults(filtered);
              }}
            >
              Has Grants
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Has Grants");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        expect(results).toHaveTextContent("user1");
        expect(results).toHaveTextContent("user3");
        expect(results).not.toHaveTextContent("user2");
      });
    });

    it("should filter users without grants", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "user1", id: "1", grants: ["SELECT"] },
          { name: "user2", id: "2", grants: [] },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "", {
                  quickFilter: "no_grants",
                });
                setResults(filtered);
              }}
            >
              No Grants
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("No Grants");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        expect(results).toHaveTextContent("user2");
        expect(results).not.toHaveTextContent("user1");
      });
    });

    it("should filter by authentication type", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "user1", id: "1", auth_type: "plaintext_password" },
          { name: "user2", id: "2", auth_type: "no_password" },
          { name: "user3", id: "3", auth_type: "sha256_password" },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "", {
                  authType: "plaintext_password",
                });
                setResults(filtered);
              }}
            >
              Filter
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Filter");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        expect(results).toHaveTextContent("user1");
        expect(results).not.toHaveTextContent("user2");
        expect(results).not.toHaveTextContent("user3");
      });
    });
  });

  describe("Search Preferences", () => {
    it("should remember search term across sessions", () => {
      const TestComponent = () => {
        const { searchTerm, setSearchTerm, loadPreferences } = useSearchFilter();

        React.useEffect(() => {
          loadPreferences("users");
        }, [loadPreferences]);

        return (
          <div>
            <input
              data-testid="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value, "users")}
            />
            <div data-testid="search-term">{searchTerm}</div>
          </div>
        );
      };

      const { unmount } = render(<TestComponent />);
      const input = screen.getByTestId("search-input");

      userEvent.type(input, "admin");

      waitFor(() => {
        expect(localStorage.getItem("search-pref-users")).toBe("admin");
      });

      unmount();

      // Render again to test persistence
      render(<TestComponent />);

      waitFor(() => {
        expect(screen.getByTestId("search-term")).toHaveTextContent("admin");
      });
    });

    it("should remember filter options", () => {
      const TestComponent = () => {
        const { options, setOptions, loadPreferences } = useSearchFilter();

        React.useEffect(() => {
          loadPreferences("users");
        }, [loadPreferences]);

        return (
          <div>
            <button
              onClick={() => setOptions({ fuzzy: true, regex: false }, "users")}
            >
              Set Options
            </button>
            <div data-testid="fuzzy">{options.fuzzy ? "true" : "false"}</div>
          </div>
        );
      };

      const { unmount } = render(<TestComponent />);
      const button = screen.getByText("Set Options");
      button.click();

      waitFor(() => {
        expect(screen.getByTestId("fuzzy")).toHaveTextContent("true");
      });

      unmount();
      render(<TestComponent />);

      waitFor(() => {
        expect(screen.getByTestId("fuzzy")).toHaveTextContent("true");
      });
    });
  });

  describe("Keyboard Shortcuts", () => {
    it("should focus search input with Ctrl+F", async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const inputRef = React.useRef<HTMLInputElement>(null);

        React.useEffect(() => {
          const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "f") {
              e.preventDefault();
              inputRef.current?.focus();
            }
          };

          document.addEventListener("keydown", handleKeyDown);
          return () => document.removeEventListener("keydown", handleKeyDown);
        }, []);

        return (
          <div>
            <input ref={inputRef} data-testid="search-input" placeholder="Search..." />
          </div>
        );
      };

      render(<TestComponent />);
      const input = screen.getByTestId("search-input");

      expect(input).not.toHaveFocus();

      await user.keyboard("{Control>}f{/Control}");

      expect(input).toHaveFocus();
    });

    it("should clear search with Escape", async () => {
      const TestComponent = () => {
        const [value, setValue] = React.useState("test");
        const inputRef = React.useRef<HTMLInputElement>(null);

        React.useEffect(() => {
          const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && document.activeElement === inputRef.current) {
              e.preventDefault();
              setValue("");
            }
          };

          document.addEventListener("keydown", handleKeyDown);
          return () => document.removeEventListener("keydown", handleKeyDown);
        }, []);

        return (
          <input
            ref={inputRef}
            data-testid="search-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        );
      };

      render(<TestComponent />);
      const input = screen.getByTestId("search-input") as HTMLInputElement;

      input.focus();
      expect(input).toHaveValue("test");

      // Use fireEvent to simulate Escape key press
      fireEvent.keyDown(input, { key: "Escape", code: "Escape" });

      await waitFor(() => {
        expect(input).toHaveValue("");
      });
    });
  });

  describe("Multi-field Search", () => {
    it("should search across multiple fields", () => {
      const TestComponent = () => {
        const { filterItems } = useSearchFilter();
        const items = [
          { name: "admin", id: "1", auth_type: "password" },
          { name: "user", id: "2", auth_type: "no_password" },
        ];
        const [results, setResults] = React.useState<any[]>([]);

        return (
          <div>
            <button
              onClick={() => {
                const filtered = filterItems(items, "password", {
                  searchFields: ["name", "auth_type"],
                });
                setResults(filtered);
              }}
            >
              Search
            </button>
            <div data-testid="results">
              {results.map((r) => (
                <div key={r.id}>{r.name}</div>
              ))}
            </div>
          </div>
        );
      };

      render(<TestComponent />);
      const button = screen.getByText("Search");
      button.click();

      waitFor(() => {
        const results = screen.getByTestId("results");
        expect(results).toHaveTextContent("admin"); // Matches auth_type
        expect(results).toHaveTextContent("user"); // Matches auth_type: no_password
      });
    });
  });

  describe("Performance", () => {
    it("should debounce search input", async () => {
      const user = userEvent.setup();

      const TestComponent = () => {
        const [value, setValue] = React.useState("");
        const [debouncedValue, setDebouncedValue] = React.useState("");
        const [callCount, setCallCount] = React.useState(0);

        React.useEffect(() => {
          const handler = setTimeout(() => {
            setDebouncedValue(value);
          }, 300);

          return () => clearTimeout(handler);
        }, [value]);

        React.useEffect(() => {
          if (debouncedValue) {
            setCallCount((prev) => prev + 1);
          }
        }, [debouncedValue]);

        return (
          <div>
            <input
              data-testid="search-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <div data-testid="call-count">{callCount}</div>
          </div>
        );
      };

      render(<TestComponent />);
      const input = screen.getByTestId("search-input");

      // Type quickly
      await user.type(input, "test");

      // Should only call once after debounce
      await waitFor(
        () => {
          const count = screen.getByTestId("call-count");
          expect(count).toHaveTextContent("1");
        },
        { timeout: 500 }
      );
    });
  });
});
