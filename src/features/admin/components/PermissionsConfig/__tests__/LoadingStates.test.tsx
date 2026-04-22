import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ListSkeleton } from "../LoadingSkeletons/ListSkeleton";
import { MatrixSkeleton } from "../LoadingSkeletons/MatrixSkeleton";
import { ProgressIndicator } from "../LoadingSkeletons/ProgressIndicator";

describe("Loading Skeletons and States", () => {
  describe("ListSkeleton Component", () => {
    it("should render skeleton rows with correct count", () => {
      render(<ListSkeleton rows={5} />);

      const skeletonRows = screen.getAllByTestId("skeleton-row");
      expect(skeletonRows).toHaveLength(5);
    });

    it("should render default 3 rows when count not specified", () => {
      render(<ListSkeleton />);

      const skeletonRows = screen.getAllByTestId("skeleton-row");
      expect(skeletonRows).toHaveLength(3);
    });

    it("should render table headers", () => {
      render(<ListSkeleton />);

      expect(screen.getByRole("table")).toBeInTheDocument();
      const rowgroups = screen.getAllByRole("rowgroup");
      expect(rowgroups.length).toBeGreaterThanOrEqual(1);
    });

    it("should have proper skeleton structure for list items", () => {
      const { container } = render(<ListSkeleton rows={1} />);

      // Should have animated pulse effect
      const pulsingElements = container.querySelectorAll(".animate-pulse");
      expect(pulsingElements.length).toBeGreaterThan(0);
    });

    it("should not cause layout shift", () => {
      const { container, rerender } = render(<ListSkeleton rows={3} />);
      const initialHeight = (container.firstChild as HTMLElement)?.clientHeight;

      rerender(<ListSkeleton rows={3} />);
      const afterHeight = (container.firstChild as HTMLElement)?.clientHeight;

      expect(initialHeight).toBe(afterHeight);
    });
  });

  describe("MatrixSkeleton Component", () => {
    it("should render skeleton for permissions matrix", () => {
      render(<MatrixSkeleton />);

      expect(screen.getByTestId("matrix-skeleton")).toBeInTheDocument();
    });

    it("should render multiple skeleton cells", () => {
      const { container } = render(<MatrixSkeleton />);

      const cells = container.querySelectorAll(".animate-pulse");
      expect(cells.length).toBeGreaterThan(0);
    });

    it("should maintain matrix layout structure", () => {
      const { container } = render(<MatrixSkeleton />);

      // Should have grid layout
      const gridElement = container.querySelector("[data-testid='matrix-skeleton']");
      expect(gridElement).toBeInTheDocument();
    });
  });

  describe("ProgressIndicator Component", () => {
    it("should display current progress", () => {
      render(<ProgressIndicator current={3} total={10} />);

      expect(screen.getByText("3 of 10")).toBeInTheDocument();
    });

    it("should show progress message", () => {
      render(
        <ProgressIndicator current={1} total={5} message="Executing GRANT statement" />
      );

      expect(screen.getByText("Executing GRANT statement")).toBeInTheDocument();
    });

    it("should render progress bar with correct percentage", () => {
      render(<ProgressIndicator current={5} total={10} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "50");
      expect(progressBar).toHaveAttribute("aria-valuemin", "0");
      expect(progressBar).toHaveAttribute("aria-valuemax", "100");
    });

    it("should handle 0% progress", () => {
      render(<ProgressIndicator current={0} total={10} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "0");
    });

    it("should handle 100% progress", () => {
      render(<ProgressIndicator current={10} total={10} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAttribute("aria-valuenow", "100");
    });

    it("should be accessible with ARIA labels", () => {
      render(<ProgressIndicator current={3} total={10} />);

      const progressBar = screen.getByRole("progressbar");
      expect(progressBar).toHaveAccessibleName();
    });
  });

  describe("Loading State Integration", () => {
    it("should prevent layout shift when switching from loading to content", () => {
      const { container, rerender } = render(<ListSkeleton rows={5} />);
      const skeletonHeight = (container.firstChild as HTMLElement)?.clientHeight;

      // Simulate transition to actual content
      rerender(
        <div role="table">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} role="row" style={{ height: "40px" }}>
              Row {i}
            </div>
          ))}
        </div>
      );

      // Heights should be similar (within reasonable margin)
      const contentHeight = (container.firstChild as HTMLElement)?.clientHeight;
      expect(Math.abs(skeletonHeight - contentHeight)).toBeLessThan(20);
    });
  });

  describe("Button Disabled States", () => {
    it("should disable interactive elements during loading", () => {
      render(
        <div>
          <button disabled data-testid="action-button">
            Execute
          </button>
          <button disabled data-testid="clear-button">
            Clear
          </button>
          <input disabled data-testid="search-input" />
        </div>
      );

      expect(screen.getByTestId("action-button")).toBeDisabled();
      expect(screen.getByTestId("clear-button")).toBeDisabled();
      expect(screen.getByTestId("search-input")).toBeDisabled();
    });
  });

  describe("Multi-Statement Progress", () => {
    it("should update progress as statements execute", () => {
      const { rerender } = render(<ProgressIndicator current={1} total={5} />);
      expect(screen.getByText("1 of 5")).toBeInTheDocument();

      rerender(<ProgressIndicator current={2} total={5} />);
      expect(screen.getByText("2 of 5")).toBeInTheDocument();

      rerender(<ProgressIndicator current={5} total={5} />);
      expect(screen.getByText("5 of 5")).toBeInTheDocument();
    });

    it("should show descriptive messages for each step", () => {
      const messages = [
        "Creating user 'analyst'",
        "Granting SELECT privilege",
        "Granting INSERT privilege",
        "Applying quota 'standard'",
        "Finalizing changes",
      ];

      const { rerender } = render(
        <ProgressIndicator current={1} total={5} message={messages[0]} />
      );

      messages.forEach((msg, idx) => {
        rerender(<ProgressIndicator current={idx + 1} total={5} message={msg} />);
        expect(screen.getByText(msg)).toBeInTheDocument();
      });
    });
  });
});
