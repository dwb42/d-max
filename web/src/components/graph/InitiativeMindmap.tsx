import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { applyNodeChanges, Background, BaseEdge, Controls, getBezierPath, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import type { Edge, EdgeProps, Node, NodeChange, NodeProps } from "@xyflow/react";
import { Copy, Maximize2, Minus, Plus, Redo2, Trash2, Undo2, X } from "lucide-react";
import {
  createInitiativeMindmapFreestyleNode,
  deleteInitiativeMindmapNode,
  fetchInitiativeMindmap,
  replaceInitiativeMindmapFreestyleNodes,
  updateInitiativeMindmapNode
} from "../../api.js";
import type { GraphLayoutNode, InitiativeMindmap as InitiativeMindmapData } from "../../types.js";
import { EmptyState, ErrorState, useModalEscape } from "../ui/index.js";
import {
  applyMindmapDropIntent,
  computeMindmapDropIntent,
  computeRadialMindmapLayout,
  freestyleSnapshot,
  rootNodeKey,
  siblingCreationHint,
  type FreestyleSnapshot,
  type MindmapLayout,
  type MindmapMode,
  type MindmapSide,
  type MindmapTopicLevel
} from "./mindmap-layout.js";
import "@xyflow/react/dist/style.css";

type MindmapNodeData = {
  graphNode: GraphLayoutNode;
  topicLevel: MindmapTopicLevel;
  side: MindmapSide | null;
  preview: boolean;
  childCount: number;
  canAddChild: boolean;
  canAddSibling: boolean;
  draggable: boolean;
  editing: boolean;
  onAddAdjacent: (nodeKey: string, side: MindmapCreateSide) => void;
  onDelete: (nodeKey: string) => void;
  onRename: (nodeKey: string, label: string) => Promise<void>;
  onStartEditing: (nodeKey: string) => void;
  onToggleCollapse: (nodeKey: string) => void;
};

type MindmapNode = Node<MindmapNodeData, "mindmap">;
type MindmapEdge = Edge<{ side: MindmapSide }, "mindmap">;
type MindmapCreateSide = "right" | "bottom";

const CANVAS_MARGIN_X = 88;
const CANVAS_MARGIN_Y = 72;

export function InitiativeMindmapSection(props: { initiativeId: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <InitiativeMindmapCanvas initiativeId={props.initiativeId} preview onOpen={() => setOpen(true)} />
      {open ? (
        <InitiativeMindmapModal initiativeId={props.initiativeId} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function InitiativeMindmapModal(props: { initiativeId: number; onClose: () => void }) {
  useModalEscape(props.onClose);

  return (
    <div className="mindmap-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section
        className="mindmap-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Initiativen-Mindmap"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <InitiativeMindmapCanvas initiativeId={props.initiativeId} onClose={props.onClose} />
      </section>
    </div>
  );
}

function InitiativeMindmapCanvas(props: { initiativeId: number; preview?: boolean; onOpen?: () => void; onClose?: () => void }) {
  const [mindmap, setMindmap] = useState<InitiativeMindmapData | null>(null);
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const [editingNodeKey, setEditingNodeKey] = useState<string | null>(null);
  const [mode, setMode] = useState<MindmapMode>(props.preview ? "structure" : "freestyle");
  const [undoStack, setUndoStack] = useState<FreestyleSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<FreestyleSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mindmapRef = useRef<InitiativeMindmapData | null>(null);
  const layoutRef = useRef<MindmapLayout | null>(null);
  const selectedNodeKeyRef = useRef<string | null>(null);
  const previousEditingNodeKeyRef = useRef<string | null>(null);
  const canvasElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mindmapRef.current = mindmap;
  }, [mindmap]);

  useEffect(() => {
    selectedNodeKeyRef.current = selectedNodeKey;
  }, [selectedNodeKey]);

  useEffect(() => {
    const previousEditingNodeKey = previousEditingNodeKeyRef.current;
    if (!props.preview && previousEditingNodeKey && !editingNodeKey) {
      window.requestAnimationFrame(() => canvasElementRef.current?.focus());
    }
    previousEditingNodeKeyRef.current = editingNodeKey || null;
  }, [editingNodeKey, props.preview]);

  const loadMindmap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMindmap(await fetchInitiativeMindmap(props.initiativeId));
      setUndoStack([]);
      setRedoStack([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mindmap konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [props.initiativeId]);

  useEffect(() => {
    void loadMindmap();
  }, [loadMindmap]);

  const pushUndoSnapshot = useCallback(() => {
    const current = mindmapRef.current;
    if (!current) return;
    setUndoStack((stack) => [...stack.slice(-39), freestyleSnapshot(current)]);
    setRedoStack([]);
  }, []);

  const restoreSnapshot = useCallback(async (snapshot: FreestyleSnapshot) => {
    const restored = await replaceInitiativeMindmapFreestyleNodes(props.initiativeId, snapshot);
    setMindmap(restored);
  }, [props.initiativeId]);

  const undo = useCallback(async () => {
    const current = mindmapRef.current;
    if (!current || undoStack.length === 0 || busy || props.preview) return;
    const previous = undoStack.at(-1)!;
    setRedoStack((stack) => [...stack, freestyleSnapshot(current)]);
    setUndoStack((stack) => stack.slice(0, -1));
    await restoreSnapshot(previous);
  }, [busy, props.preview, restoreSnapshot, undoStack]);

  const redo = useCallback(async () => {
    const current = mindmapRef.current;
    if (!current || redoStack.length === 0 || busy || props.preview) return;
    const next = redoStack.at(-1)!;
    setUndoStack((stack) => [...stack, freestyleSnapshot(current)]);
    setRedoStack((stack) => stack.slice(0, -1));
    await restoreSnapshot(next);
  }, [busy, props.preview, redoStack, restoreSnapshot]);

  const createChild = useCallback(async (parentNodeKey: string | null, input: { label?: string; edit?: boolean; x?: number; y?: number } = {}) => {
    if (props.preview || busy) return;
    const current = mindmapRef.current;
    const parent = parentNodeKey ? current?.nodes.find((node) => node.nodeKey === parentNodeKey) : null;
    if (parent && (!parent.moveSupport.freestyleParent || parent.nodeKind === "media")) return;
    pushUndoSnapshot();
    setBusy(true);
    setError(null);
    try {
      const result = await createInitiativeMindmapFreestyleNode(props.initiativeId, {
        parentNodeKey,
        label: input.label ?? "",
        x: input.x,
        y: input.y
      });
      setMindmap(result.mindmap);
      setSelectedNodeKey(result.node.nodeKey);
      if (input.edit !== false) {
        setEditingNodeKey(result.node.nodeKey);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Knoten konnte nicht angelegt werden.");
    } finally {
      setBusy(false);
    }
  }, [busy, props.initiativeId, props.preview, pushUndoSnapshot]);

  const renameNode = useCallback(async (nodeKey: string, label: string) => {
    if (props.preview) return;
    pushUndoSnapshot();
    const result = await updateInitiativeMindmapNode(props.initiativeId, nodeKey, { label });
    setMindmap(result.mindmap);
  }, [props.initiativeId, props.preview, pushUndoSnapshot]);

  const toggleCollapse = useCallback(async (nodeKey: string) => {
    if (props.preview || busy) return;
    const node = mindmapRef.current?.nodes.find((candidate) => candidate.nodeKey === nodeKey);
    if (!node) return;
    pushUndoSnapshot();
    const result = await updateInitiativeMindmapNode(props.initiativeId, nodeKey, { collapsed: !node.collapsed });
    setMindmap(result.mindmap);
  }, [busy, props.initiativeId, props.preview, pushUndoSnapshot]);

  const deleteNode = useCallback(async (nodeKey: string | null) => {
    if (props.preview || busy) return;
    const node = mindmapRef.current?.nodes.find((candidate) => candidate.nodeKey === nodeKey);
    if (!node || node.nodeKind !== "freestyle") return;
    pushUndoSnapshot();
    setBusy(true);
    try {
      const result = await deleteInitiativeMindmapNode(props.initiativeId, node.nodeKey);
      setMindmap(result.mindmap);
      setSelectedNodeKey(null);
      setEditingNodeKey(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Knoten konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  }, [busy, props.initiativeId, props.preview, pushUndoSnapshot]);

  const deleteSelected = useCallback(async () => {
    await deleteNode(selectedNodeKeyRef.current);
  }, [deleteNode]);

  const createSibling = useCallback(async (nodeKey: string | null, label?: string) => {
    const current = mindmapRef.current;
    if (!current) return;
    const hint = siblingCreationHint(current, nodeKey);
    if (!hint) return;
    await createChild(hint.parentNodeKey, { label, x: hint.x, y: hint.y });
  }, [createChild]);

  const createAdjacent = useCallback((nodeKey: string, side: MindmapCreateSide) => {
    const current = mindmapRef.current;
    const node = current?.nodes.find((candidate) => candidate.nodeKey === nodeKey);
    if (!current || !node) return;
    if (side === "bottom") {
      void createSibling(nodeKey);
      return;
    }
    void createChild(node.nodeKey);
  }, [createChild, createSibling]);

  const duplicateSelected = useCallback(async () => {
    const current = mindmapRef.current;
    const selected = current?.nodes.find((node) => node.nodeKey === selectedNodeKeyRef.current);
    if (!selected || selected.nodeKind !== "freestyle") return;
    await createChild(selected.parentNodeKey ?? (current ? rootNodeKey(current) : null), {
      label: selected.label
    });
  }, [createChild]);

  const layout = useMemo(() => {
    return mindmap ? computeRadialMindmapLayout(mindmap, mode) : null;
  }, [mindmap, mode]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const { nodes, edges } = useMemo(() => {
    if (!layout) return { nodes: [] as MindmapNode[], edges: [] as MindmapEdge[] };
    return {
      nodes: layout.nodes.map((layoutNode) => ({
        id: layoutNode.nodeKey,
        type: "mindmap" as const,
        position: { x: layoutNode.x + CANVAS_MARGIN_X, y: layoutNode.y + CANVAS_MARGIN_Y },
        width: layoutNode.width,
        height: layoutNode.height,
        draggable: !props.preview && layoutNode.graphNode.nodeKind === "freestyle",
        style: {
          width: layoutNode.width,
          minHeight: layoutNode.height
        },
        selected: layoutNode.nodeKey === selectedNodeKey,
        data: {
          graphNode: layoutNode.graphNode,
          topicLevel: layoutNode.topicLevel,
          side: layoutNode.side,
          preview: Boolean(props.preview),
          childCount: layout.childCounts.get(layoutNode.nodeKey) ?? 0,
          canAddChild: !props.preview && layoutNode.graphNode.moveSupport.freestyleParent && layoutNode.graphNode.nodeKind !== "media",
          canAddSibling: !props.preview && layoutNode.nodeKey !== layout.rootNodeKey,
          draggable: !props.preview && layoutNode.graphNode.nodeKind === "freestyle",
          editing: editingNodeKey === layoutNode.nodeKey,
          onAddAdjacent: createAdjacent,
          onDelete: (nodeKey: string) => void deleteNode(nodeKey),
          onRename: renameNode,
          onStartEditing: setEditingNodeKey,
          onToggleCollapse: toggleCollapse
        }
      })),
      edges: layout.edges.map((edge) => {
        const targetNode = layout.nodesByKey.get(edge.targetNodeKey);
        const side = targetNode?.side ?? "right";
        return {
          id: edge.id,
          source: edge.sourceNodeKey,
          target: edge.targetNodeKey,
          sourceHandle: side === "left" ? "left-source" : "right-source",
          targetHandle: side === "left" ? "right-target" : "left-target",
          type: "mindmap" as const,
          className: "mindmap-edge",
          animated: false,
          data: { side }
        };
      })
    };
  }, [createAdjacent, deleteNode, editingNodeKey, layout, props.preview, renameNode, selectedNodeKey, toggleCollapse]);

  const applySemanticDrop = useCallback(async (_event: unknown, node: Node): Promise<boolean> => {
    if (props.preview || busy) return false;
    const current = mindmapRef.current;
    const currentLayout = layoutRef.current;
    if (!current || !currentLayout) return false;
    const intent = computeMindmapDropIntent(currentLayout, {
      draggedNodeKey: node.id,
      x: Math.round(node.position.x - CANVAS_MARGIN_X),
      y: Math.round(node.position.y - CANVAS_MARGIN_Y)
    });
    if (!intent) return false;
    const snapshot = applyMindmapDropIntent(current, intent);
    if (!snapshot) return false;

    pushUndoSnapshot();
    setError(null);
    setBusy(true);
    try {
      const restored = await replaceInitiativeMindmapFreestyleNodes(props.initiativeId, snapshot);
      setMindmap(restored);
      setSelectedNodeKey(node.id);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mindmap konnte nicht umgeordnet werden.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, props.initiativeId, props.preview, pushUndoSnapshot]);

  const [centerRequest, setCenterRequest] = useState(0);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (props.preview) return;
    const target = event.target as HTMLElement;
    const targetIsEditor = target.closest("textarea, input");
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      void redo();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelected();
      return;
    }
    if (targetIsEditor) return;
    if (event.key === " ") {
      const selected = mindmapRef.current?.nodes.find((node) => node.nodeKey === selectedNodeKeyRef.current);
      if (selected?.nodeKind === "freestyle") {
        event.preventDefault();
        setEditingNodeKey(selected.nodeKey);
      }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const current = mindmapRef.current;
      void createChild(selectedNodeKeyRef.current ?? (current ? rootNodeKey(current) : null));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      void createSibling(selectedNodeKeyRef.current);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      void deleteSelected();
      return;
    }
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      selectRelativeNode(layoutRef.current, selectedNodeKeyRef.current, event.key, setSelectedNodeKey);
    }
  }, [createChild, createSibling, deleteSelected, duplicateSelected, props.preview, redo, undo]);

  const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
    if (props.preview || (event.target as HTMLElement).closest("textarea, input")) return;
    const lines = event.clipboardData.getData("text").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) return;
    event.preventDefault();
    const run = async () => {
      const current = mindmapRef.current;
      if (!current) return;
      pushUndoSnapshot();
      const selected = current.nodes.find((node) => node.nodeKey === selectedNodeKeyRef.current);
      const parentNodeKey = selected?.parentNodeKey ?? rootNodeKey(current);
      let nextMindmap = current;
      for (const line of lines) {
        const result = await createInitiativeMindmapFreestyleNode(props.initiativeId, {
          parentNodeKey,
          label: line
        });
        nextMindmap = result.mindmap;
        setMindmap(nextMindmap);
        setSelectedNodeKey(result.node.nodeKey);
      }
      setEditingNodeKey(null);
    };
    void run().catch((err) => setError(err instanceof Error ? err.message : "Einfügen konnte nicht verarbeitet werden."));
  }, [props.initiativeId, props.preview, pushUndoSnapshot]);

  useEffect(() => {
    if (props.preview) return undefined;
    const handleGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && canvasElementRef.current?.contains(target)) return;
      if (target?.closest("textarea, input")) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "y") {
        event.preventDefault();
        void redo();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === "d") {
        event.preventDefault();
        void duplicateSelected();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void deleteSelected();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [deleteSelected, duplicateSelected, props.preview, redo, undo]);

  if (loading) {
    return <div className={props.preview ? "mindmap-preview-state" : "mindmap-canvas-state"}>Mindmap wird geladen...</div>;
  }

  if (error && !mindmap) {
    return <ErrorState title="Mindmap konnte nicht geladen werden" description={error} />;
  }

  if (!mindmap || mindmap.nodes.length === 0) {
    return <EmptyState title="Noch keine Mindmap" description="Die Struktur wird angelegt, sobald die Initiative geladen ist." />;
  }

  return (
    <div
      ref={canvasElementRef}
      className={props.preview ? "mindmap-preview" : "mindmap-canvas-wrap"}
      role={props.preview ? "button" : undefined}
      tabIndex={props.preview ? 0 : 0}
      onClick={props.preview ? props.onOpen : undefined}
      onKeyDown={props.preview ? (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          props.onOpen?.();
        }
      } : handleKeyDown}
      onPaste={handlePaste}
      aria-label={props.preview ? "Mindmap öffnen" : "Initiativen-Mindmap"}
    >
      {!props.preview ? (
        <div className="mindmap-toolbar">
          <div className="mindmap-mode-toggle" role="group" aria-label="Mindmap Ansicht">
            <button type="button" className={mode === "freestyle" ? "active" : ""} onClick={() => setMode("freestyle")}>Freestyle</button>
            <button type="button" className={mode === "structure" ? "active" : ""} onClick={() => setMode("structure")}>Struktur</button>
          </div>
          <button type="button" className="small-button" onClick={() => void createChild(selectedNodeKey ?? (mindmap ? rootNodeKey(mindmap) : null))} disabled={busy}>
            <Plus size={14} /> Subtopic
          </button>
          <button type="button" className="small-button" onClick={() => void createSibling(selectedNodeKey)} disabled={busy}>
            <Plus size={14} /> Geschwister
          </button>
          <button type="button" className="small-button" onClick={() => setCenterRequest((value) => value + 1)} disabled={busy}>
            <Maximize2 size={14} /> Zentrieren
          </button>
          <button type="button" className="icon-button compact" onClick={() => void undo()} disabled={busy || undoStack.length === 0} aria-label="Rückgängig" title="Rückgängig">
            <Undo2 size={14} />
          </button>
          <button type="button" className="icon-button compact" onClick={() => void redo()} disabled={busy || redoStack.length === 0} aria-label="Wiederholen" title="Wiederholen">
            <Redo2 size={14} />
          </button>
          <button type="button" className="icon-button compact" onClick={() => void duplicateSelected()} disabled={busy} aria-label="Knoten duplizieren" title="Knoten duplizieren">
            <Copy size={14} />
          </button>
          <button type="button" className="icon-button compact subtle-danger" onClick={() => void deleteSelected()} disabled={busy} aria-label="Freestyle-Knoten löschen" title="Freestyle-Knoten löschen">
            <Trash2 size={14} />
          </button>
          {error ? <span className="mindmap-inline-error">{error}</span> : null}
          {props.onClose ? (
            <button type="button" className="icon-button compact mindmap-toolbar-close" onClick={props.onClose} aria-label="Mindmap schließen" title="Schließen">
              <X size={16} />
            </button>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="mindmap-preview-open"
          aria-label="Mindmap im Vollbild öffnen"
          title="Mindmap öffnen"
          onClick={(event) => {
            event.stopPropagation();
            props.onOpen?.();
          }}
        >
          <Maximize2 size={16} />
        </button>
      )}
      <ReactFlowProvider>
        <MindmapFlow
          nodes={nodes}
          edges={edges}
          preview={Boolean(props.preview)}
          onNodeClick={(_event, node) => {
            canvasElementRef.current?.focus();
            setSelectedNodeKey(node.id);
          }}
          onPaneClick={() => {
            canvasElementRef.current?.focus();
            setSelectedNodeKey(null);
          }}
          onNodeDragStop={applySemanticDrop}
          centerRequest={centerRequest}
        />
      </ReactFlowProvider>
    </div>
  );
}

function MindmapFlow(props: {
  nodes: MindmapNode[];
  edges: MindmapEdge[];
  preview: boolean;
  centerRequest: number;
  onNodeClick: (event: ReactMouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onNodeDragStop: (event: unknown, node: Node) => Promise<boolean>;
}) {
  const flow = useReactFlow();
  const [flowNodes, setFlowNodes] = useState(props.nodes);
  const didInitialFitViewRef = useRef(false);
  const previousCenterRequestRef = useRef(props.centerRequest);

  useEffect(() => {
    setFlowNodes(props.nodes);
  }, [props.nodes]);

  useEffect(() => {
    const shouldFitInitially = !didInitialFitViewRef.current && props.nodes.length > 0;
    const shouldFitByRequest = previousCenterRequestRef.current !== props.centerRequest;
    previousCenterRequestRef.current = props.centerRequest;
    if (!shouldFitInitially && !shouldFitByRequest) return;
    didInitialFitViewRef.current = true;
    window.requestAnimationFrame(() => flow.fitView({ padding: props.preview ? 0.1 : 0.18, duration: 200 }));
  }, [flow, props.centerRequest, props.nodes.length, props.preview]);

  const handleNodesChange = useCallback((changes: NodeChange<MindmapNode>[]) => {
    setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes) as MindmapNode[]);
  }, []);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={props.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodesDraggable={!props.preview}
      nodesConnectable={false}
      elementsSelectable={!props.preview}
      panOnDrag={!props.preview}
      zoomOnScroll={!props.preview}
      zoomOnPinch={!props.preview}
      minZoom={props.preview ? 0.5 : 0.25}
      preventScrolling={!props.preview}
      onNodesChange={handleNodesChange}
      onNodeClick={props.onNodeClick}
      onPaneClick={() => {
        props.onPaneClick();
      }}
      onNodeDragStop={(event, node) => {
        void props.onNodeDragStop(event, node).then((accepted) => {
          if (!accepted) setFlowNodes(props.nodes);
        });
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={22} size={1} />
      {!props.preview ? <Controls showInteractive={false} /> : null}
    </ReactFlow>
  );
}

function MindmapNodeComponent(props: NodeProps<MindmapNode>) {
  const graphNode = props.data.graphNode;
  const [draft, setDraft] = useState(graphNode.label);
  const [saving, setSaving] = useState(false);
  const editable = !props.data.preview && graphNode.nodeKind === "freestyle";
  const editing = props.data.editing;

  useEffect(() => {
    setDraft(graphNode.label);
  }, [graphNode.label]);

  const save = async () => {
    const next = draft.trim();
    if (!editable || !next || next === graphNode.label) {
      props.data.onStartEditing("");
      return;
    }
    setSaving(true);
    try {
      await props.data.onRename(graphNode.nodeKey, next);
      props.data.onStartEditing("");
    } finally {
      setSaving(false);
    }
  };

  const startEditingFromNode = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!editable || editing) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, textarea, .react-flow__handle")) return;
    event.stopPropagation();
    props.data.onStartEditing(graphNode.nodeKey);
  };

  return (
    <div
      className={`mindmap-node kind-${graphNode.nodeKind} topic-${props.data.topicLevel}${props.data.draggable ? " draggable" : ""}${props.selected ? " selected" : ""}`}
      onDoubleClick={startEditingFromNode}
      title={editable ? "Doppelklick zum Umbenennen" : undefined}
    >
      <Handle id="left-target" type="target" position={Position.Left} />
      <Handle id="right-target" type="target" position={Position.Right} />
      {props.data.childCount > 0 && props.data.topicLevel !== "central" ? (
        <button
          type="button"
          className={`mindmap-node-collapse nodrag ${props.data.side === "left" ? "side-left" : "side-right"}${graphNode.collapsed ? " is-collapsed" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            props.data.onToggleCollapse(graphNode.nodeKey);
          }}
          aria-label={graphNode.collapsed ? `${props.data.childCount} Kindknoten ausklappen` : `${props.data.childCount} Kindknoten einklappen`}
          title={graphNode.collapsed ? `${props.data.childCount} ausklappen` : "Einklappen"}
        >
          {graphNode.collapsed ? props.data.childCount : <Minus size={12} strokeWidth={1.8} />}
        </button>
      ) : null}
      {editing ? (
        <textarea
          className="mindmap-node-input nodrag"
          autoFocus
          value={draft}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(graphNode.label);
              props.data.onStartEditing("");
            }
          }}
        />
      ) : (
        <div
          role={editable ? "button" : undefined}
          tabIndex={editable ? 0 : undefined}
          className="mindmap-node-label"
          onKeyDown={(event) => {
            if (!editable) return;
            if (event.key === "Enter") {
              event.preventDefault();
              props.data.onStartEditing(graphNode.nodeKey);
            }
          }}
          title={editable ? "Doppelklick zum Umbenennen" : graphNode.label}
        >
          {graphNode.label}
        </div>
      )}
      {!props.data.preview ? (
        <>
          {editable ? (
            <button
              type="button"
              className="mindmap-node-delete nodrag"
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                props.data.onDelete(graphNode.nodeKey);
              }}
              aria-label="Freestyle-Knoten löschen"
              title="Freestyle-Knoten löschen"
            >
              <Trash2 size={12} />
            </button>
          ) : null}
          {(["right", "bottom"] as const).filter((side) => side === "right" ? props.data.canAddChild : props.data.canAddSibling).map((side) => (
            <button
              key={side}
              type="button"
              className={`mindmap-node-add nodrag ${side}`}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                props.data.onAddAdjacent(graphNode.nodeKey, side);
              }}
              aria-label={side === "right" ? "Subtopic hinzufügen" : "Geschwister hinzufügen"}
              title={side === "right" ? "Subtopic hinzufügen" : "Geschwister hinzufügen"}
            >
              <Plus size={12} />
            </button>
          ))}
        </>
      ) : null}
      <Handle id="left-source" type="source" position={Position.Left} />
      <Handle id="right-source" type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { mindmap: MindmapNodeComponent };
const edgeTypes = { mindmap: MindmapEdgeComponent };

function MindmapEdgeComponent(props: EdgeProps<MindmapEdge>) {
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.34
  });

  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      interactionWidth={props.interactionWidth}
      className="mindmap-edge"
      style={props.style}
    />
  );
}

function selectRelativeNode(
  layout: MindmapLayout | null,
  selectedNodeKey: string | null,
  key: string,
  setSelectedNodeKey: (nodeKey: string | null) => void
): void {
  if (!layout) return;
  const nodes = layout.nodes;
  const selected = nodes.find((node) => node.nodeKey === selectedNodeKey) ?? layout.nodesByKey.get(layout.rootNodeKey);
  if (!selected) return;

  if (key === "ArrowLeft") {
    if (selected.side === "right" && selected.parentNodeKey) {
      setSelectedNodeKey(selected.parentNodeKey);
      return;
    }
    const leftSibling = nodes
      .filter((node) => node.side === "left")
      .sort((a, b) => Math.abs((a.y + a.height / 2) - (selected.y + selected.height / 2)) - Math.abs((b.y + b.height / 2) - (selected.y + selected.height / 2)))[0];
    setSelectedNodeKey(leftSibling?.nodeKey ?? layout.rootNodeKey);
    return;
  }

  if (key === "ArrowRight") {
    if (selected.side === "left" && selected.parentNodeKey) {
      setSelectedNodeKey(selected.parentNodeKey);
      return;
    }
    const rightSibling = nodes
      .filter((node) => node.side === "right")
      .sort((a, b) => Math.abs((a.y + a.height / 2) - (selected.y + selected.height / 2)) - Math.abs((b.y + b.height / 2) - (selected.y + selected.height / 2)))[0];
    setSelectedNodeKey(rightSibling?.nodeKey ?? layout.rootNodeKey);
    return;
  }

  const siblings = nodes
    .filter((node) => node.parentNodeKey === selected.parentNodeKey && node.side === selected.side)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const index = siblings.findIndex((node) => node.nodeKey === selected.nodeKey);
  if (index === -1) return;
  if (key === "ArrowUp") {
    setSelectedNodeKey(siblings[Math.max(0, index - 1)]?.nodeKey ?? selected.nodeKey);
  } else if (key === "ArrowDown") {
    setSelectedNodeKey(siblings[Math.min(siblings.length - 1, index + 1)]?.nodeKey ?? selected.nodeKey);
  }
}
