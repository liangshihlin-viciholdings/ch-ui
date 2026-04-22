// src/features/workspace/explain/layout.ts
import { ExplainNode } from '@/types/common';

export interface TreeNodeLayout extends ExplainNode {
  x: number;
  y: number;
  children: TreeNodeLayout[];
}

interface LayoutNode {
  node: ExplainNode;
  x: number;
  y: number;
  mod: number;
  children: LayoutNode[];
  parent?: LayoutNode;
  thread?: LayoutNode;
  ancestor: LayoutNode;
  prelim: number;
  change: number;
  shift: number;
  number: number;
}

/**
 * Tree layout algorithm based on Walker's algorithm
 * Produces aesthetically pleasing tree layouts with minimal edge crossings
 */
export class TreeLayout {
  private static readonly NODE_WIDTH = 200;
  private static readonly NODE_HEIGHT = 60;
  private static readonly HORIZONTAL_SPACING = 30;
  private static readonly VERTICAL_SPACING = 80;

  /**
   * Main entry point - calculates layout for entire tree
   */
  static calculateLayout(root: ExplainNode): TreeNodeLayout {
    if (!root) {
      throw new Error('Root node is required');
    }

    // Convert to layout nodes
    const layoutRoot = this.initLayoutNode(root);

    // First walk - assign preliminary x coordinates
    this.firstWalk(layoutRoot);

    // Second walk - finalize x coordinates
    this.secondWalk(layoutRoot, -layoutRoot.prelim);

    // Convert back to TreeNodeLayout
    return this.toTreeNodeLayout(layoutRoot);
  }

  /**
   * Initialize layout node from ExplainNode
   */
  private static initLayoutNode(
    node: ExplainNode,
    depth: number = 0,
    parent?: LayoutNode
  ): LayoutNode {
    const layoutNode: LayoutNode = {
      node,
      x: 0,
      y: depth * this.VERTICAL_SPACING,
      mod: 0,
      prelim: 0,
      change: 0,
      shift: 0,
      number: 0,
      ancestor: null as any,
      children: [],
      parent,
    };

    layoutNode.ancestor = layoutNode;

    if (node.children && node.children.length > 0) {
      layoutNode.children = node.children.map((child, index) => {
        const childLayout = this.initLayoutNode(child, depth + 1, layoutNode);
        childLayout.number = index;
        return childLayout;
      });
    }

    return layoutNode;
  }

  /**
   * First walk - calculate preliminary x coordinates
   */
  private static firstWalk(node: LayoutNode): void {
    if (node.children.length === 0) {
      // Leaf node
      const leftSibling = this.getLeftSibling(node);
      if (leftSibling) {
        node.prelim = leftSibling.prelim + this.NODE_WIDTH + this.HORIZONTAL_SPACING;
      } else {
        node.prelim = 0;
      }
    } else {
      // Internal node
      let defaultAncestor = node.children[0];

      node.children.forEach((child) => {
        this.firstWalk(child);
        defaultAncestor = this.apportion(child, defaultAncestor);
      });

      this.executeShifts(node);

      const midpoint =
        (node.children[0].prelim +
          node.children[node.children.length - 1].prelim) /
        2;

      const leftSibling = this.getLeftSibling(node);
      if (leftSibling) {
        node.prelim = leftSibling.prelim + this.NODE_WIDTH + this.HORIZONTAL_SPACING;
        node.mod = node.prelim - midpoint;
      } else {
        node.prelim = midpoint;
      }
    }
  }

  /**
   * Second walk - finalize x coordinates with modifiers
   */
  private static secondWalk(node: LayoutNode, m: number): void {
    node.x = node.prelim + m;

    node.children.forEach((child) => {
      this.secondWalk(child, m + node.mod);
    });
  }

