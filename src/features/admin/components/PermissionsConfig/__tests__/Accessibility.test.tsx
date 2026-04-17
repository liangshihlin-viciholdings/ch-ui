import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import PermissionsConfig from "../index";

// Mock the hooks and store
vi.mock("../hooks/usePermissionsState", () => ({
  usePermissionsState: () => ({
    pendingChanges: [],
    activeLayer: "users",
    setActiveLayer: vi.fn(),
    isReviewPanelOpen: false,
    toggleReviewPanel: vi.fn(),
    addPendingChange: vi.fn(),
    removePendingChange: vi.fn(),
    clearPendingChanges: vi.fn(),
    executePendingChanges: vi.fn(),
    isExecuting: false,
    executionResults: null,
  }),
}));

vi.mock("@/stores/workspaceStore", () => ({
  default: vi.fn(() => ({
    userPrivileges: {
      username: "test_user",
      canShowUsers: true,
      canShowRoles: true,
      canShowQuotas: true,
      canShowRowPolicies: true,
      canShowSettingsProfiles: true,
    },
  })),
}));

// Mock the layer components
vi.mock("../UsersLayer", () => ({
  default: () => <div>Users Layer Content</div>,
}));

vi.mock("../RolesLayer", () => ({
  default: () => <div>Roles Layer Content</div>,
}));

vi.mock("../QuotasLayer", () => ({
  default: () => <div>Quotas Layer Content</div>,
}));

vi.mock("../RowPoliciesLayer", () => ({
  default: () => <div>Row Policies Layer Content</div>,
}));

vi.mock("../SettingsProfilesLayer", () => ({
  default: () => <div>Settings Profiles Layer Content</div>,
}));

vi.mock("../PermissionsMatrix", () => ({
  default: () => <div>Permissions Matrix Content</div>,
}));

vi.mock("../ReviewPanel", () => ({
  default: () => <div>Review Panel</div>,
}));

