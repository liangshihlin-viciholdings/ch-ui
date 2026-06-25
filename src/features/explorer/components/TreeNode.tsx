// TreeNode.tsx
import React, { useState, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Database,
  Table,
  FileSpreadsheet,
  Eye,
  Trash,
  TerminalIcon,
  MoreVertical,
  FilePlus,
  FolderPlus,
  BookA,
  Columns3Cog,
  FileCode,
  Hash,
  Copy,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmationDialog from "@/components/common/ConfirmationDialog";
import ExportTableDialog from "@/features/explorer/components/ExportTableDialog";
import { isExportSupported } from "@/features/explorer/utils/exportTable";
import { toast } from "sonner";
import useAppStore from "@/stores/workspaceStore";
import { useTreeExpansion } from "@/features/explorer/context/TreeExpansionContext";
import { formatBytes } from "@/lib/utils";

export interface TreeNodeData {
  name: string;
  type: "database" | "table" | "view" | "dictionary" | "materialized_view" | "saved_query";
  children?: TreeNodeData[];
  query?: string;
  total_bytes?: number;
}

interface MenuOption {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  separatorBefore?: boolean;
}

interface TreeNodeProps {
  node: TreeNodeData;
  nodePath: string;
  level: number;
  parentDatabaseName?: string;
  refreshData: () => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  nodePath,
  level,
  parentDatabaseName,
  refreshData,
}) => {
  const { isExpanded, toggleExpanded } = useTreeExpansion();
  const isOpen = isExpanded(nodePath);

  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<() => Promise<void>>(
    () => async () => {}
  );
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmDescription, setConfirmDescription] = useState("");
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const {
    addTab,
    runQuery,
    getTabById,
    setActiveTab,
    openCreateTableModal,
    openCreateDatabaseModal,
    clickHouseClient,
  } = useAppStore();

  const toggleOpen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(nodePath);
  }, [nodePath, toggleExpanded]);

  const openInfoTab = (database: string, table: string) => {
    const title = `${database}${table ? `.${table}` : ""}`;
    const existingTab = getTabById(title);

    if (existingTab) {
      setActiveTab(existingTab.id);
    } else {
      addTab({
        id: title,
        title: title,
        type: "information",
        content: { database, table },
      });
    }
  };

  // Open a query tab for a leaf node and immediately execute it, so the user
  // sees data without pressing Run. Reuses an existing tab if already open.
  const handleOpenAndRun = useCallback(
    (database: string, table: string) => async () => {
      const query = `SELECT * FROM \`${database}\`.\`${table}\` LIMIT 1000`;
      const title = `Query - ${table}`;
      const tabId = `query-${database}-${table}`;
      const existingTab = getTabById(tabId);

      if (existingTab) {
        setActiveTab(existingTab.id);
      } else {
        await addTab({
          id: tabId,
          type: "sql",
          title: title,
          content: `-- ${title}\n${query}`,
        });
      }
      await runQuery(query, tabId);
    },
    [addTab, getTabById, setActiveTab, runQuery]
  );

  // Open SHOW CREATE output in an editable (prefilled) SQL tab.
  const handleViewDDL = useCallback(
    (database: string, table: string) => async () => {
      const result = await runQuery(
        `SHOW CREATE TABLE \`${database}\`.\`${table}\``
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const row = result.data?.[0] as Record<string, unknown> | undefined;
      const ddl =
        (row?.statement as string) ??
        (row ? String(Object.values(row)[0] ?? "") : "");
      if (!ddl) {
        toast.error(`Could not retrieve DDL for ${table}`);
        return;
      }
      const tabId = `ddl-${database}-${table}`;
      const existingTab = getTabById(tabId);
      if (existingTab) {
        setActiveTab(existingTab.id);
        return;
      }
      await addTab({
        id: tabId,
        type: "sql",
        title: `DDL - ${table}`,
        content: ddl,
      });
    },
    [addTab, getTabById, setActiveTab, runQuery]
  );

  // Show row count via the instant system.tables estimate; fall back to an
  // exact count() when total_rows is null (e.g. views).
  const handleCountRows = useCallback(
    (database: string, table: string) => async () => {
      const estimate = await runQuery(
        `SELECT total_rows FROM system.tables WHERE database = '${database}' AND name = '${table}'`
      );
      if (estimate.error) {
        toast.error(estimate.error);
        return;
      }
      let total = (estimate.data?.[0] as { total_rows?: unknown } | undefined)
        ?.total_rows;
      if (total === null || total === undefined) {
        const exact = await runQuery(
          `SELECT count() AS c FROM \`${database}\`.\`${table}\``
        );
        if (exact.error) {
          toast.error(exact.error);
          return;
        }
        total = (exact.data?.[0] as { c?: unknown } | undefined)?.c;
      }
      const n = Number(total);
      toast.info(
        `${database}.${table} ≈ ${Number.isFinite(n) ? n.toLocaleString() : total} rows`
      );
    },
    [runQuery]
  );

  const handleCopy = useCallback(
    (text: string, label: string) => async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast.success(`Copied ${label}`);
      } catch {
        toast.error(`Failed to copy ${label}`);
      }
    },
    []
  );

  const getIcon = useMemo(() => {
    switch (node.type) {
      case "database":
        return <Database className="w-4 h-4 mr-2" />;
      case "table":
        return <Table className="w-4 h-4 mr-2" />;
      case "view":
        return <FileSpreadsheet className="w-4 h-4 mr-2" />;
      case "dictionary":
        return <BookA className="w-4 h-4 mr-2" />;
      case "materialized_view":
        return <Columns3Cog className="w-4 h-4 mr-2" />;
      case "saved_query":
        return <TerminalIcon className="w-4 h-4 mr-2" />;
      default:
        return null;
    }
  }, [node.type]);

  const actionDropDatabase = async (database: string) => {
    setConfirmTitle(`Drop Database ${database}`);
    setConfirmDescription(
      `Are you sure you want to drop the database ${database}? This action cannot be undone.`
    );
    setConfirmAction(() => async () => {
      try {
        const result = await runQuery(`DROP DATABASE ${database}`);
        if (result.error) {
          toast.error(result.error);
        } else {
          toast.success(`Dropped database ${database}`);
          refreshData();
        }
      } catch (error) {
        toast.error(`Failed to drop database ${database}`);
      }
    });
    setIsConfirmDialogOpen(true);
  };

  const actionDropTable = async (database: string, table: string) => {
    setConfirmTitle(`Drop Table ${table}`);
    setConfirmDescription(
      `Are you sure you want to drop the table ${database}.${table}? This action cannot be undone.`
    );

    setConfirmAction(() => async () => {
      try {
        await runQuery(`DROP TABLE \`${database}\`.\`${table}\``);
        toast.success(`Dropped table ${table}`);
        refreshData();
      } catch (error) {
        toast.error(`Failed to drop table ${table}`);
      }
    });
    setIsConfirmDialogOpen(true);
  };

  const actionDropView = async (database: string, view: string) => {
    setConfirmTitle(`Drop View ${view}`);
    setConfirmDescription(
      `Are you sure you want to drop the view ${database}.${view}? This action cannot be undone.`
    );

    setConfirmAction(() => async () => {
      try {
        await runQuery(`DROP VIEW ${database}.${view}`);
        toast.success(`Dropped view ${view}`);
        refreshData();
      } catch (error) {
        toast.error(`Failed to drop view ${view}`);
      }
    });
    setIsConfirmDialogOpen(true);
  };

  const actionDropDictionary = async (database: string, dictionary: string) => {
    setConfirmTitle(`Drop Dictionary ${dictionary}`);
    setConfirmDescription(
      `Are you sure you want to drop the dictionary ${database}.${dictionary}? This action cannot be undone.`
    );

    setConfirmAction(() => async () => {
      try {
        await runQuery(`DROP DICTIONARY ${database}.${dictionary}`);
        toast.success(`Dropped dictionary ${dictionary}`);
        refreshData();
      } catch (error) {
        toast.error(`Failed to drop dictionary ${dictionary}`);
      }
    });
    setIsConfirmDialogOpen(true);
  };

  const actionDropMaterializedView = async (database: string, materializedView: string) => {
    setConfirmTitle(`Drop Materialized View ${materializedView}`);
    setConfirmDescription(
      `Are you sure you want to drop the materialized view ${database}.${materializedView}? This action cannot be undone.`
    );

    setConfirmAction(() => async () => {
      try {
        await runQuery(`DROP TABLE ${database}.${materializedView}`);
        toast.success(`Dropped materialized view ${materializedView}`);
        refreshData();
      } catch (error) {
        toast.error(`Failed to drop materialized view ${materializedView}`);
      }
    });
    setIsConfirmDialogOpen(true);
  };

  const contextMenuOptions = useMemo(() => {
    const needsParent =
      <T,>(fn: (db: string, name: string) => T) =>
      (): void | T =>
        parentDatabaseName
          ? fn(parentDatabaseName, node.name)
          : void toast.error("Parent database name is undefined.");

    // Shared menu for queryable leaf nodes (table / view / mv / dictionary).
    // Only the destructive Delete action varies by node type.
    const leafMenu = (
      deleteLabel: string,
      deleteAction: (db: string, name: string) => void
    ): MenuOption[] => [
      {
        label: "View Info",
        icon: <Eye className="w-4 h-4 mr-2" />,
        action: needsParent((db, name) => openInfoTab(db, name)),
      },
      {
        label: "View DDL",
        icon: <FileCode className="w-4 h-4 mr-2" />,
        action: needsParent((db, name) => handleViewDDL(db, name)()),
        separatorBefore: true,
      },
      {
        label: "Count Rows",
        icon: <Hash className="w-4 h-4 mr-2" />,
        action: needsParent((db, name) => handleCountRows(db, name)()),
        separatorBefore: true,
      },
      {
        label: "Copy Name",
        icon: <Copy className="w-4 h-4 mr-2" />,
        action: handleCopy(node.name, "name"),
        separatorBefore: true,
      },
      {
        label: "Copy Qualified Name",
        icon: <Copy className="w-4 h-4 mr-2" />,
        action: needsParent((db, name) =>
          handleCopy(`\`${db}\`.\`${name}\``, "qualified name")()
        ),
      },
      // Export streams via Electron IPC — desktop only.
      ...(isExportSupported()
        ? [
            {
              label: "Export Table",
              icon: <Download className="w-4 h-4 mr-2" />,
              action: needsParent(() => setIsExportDialogOpen(true)),
              separatorBefore: true,
            } as MenuOption,
          ]
        : []),
      {
        label: deleteLabel,
        icon: <Trash className="w-4 h-4 mr-2" />,
        action: needsParent(deleteAction),
        separatorBefore: true,
      },
    ];

    return {
      database: [
        {
          label: "View Info",
          icon: <Eye className="w-4 h-4 mr-2" />,
          action: () => openInfoTab(node.name, ""),
        },
        {
          label: "Create Table",
          icon: <FilePlus className="w-4 h-4 mr-2" />,
          action: () => openCreateTableModal(node.name),
        },
        {
          label: "Create Database",
          icon: <FolderPlus className="w-4 h-4 mr-2" />,
          action: () => openCreateDatabaseModal(),
        },
        {
          label: "Delete",
          icon: <Trash className="w-4 h-4 mr-2" />,
          action: () => actionDropDatabase(node.name),
          separatorBefore: true,
        },
      ] as MenuOption[],
      table: leafMenu("Delete", actionDropTable),
      view: leafMenu("Delete", actionDropView),
      dictionary: leafMenu("Delete Dictionary", actionDropDictionary),
      materialized_view: leafMenu(
        "Delete Materialized View",
        actionDropMaterializedView
      ),
    };
  }, [
    parentDatabaseName,
    node.name,
    handleViewDDL,
    handleCountRows,
    handleCopy,
    actionDropDatabase,
    actionDropTable,
    actionDropView,
    actionDropDictionary,
    actionDropMaterializedView,
  ]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <div
            className={`flex items-center py-1 px-2 hover:bg-secondary hover:rounded-md cursor-pointer truncate
            ${level > 0 ? "ml-4" : ""}`}
            onClick={toggleOpen}
          >
            <div className="flex-grow flex items-center">
              {node.children ? (
                isOpen ? (
                  <ChevronDown className="w-4 h-4 mr-1" />
                ) : (
                  <ChevronRight className="w-4 h-4 mr-1" />
                )
              ) : (
                <div className="w-6 mr-1" />
              )}
              {getIcon}
              <div
                onClick={(e) => {
                  if (
                    node.type === "table" ||
                    node.type === "view" ||
                    node.type === "dictionary" ||
                    node.type === "materialized_view"
                  ) {
                    e.stopPropagation();
                    if (parentDatabaseName) {
                      handleOpenAndRun(parentDatabaseName, node.name)();
                    } else {
                      toast.error("Parent database name is undefined.");
                    }
                  }
                }}
                className="text-xs flex items-center gap-1"
              >
                <p className="truncate">{node.name}</p>
                {node.total_bytes !== undefined && node.total_bytes > 0 && (
                  <span className="text-muted-foreground text-[10px] shrink-0">
                    ({formatBytes(node.total_bytes)})
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {contextMenuOptions[
                    node.type as keyof typeof contextMenuOptions
                  ].map((option, index) => (
                    <React.Fragment key={index}>
                      {option.separatorBefore && index > 0 && (
                        <DropdownMenuSeparator />
                      )}
                      <DropdownMenuItem onSelect={option.action}>
                        {option.icon}
                        {option.label}
                      </DropdownMenuItem>
                    </React.Fragment>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {contextMenuOptions[node.type as keyof typeof contextMenuOptions].map(
            (option, index) => (
              <React.Fragment key={index}>
                {option.separatorBefore && index > 0 && <ContextMenuSeparator />}
                <ContextMenuItem onSelect={option.action}>
                  {option.icon}
                  {option.label}
                </ContextMenuItem>
              </React.Fragment>
            )
          )}
        </ContextMenuContent>
        {isOpen && node.children && (
          <div>
            {node.children.length > 0 ? (
              node.children.map((child, index) => (
                <TreeNode
                  key={index}
                  node={child}
                  nodePath={`${nodePath}/${child.name}`}
                  level={level + 1}
                  parentDatabaseName={
                    node.type === "database" ? node.name : parentDatabaseName
                  }
                  refreshData={refreshData}
                />
              ))
            ) : (
              <div className="ml-6 pl-4 text-xs italic text-muted-foreground">
                Nothing to show
              </div>
            )}
          </div>
        )}
      </ContextMenu>
      <ConfirmationDialog
        isOpen={isConfirmDialogOpen}
        variant="danger"
        onClose={() => setIsConfirmDialogOpen(false)}
        onConfirm={async () => {
          await confirmAction();
          setIsConfirmDialogOpen(false);
        }}
        title={confirmTitle}
        description={confirmDescription}
        confirmText="Delete"
        cancelText="Cancel"
      />
      {isExportDialogOpen && parentDatabaseName && (
        <ExportTableDialog
          open={isExportDialogOpen}
          onOpenChange={setIsExportDialogOpen}
          database={parentDatabaseName}
          table={node.name}
          client={clickHouseClient}
        />
      )}
    </>
  );
};

export default TreeNode;