  /**
   * Apportion - resolve conflicts between subtrees
   */
  private static apportion(
    node: LayoutNode,
    defaultAncestor: LayoutNode
  ): LayoutNode {
    const leftSibling = this.getLeftSibling(node);

    if (leftSibling) {
      let vInnerRight = node;
      let vOuterRight = node;
      let vInnerLeft = leftSibling;
      let vOuterLeft = vInnerRight.children[0] || vInnerRight;

      let sInnerRight = vInnerRight.mod;
      let sOuterRight = vOuterRight.mod;
      let sInnerLeft = vInnerLeft.mod;
      let sOuterLeft = vOuterLeft.mod;

      while (
        this.nextRight(vInnerLeft) &&
        this.nextLeft(vInnerRight)
      ) {
        vInnerLeft = this.nextRight(vInnerLeft)!;
        vInnerRight = this.nextLeft(vInnerRight)!;

        const newOuterLeft = this.nextLeft(vOuterLeft);
        const newOuterRight = this.nextRight(vOuterRight);

        // Break if outer pointers become null (tree structure edge case)
        if (!newOuterLeft || !newOuterRight) {
          break;
        }

        vOuterLeft = newOuterLeft;
        vOuterRight = newOuterRight;

        vOuterRight.ancestor = node;

        const shift =
          vInnerLeft.prelim +
          sInnerLeft -
          (vInnerRight.prelim + sInnerRight) +
          this.NODE_WIDTH +
          this.HORIZONTAL_SPACING;

        if (shift > 0) {
          this.moveSubtree(
            this.ancestor(vInnerLeft, node, defaultAncestor),
            node,
            shift
          );
          sInnerRight += shift;
          sOuterRight += shift;
        }

        sInnerLeft += vInnerLeft.mod;
        sInnerRight += vInnerRight.mod;
        sOuterLeft += vOuterLeft.mod;
        sOuterRight += vOuterRight.mod;
      }

      if (this.nextRight(vInnerLeft) && !this.nextRight(vOuterRight)) {
        vOuterRight.thread = this.nextRight(vInnerLeft) ?? undefined;
        vOuterRight.mod += sInnerLeft - sOuterRight;
      }

      if (this.nextLeft(vInnerRight) && !this.nextLeft(vOuterLeft)) {
        vOuterLeft.thread = this.nextLeft(vInnerRight) ?? undefined;
        vOuterLeft.mod += sInnerRight - sOuterLeft;
        defaultAncestor = node;
      }
    }

    return defaultAncestor;
  }

  /**
   * Execute shifts - distribute spacing changes
   */
  private static executeShifts(node: LayoutNode): void {
    let shift = 0;
    let change = 0;

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      child.prelim += shift;
      child.mod += shift;
      change += child.change;
      shift += child.shift + change;
    }
  }

  /**
   * Move subtree - shift subtree to resolve conflicts
   */
  private static moveSubtree(
    wLeft: LayoutNode,
    wRight: LayoutNode,
    shift: number
  ): void {
    const subtrees = wRight.number - wLeft.number;
    wRight.change -= shift / subtrees;
    wRight.shift += shift;
    wLeft.change += shift / subtrees;
    wRight.prelim += shift;
    wRight.mod += shift;
  }

  /**
   * Helper functions
   */
  private static getLeftSibling(node: LayoutNode): LayoutNode | null {
    if (!node.parent) {
      return null;
    }

    const siblings = node.parent.children;
    const index = siblings.indexOf(node);

    return index > 0 ? siblings[index - 1] : null;
  }

  private static nextLeft(node: LayoutNode): LayoutNode | null {
    return node.children.length > 0 ? node.children[0] : node.thread || null;
  }

  private static nextRight(node: LayoutNode): LayoutNode | null {
    return node.children.length > 0
      ? node.children[node.children.length - 1]
      : node.thread || null;
  }

  private static ancestor(
    vInnerLeft: LayoutNode,
    node: LayoutNode,
    defaultAncestor: LayoutNode
  ): LayoutNode {
    // Check if vInnerLeft's ancestor is a sibling of node
    // Simplified: return defaultAncestor
    return defaultAncestor;
  }

  /**
   * Convert LayoutNode back to TreeNodeLayout
   */
  private static toTreeNodeLayout(layoutNode: LayoutNode): TreeNodeLayout {
    return {
      ...layoutNode.node,
      x: layoutNode.x,
      y: layoutNode.y,
      children: layoutNode.children.map((child) =>
        this.toTreeNodeLayout(child)
      ),
    };
  }

  /**
   * Get tree bounds for viewport calculation
   */
  static getTreeBounds(root: TreeNodeLayout): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  } {
    let minX = root.x;
    let maxX = root.x + this.NODE_WIDTH;
    let minY = root.y;
    let maxY = root.y + this.NODE_HEIGHT;

    const traverse = (node: TreeNodeLayout) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x + this.NODE_WIDTH);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y + this.NODE_HEIGHT);

      node.children.forEach(traverse);
    };

    traverse(root);

    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
