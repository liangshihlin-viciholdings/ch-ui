import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	Copy,
	GripVertical,
	Home,
	Info,
	Plus,
	Save,
	Terminal,
	X,
	XSquareIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SqlTab from "@/features/workspace/components//SqlTab";
import HomeTab from "@/features/workspace/components/HomeTab";
import InformationTab from "@/features/workspace/components/infoTab/InfoTab";
import { genTabId } from "@/lib/utils";
import useAppStore from "@/stores/workspaceStore";

interface Tab {
	id: string;
	title: string;
	type: "sql" | "home" | "information";
	content: string | { database?: string; table?: string };
	isSaved?: boolean;
}

interface SortableTabProps {
	tab: Tab;
	isActive: boolean;
	onActivate: () => void;
}

function SortableTab({ tab, isActive, onActivate }: SortableTabProps) {
	const { attributes, listeners, setNodeRef, transform, transition } =
		useSortable({ id: tab.id });
	const { removeTab, duplicateTab } = useAppStore();
	const [isHovering, setIsHovering] = useState(false);

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`flex items-center hover:text-accent-foreground ${isActive ? "z-10" : "z-0"}`}
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
			onAuxClick={(e) => {
				if (e.button === 1) {
					// Only handle middle mouse button
					e.preventDefault();
					removeTab(tab.id);
				}
			}}
		>
			<ContextMenu>
				<ContextMenuTrigger className="flex items-center justify-center text-sm">
					<TabsTrigger
						value={tab.id}
						className="h-8 flex items-center rounded-sm px-2 gap-1"
						onClick={onActivate}
					>
						{tab.type !== "home" && (
							<div {...attributes} {...listeners} className="cursor-move px-1">
								<GripVertical className="cursor-move p-0" size={12} />
							</div>
						)}
						{tab.type === "home" && (
							<Home width={14} className="min-w-3.5 shrink-0" />
						)}
						{tab.type === "sql" && !tab.isSaved && (
							<Terminal width={14} className="min-w-3.5 shrink-0" />
						)}
						{tab.type === "sql" && tab.isSaved && (
							<Save width={14} className="min-w-3.5 shrink-0" />
						)}
						{tab.type === "information" && (
							<Info width={14} className="min-w-3.5 shrink-0" />
						)}

						<span className="truncate max-w-20 text-xs">{tab.title}</span>

						{tab.id !== "home" && (
							<span
								className="cursor-pointer shrink-0"
								onClick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									removeTab(tab.id);
								}}
							>
								<X className="h-4 w-4" />
							</span>
						)}
					</TabsTrigger>
				</ContextMenuTrigger>

				<ContextMenuContent>
					{tab.type === "sql" && (
						<ContextMenuItem onClick={() => duplicateTab(tab.id)}>
							Duplicate Tab <Copy className="ml-4 h-4 w-4" />
						</ContextMenuItem>
					)}

					{tab.type !== "home" && (
						<ContextMenuItem
							onClick={() => removeTab(tab.id)}
							className="text-red-600"
						>
							Close Tab <XSquareIcon className="ml-4 h-4 w-4" />
						</ContextMenuItem>
					)}

					{tab.type === "home" && (
						<ContextMenuItem>
							Home Tab <Home className="ml-4 h-4 w-4" />
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>
		</div>
	);
}

function WorkspaceTabs() {
	const { tabs, activeTab, addTab, setActiveTab, moveTab, closeAllTabs } =
		useAppStore();

	const sensors = useSensors(
		useSensor(PointerSensor),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const location = useLocation();
	const navigate = useNavigate();

	useEffect(() => {
		const searchParams = new URLSearchParams(location.searchStr);
		const database = searchParams.get("database") || "";
		const table = searchParams.get("table") || "";
		if (database || table) {
			// look if the tab already exists
			const existingTab = tabs.find(
				(tab) =>
					tab.type === "information" &&
					typeof tab.content === "object" &&
					tab.content.database === database &&
					tab.content.table === table,
			);
			if (existingTab) {
				setActiveTab(existingTab.id);
			} else {
				addTab({
					id: genTabId(),
					title: `Information: ${database || table}`,
					type: "information",
					content: { database, table },
				});
			}

			// Clean up URL parameters
			navigate({ to: location.pathname, search: {}, replace: true });
		}
	}, [location.searchStr, location.pathname, tabs]);

	const addNewCodeTab = useCallback(() => {
		addTab({
			id: genTabId(),
			title: "Query " + tabs.length,
			type: "sql",
			content: "",
		});
	}, [tabs.length, addTab]);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (active.id !== over?.id && active.id !== "home" && over?.id !== "home") {
			const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
			const newIndex = tabs.findIndex((tab) => tab.id === over?.id);
			moveTab(oldIndex, newIndex);
		}
	};

	const sortedTabs = useMemo(() => {
		const homeTab = tabs.find((tab) => tab.id === "home");
		const otherTabs = tabs.filter((tab) => tab.id !== "home");
		return homeTab ? [homeTab, ...otherTabs] : otherTabs;
	}, [tabs]);

	return (
		<div className="flex flex-col h-full">
			<Tabs
				value={activeTab || undefined}
				onValueChange={setActiveTab}
				className="flex flex-col h-full"
			>
				<div className="shrink-0 flex items-center">
					<Button
						variant="link"
						className="rounded-none hover:bg-gray-200 h-8 px-2 sticky left-0 z-10 bg-background"
						onClick={addNewCodeTab}
					>
						<Plus className="h-4 w-4" />
					</Button>
					<ScrollArea className="grow">
						<ContextMenu>
							<ContextMenuTrigger>
								<DndContext
									sensors={sensors}
									collisionDetection={closestCenter}
									onDragEnd={handleDragEnd}
								>
									<SortableContext
										items={sortedTabs.map((tab) => tab.id)}
										strategy={horizontalListSortingStrategy}
									>
										<div className="flex">
											<TabsList className="inline-flex h-10 items-center justify-start rounded-none w-full overflow-y-clip gap-1">
												{sortedTabs.map((tab) => (
													<SortableTab
														key={tab.id}
														tab={
															tab.id === "home"
																? { ...tab, title: "Home" }
																: tab
														}
														isActive={activeTab === tab.id}
														onActivate={() => setActiveTab(tab.id)}
													/>
												))}
											</TabsList>
										</div>
									</SortableContext>
								</DndContext>
							</ContextMenuTrigger>
							<ContextMenuContent>
								<ContextMenuItem onClick={addNewCodeTab}>
									New Tab <Plus className="ml-4 h-4 w-4" />
								</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem
									onClick={closeAllTabs}
									className="text-red-600"
								>
									Close All Tabs <XSquareIcon className="ml-4 h-4 w-4" />
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
						<ScrollBar orientation="horizontal" />
					</ScrollArea>
				</div>
				<div className="flex flex-col flex-1 min-h-0">
					{sortedTabs.map((tab) => (
						<TabsContent
							key={tab.id}
							value={tab.id}
							className="h-full m-0 p-0 outline-none data-[state=active]:block"
						>
							{tab.type === "home" ? (
								<HomeTab />
							) : tab.type === "sql" ? (
								<SqlTab tabId={tab.id} />
							) : tab.type === "information" ? (
								<InformationTab
									database={
										typeof tab.content === "object" && tab.content.database
											? tab.content.database
											: ""
									}
									tableName={
										typeof tab.content === "object"
											? tab.content.table
											: undefined
									}
								/>
							) : null}
						</TabsContent>
					))}
				</div>
			</Tabs>
		</div>
	);
}

export default WorkspaceTabs;
