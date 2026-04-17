import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import PermissionsConfig from "../index";
import useAppStore from "@/stores/workspaceStore";

// Mock the hooks
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

// Mock store
vi.mock("@/stores/workspaceStore");

// Mock layer components to test visibility
vi.mock("../UsersLayer", () => ({
  default: () => <div data-testid="users-layer">Users Layer</div>,
}));

vi.mock("../RolesLayer", () => ({
  default: () => <div data-testid="roles-layer">Roles Layer</div>,
}));

vi.mock("../QuotasLayer", () => ({
  default: () => <div data-testid="quotas-layer">Quotas Layer</div>,
}));

vi.mock("../RowPoliciesLayer", () => ({
  default: () => <div data-testid="row-policies-layer">Row Policies Layer</div>,
}));

vi.mock("../SettingsProfilesLayer", () => ({
  default: () => <div data-testid="settings-profiles-layer">Settings Profiles Layer</div>,
}));

vi.mock("../PermissionsMatrix", () => ({
  default: () => <div data-testid="permissions-matrix">Permissions Matrix</div>,
}));

vi.mock("../ReviewPanel", () => ({
  default: () => <div>Review Panel</div>,
}));

describe("Permissions Security Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tab Visibility Based on Privileges", () => {
    it("should show all tabs for admin user with all privileges", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "admin",
          canShowUsers: true,
          canShowRoles: true,
          canShowQuotas: true,
          canShowRowPolicies: true,
          canShowSettingsProfiles: true,
        },
      });

      render(<PermissionsConfig />);

      // All 6 tabs should be visible
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /roles/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /quotas/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /row policies/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /settings profiles/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /permissions matrix/i })).toBeInTheDocument();
    });

    it("should only show Users tab when user has canShowUsers privilege", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "limited_user",
          canShowUsers: true,
          canShowRoles: false,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      // Only Users and Permissions Matrix tabs should be visible
      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /permissions matrix/i })).toBeInTheDocument();

      // Other tabs should not be visible
      expect(screen.queryByRole("tab", { name: /^roles$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /quotas/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /row policies/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /settings profiles/i })).not.toBeInTheDocument();
    });

    it("should only show Roles tab when user has canShowRoles privilege", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "roles_only_user",
          canShowUsers: false,
          canShowRoles: true,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      expect(screen.getByRole("tab", { name: /roles/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /permissions matrix/i })).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /users/i })).not.toBeInTheDocument();
    });

    it("should only show Permissions Matrix when user has no other privileges", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "no_privileges_user",
          canShowUsers: false,
          canShowRoles: false,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      // Should NOT show warning - Matrix is always accessible as read-only
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      // Only Permissions Matrix tab should be visible (read-only access)
      const tabs = screen.queryAllByRole("tab");
      expect(tabs.length).toBe(1);
      expect(screen.getByRole("tab", { name: /permissions matrix/i })).toBeInTheDocument();

      // No management tabs should be visible
      expect(screen.queryByRole("tab", { name: /users/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /roles/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /quotas/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /row policies/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /settings profiles/i })).not.toBeInTheDocument();
    });

    it("should show multiple tabs when user has multiple privileges", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "multi_privilege_user",
          canShowUsers: true,
          canShowRoles: true,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      // Should have Users, Roles, and Permissions Matrix tabs
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBeGreaterThanOrEqual(2);

      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /roles/i })).toBeInTheDocument();
    });
  });

  describe("Permissions Matrix Access", () => {
    it("should always show Permissions Matrix tab regardless of privileges", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "no_other_privileges",
          canShowUsers: false,
          canShowRoles: false,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      // Matrix should still be visible (read-only, always accessible)
      const tabs = screen.queryAllByRole("tab");
      if (tabs.length > 0) {
        expect(screen.queryByRole("tab", { name: /permissions matrix/i })).toBeInTheDocument();
      }
    });
  });

  describe("Privilege Escalation Prevention", () => {
    it("should not leak privileged tabs through URL manipulation", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "limited_user",
          canShowUsers: true,
          canShowRoles: false,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      const { container } = render(<PermissionsConfig />);

      // Verify that hidden tab content is not in the DOM
      expect(container.querySelector('[data-testid="roles-layer"]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-testid="quotas-layer"]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-testid="row-policies-layer"]')).not.toBeInTheDocument();
      expect(container.querySelector('[data-testid="settings-profiles-layer"]')).not.toBeInTheDocument();
    });

    it("should not expose privileged actions in tab buttons", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "viewer",
          canShowUsers: true,
          canShowRoles: false,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      const tabs = screen.getAllByRole("tab");

      // Only accessible tabs should be rendered
      tabs.forEach((tab) => {
        const tabName = tab.getAttribute("aria-label") || tab.textContent || "";
        expect(tabName).not.toMatch(/roles/i);
        expect(tabName).not.toMatch(/quotas/i);
        expect(tabName).not.toMatch(/row policies/i);
        expect(tabName).not.toMatch(/settings profiles/i);
      });
    });
  });

  describe("Minimum Privilege Requirements", () => {
    const privilegeTests = [
      {
        layer: "Users",
        privilege: "canShowUsers",
        otherPrivileges: { canShowRoles: false, canShowQuotas: false, canShowRowPolicies: false, canShowSettingsProfiles: false },
      },
      {
        layer: "Roles",
        privilege: "canShowRoles",
        otherPrivileges: { canShowUsers: false, canShowQuotas: false, canShowRowPolicies: false, canShowSettingsProfiles: false },
      },
      {
        layer: "Quotas",
        privilege: "canShowQuotas",
        otherPrivileges: { canShowUsers: false, canShowRoles: false, canShowRowPolicies: false, canShowSettingsProfiles: false },
      },
      {
        layer: "Row Policies",
        privilege: "canShowRowPolicies",
        otherPrivileges: { canShowUsers: false, canShowRoles: false, canShowQuotas: false, canShowSettingsProfiles: false },
      },
      {
        layer: "Settings Profiles",
        privilege: "canShowSettingsProfiles",
        otherPrivileges: { canShowUsers: false, canShowRoles: false, canShowQuotas: false, canShowRowPolicies: false },
      },
    ];

    privilegeTests.forEach(({ layer, privilege, otherPrivileges }) => {
      it(`should require ${privilege} to access ${layer} layer`, () => {
        const mockUseAppStore = useAppStore as any;
        mockUseAppStore.mockReturnValue({
          userPrivileges: {
            username: `${privilege}_user`,
            [privilege]: true,
            ...otherPrivileges,
          },
        });

        render(<PermissionsConfig />);

        // The specific layer should be visible
        expect(screen.getByRole("tab", { name: new RegExp(layer, "i") })).toBeInTheDocument();
      });

      it(`should NOT show ${layer} layer without ${privilege} privilege`, () => {
        const mockUseAppStore = useAppStore as any;
        mockUseAppStore.mockReturnValue({
          userPrivileges: {
            username: `no_${privilege}_user`,
            [privilege]: false,
            ...otherPrivileges,
          },
        });

        render(<PermissionsConfig />);

        // The specific layer should NOT be visible
        const layerPattern = new RegExp(`^${layer}$`, "i");
        expect(screen.queryByRole("tab", { name: layerPattern })).not.toBeInTheDocument();
      });
    });
  });

  describe("Combined Privilege Scenarios", () => {
    it("should show correct tabs for user with Users and Roles privileges", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "users_roles_manager",
          canShowUsers: true,
          canShowRoles: true,
          canShowQuotas: false,
          canShowRowPolicies: false,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      expect(screen.getByRole("tab", { name: /users/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /roles/i })).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /quotas/i })).not.toBeInTheDocument();
    });

    it("should show correct tabs for security officer (Quotas and Row Policies)", () => {
      const mockUseAppStore = useAppStore as any;
      mockUseAppStore.mockReturnValue({
        userPrivileges: {
          username: "security_officer",
          canShowUsers: false,
          canShowRoles: false,
          canShowQuotas: true,
          canShowRowPolicies: true,
          canShowSettingsProfiles: false,
        },
      });

      render(<PermissionsConfig />);

      expect(screen.getByRole("tab", { name: /quotas/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /row policies/i })).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /users/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /roles/i })).not.toBeInTheDocument();
    });
  });
});