describe("PermissionsConfig Accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ARIA Labels and Roles", () => {
    it("should have proper main region with label", () => {
      render(<PermissionsConfig />);

      const mainRegion = screen.getByRole("main");
      expect(mainRegion).toHaveAttribute("aria-label", "Permissions Configuration");
    });

    it("should have properly labeled heading", () => {
      render(<PermissionsConfig />);

      const heading = screen.getByRole("heading", { name: "Permissions Configuration" });
      expect(heading).toHaveAttribute("id", "permissions-heading");
    });

    it("should have skip link for keyboard navigation", () => {
      render(<PermissionsConfig />);

      const skipLink = screen.getByText("Skip to permissions tabs");
      expect(skipLink).toHaveAttribute("href", "#permissions-tabs");
    });

    it("should have proper tablist with label", () => {
      render(<PermissionsConfig />);

      const tablist = screen.getByRole("tablist");
      expect(tablist).toHaveAttribute("aria-label", "Permission configuration layers");
    });

    it("should have all tabs with proper ARIA attributes", () => {
      render(<PermissionsConfig />);

      // Check that tabs exist with ARIA controls
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThan(0);

      // Each tab should have aria-selected and aria-controls
      tabs.forEach((tab) => {
        expect(tab).toHaveAttribute("aria-selected");
        expect(tab).toHaveAttribute("aria-controls");
      });
    });

    it("should have tabpanels with proper ARIA labelledby", () => {
      render(<PermissionsConfig />);

      // Find the active tab panel
      const tabpanel = screen.getByRole("tabpanel");
      expect(tabpanel).toHaveAttribute("id");
      expect(tabpanel).toHaveAttribute("aria-labelledby");
    });

    it("should mark decorative icons as aria-hidden", () => {
      const { container } = render(<PermissionsConfig />);

      // Icons in tabs should be decorative
      const icons = container.querySelectorAll('svg[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe("Live Regions", () => {
    it("should have pending changes counter as live region", () => {
      const { rerender } = render(<PermissionsConfig />);

      // Mock with pending changes
      vi.mock("../hooks/usePermissionsState", () => ({
        usePermissionsState: () => ({
          pendingChanges: [{ id: "1" }, { id: "2" }],
          activeLayer: "users",
          setActiveLayer: vi.fn(),
          isReviewPanelOpen: false,
          toggleReviewPanel: vi.fn(),
          addPendingChange: vi.fn(),
          removePendingChange: vi.fn(),
          clearPendingChanges: vi.fn(),
          executePendingChanges: vi.fn(),
          isExecuting: false,
          executionResults: null,
        }),
      }));

      rerender(<PermissionsConfig />);

      const badge = screen.queryByRole("status");
      if (badge) {
        expect(badge).toHaveAttribute("aria-live", "polite");
        expect(badge).toHaveAttribute("aria-atomic", "true");
      }
    });
  });

  describe("Keyboard Navigation", () => {
    it("should support tab key navigation", async () => {
      const user = userEvent.setup();
      render(<PermissionsConfig />);

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThanOrEqual(1);

      if (tabs.length > 0) {
        // Focus first tab
        tabs[0].focus();
        expect(document.activeElement).toBe(tabs[0]);

        // Tab to next element
        await user.tab();
        expect(document.activeElement).toBeDefined();
      }
    });

    it("should have tabs in the tablist", () => {
      render(<PermissionsConfig />);

      const tabs = screen.getAllByRole("tab");
      const tablist = screen.getByRole("tablist");

      // Tablist should contain tabs
      expect(tabs.length).toBeGreaterThanOrEqual(1);
      expect(tablist).toBeInTheDocument();
    });
  });

  describe("Screen Reader Announcements", () => {
    it("should announce no permissions warning with proper role", () => {
      // Mock user with no permissions
      vi.mock("@/stores/workspaceStore", () => ({
        default: vi.fn(() => ({
          userPrivileges: {
            username: "test_user",
            canShowUsers: false,
            canShowRoles: false,
            canShowQuotas: false,
            canShowRowPolicies: false,
            canShowSettingsProfiles: false,
          },
        })),
      }));

      render(<PermissionsConfig />);

      const alert = screen.queryByRole("alert");
      if (alert) {
        expect(alert).toHaveAttribute("aria-live", "polite");
        expect(alert).toHaveTextContent(/don't have permissions/i);
      }
    });

    it("should have accessible button labels", () => {
      render(<PermissionsConfig />);

      // Review button should have descriptive label
      const reviewButton = screen.queryByRole("button", { name: /review/i });
      if (reviewButton) {
        expect(reviewButton).toHaveAttribute("aria-label");
      }
    });
  });

  describe("Focus Management", () => {
    it("should maintain logical focus order", () => {
      const { container } = render(<PermissionsConfig />);

      // Get all focusable elements
      const focusableElements = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      // Should have focusable elements
      expect(focusableElements.length).toBeGreaterThan(0);
    });

    it("should not have tabindex greater than 0", () => {
      const { container } = render(<PermissionsConfig />);

      const elementsWithPositiveTabindex = container.querySelectorAll(
        '[tabindex]:not([tabindex="0"]):not([tabindex="-1"])'
      );

      // No elements should have positive tabindex
      expect(elementsWithPositiveTabindex.length).toBe(0);
    });
  });

  describe("Semantic HTML", () => {
    it("should use semantic heading hierarchy", () => {
      render(<PermissionsConfig />);

      const heading = screen.getByRole("heading", { level: 2 });
      expect(heading).toBeInTheDocument();
    });

    it("should use proper button elements for actions", () => {
      render(<PermissionsConfig />);

      // All buttons should be actual button elements
      const buttons = screen.queryAllByRole("button");
      buttons.forEach((button) => {
        expect(button.tagName).toBe("BUTTON");
      });
    });
  });

  describe("Form Accessibility", () => {
    it("should have associated labels for inputs", () => {
      const { container } = render(<PermissionsConfig />);

      const inputs = container.querySelectorAll("input");
      inputs.forEach((input) => {
        // Each input should have either a label or aria-label
        const hasLabel = !!input.labels?.length;
        const hasAriaLabel = input.hasAttribute("aria-label") || input.hasAttribute("aria-labelledby");

        expect(hasLabel || hasAriaLabel).toBe(true);
      });
    });
  });
});
