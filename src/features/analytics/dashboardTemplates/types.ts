// src/features/analytics/dashboardTemplates/types.ts
import type { DashboardTile } from "@/features/analytics/types";

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
}

export interface PresetDashboard {
  id: string;
  name: string;
  description: string;
  templateId: string;
}
