// src/features/analytics/dashboardTemplates/types.ts
import type { DashboardTile } from "@/features/analytics/types";
import type { Engine } from "@/lib/db/schema";

export interface SetupGuide {
  title: string;
  content: string; // Markdown content
  docsUrl?: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tiles: DashboardTile[];
  setupGuide?: SetupGuide;
  /**
   * If set, this template only works on the given engine (e.g. it queries
   * engine-specific system tables). Templates whose requiredEngine doesn't
   * match the target connection are flagged in the picker.
   */
  requiredEngine?: Engine;
}

export interface PresetDashboard {
  id: string;
  name: string;
  description: string;
  templateId: string;
}
