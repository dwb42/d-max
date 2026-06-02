import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";
import { applyNodeChanges, Background, Controls, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow } from "@xyflow/react";
import type { Edge, Node, NodeChange, NodeProps } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import { ChevronDown, ChevronRight, Copy, GitBranch, Maximize2, Plus, Redo2, RefreshCw, Trash2, Undo2, X } from "lucide-react";
import {
  createInitiativeMindmapFreestyleNode,
  deleteInitiativeMindmapNode,
  fetchInitiativeMindmap,
  replaceInitiativeMindmapFreestyleNodes,
  updateInitiativeMindmapNode
} from "../../api.js";
import type { GraphLayoutNode, InitiativeMindmap as InitiativeMindmapData } from "../../types.js";
import { EmptyState, ErrorState, useModalEscape } from "../ui/index.js";
import "@xyflow/react/dist/style.css";

type MindmapNodeData = {
  graphNode: GraphLayoutNode;
  preview: boolean;
  childCount: number;
  editing: boolean;
  onAddAdjacent: (nodeKey: string, side: MindmapCreateSide) => void;
  onDelete: (nodeKey: string) => void;
  onRename: (nodeKey: string, label: string) => Promise<void>;
  onStartEditing: (nodeKey: string) => void;
  onToggleCollapse: (nodeKey: string) => void;
};

type MindmapNode = Node<MindmapNodeData, "mindmap">;
type MindmapMode = "freestyle" | "structure";
type MindmapCreateSide = "top" | "right" | "bottom" | "left";
type FreestyleSnapshot = Array<Pick<GraphLayoutNode, "nodeKey" | "parentNodeKey" | "label" | "x" | "y" | "width" | "height" | "collapsed">>;

const MIN_NODE_WIDTH = 180;
const MAX_NODE_WIDTH = 360;
const BASE_NODE_HEIGHT = 56;
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
        <header className="mindmap-modal-header">
          <div>
            <h2>Mindmap</h2>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} aria-label="Mindmap schließen" title="Schließen">
            <X size={18} />
          </button>
        </header>
        <InitiativeMindmapCanvas initiativeId={props.initiativeId} />
      </section>
    </div>
  );
}

function InitiativeMindmapCanvas(props: { initiativeId: number; preview?: boolean; onOpen?: () => void }) {
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
  const selectedNodeKeyRef = useRef<string | null>(null);
  const canvasElementRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mindmapRef.current = mindmap;
  }, [mindmap]);

  useEffect(() => {
    selectedNodeKeyRef.current = selectedNodeKey;
  }, [selectedNodeKey]);

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

  const createChild = useCallback(async (parentNodeKey: string | null, input: { x?: number; y?: number; label?: string; edit?: boolean } = {}) => {
    if (props.preview || busy) return;
    const current = mindmapRef.current;
    const parent = parentNodeKey ? current?.nodes.find((node) => node.nodeKey === parentNodeKey) : null;
    const childIndex = parentNodeKey && current ? current.edges.filter((edge) => edge.sourceNodeKey === parentNodeKey).length : 0;
    const x = input.x ?? (parent ? parent.x + nodeWidth(parent) + 96 : undefined);
    const y = input.y ?? (parent ? parent.y + childIndex * (nodeHeight(parent) + 18) : undefined);
    pushUndoSnapshot();
    setBusy(true);
    setError(null);
    try {
      const result = await createInitiativeMindmapFreestyleNode(props.initiativeId, {
        parentNodeKey,
        label: input.label,
        x,
        y
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

  const createAdjacent = useCallback((nodeKey: string, side: MindmapCreateSide) => {
    const current = mindmapRef.current;
    const node = current?.nodes.find((candidate) => candidate.nodeKey === nodeKey);
    if (!current || !node) return;
    const dx = side === "right" ? nodeWidth(node) + 96 : side === "left" ? -nodeWidth(node) - 96 : 0;
    const dy = side === "bottom" ? nodeHeight(node) + 42 : side === "top" ? -nodeHeight(node) - 42 : 0;
    const childIndex = current.edges.filter((edge) => edge.sourceNodeKey === nodeKey).length;
    const fanoutY = side === "right" || side === "left" ? childIndex * (nodeHeight(node) + 18) : 0;
    const fanoutX = side === "top" || side === "bottom" ? childIndex * Math.min(nodeWidth(node) + 28, 260) : 0;
    void createChild(nodeKey, { x: node.x + dx + fanoutX, y: node.y + dy + fanoutY });
  }, [createChild]);

  const createSibling = useCallback(async (nodeKey: string | null, label?: string) => {
    const current = mindmapRef.current;
    if (!current) return;
    const rootKey = rootNodeKey(current);
    const selected = current.nodes.find((node) => node.nodeKey === nodeKey) ?? current.nodes.find((node) => node.nodeKey === rootKey);
    if (!selected) return;
    const parentNodeKey = selected.parentNodeKey ?? rootKey;
    await createChild(parentNodeKey, {
      label,
      x: selected.x,
      y: selected.y + nodeHeight(selected) + 32
    });
  }, [createChild]);

  const duplicateSelected = useCallback(async () => {
    const current = mindmapRef.current;
    const selected = current?.nodes.find((node) => node.nodeKey === selectedNodeKeyRef.current);
    if (!selected || selected.nodeKind !== "freestyle") return;
    await createChild(selected.parentNodeKey, {
      label: selected.label,
      x: selected.x + 36,
      y: selected.y + 36
    });
  }, [createChild]);

  const { nodes, edges } = useMemo(() => {
    if (!mindmap) return { nodes: [] as MindmapNode[], edges: [] as Edge[] };
    const visibleNodeKeys = visibleMindmapNodeKeys(mindmap, mode);
    const childCounts = childCountByNodeKey(mindmap, mode);
    return {
      nodes: mindmap.nodes.filter((node) => visibleNodeKeys.has(node.nodeKey)).map((node) => ({
        id: node.nodeKey,
        type: "mindmap" as const,
        position: { x: node.x + CANVAS_MARGIN_X, y: node.y + CANVAS_MARGIN_Y },
        width: nodeWidth(node),
        height: nodeHeight(node),
        style: {
          width: nodeWidth(node),
          minHeight: nodeHeight(node)
        },
        selected: node.nodeKey === selectedNodeKey,
        data: {
          graphNode: node,
          preview: Boolean(props.preview),
          childCount: childCounts.get(node.nodeKey) ?? 0,
          editing: editingNodeKey === node.nodeKey,
          onAddAdjacent: createAdjacent,
          onDelete: (nodeKey: string) => void deleteNode(nodeKey),
          onRename: renameNode,
          onStartEditing: setEditingNodeKey,
          onToggleCollapse: toggleCollapse
        }
      })),
      edges: visibleMindmapEdges(mindmap, visibleNodeKeys, mode).map((edge) => ({
        id: edge.id,
        source: edge.sourceNodeKey,
        target: edge.targetNodeKey,
        type: "smoothstep",
        className: "mindmap-edge",
        animated: false
      }))
    };
  }, [createAdjacent, deleteNode, editingNodeKey, mindmap, mode, props.preview, renameNode, selectedNodeKey, toggleCollapse]);

  const saveNodePosition = useCallback(async (_event: unknown, node: Node) => {
    if (props.preview) return;
    pushUndoSnapshot();
    setError(null);
    try {
      const result = await updateInitiativeMindmapNode(props.initiativeId, node.id, {
        x: Math.round(node.position.x - CANVAS_MARGIN_X),
        y: Math.round(node.position.y - CANVAS_MARGIN_Y),
        width: typeof node.measured?.width === "number" ? Math.round(node.measured.width) : undefined,
        height: typeof node.measured?.height === "number" ? Math.round(node.measured.height) : undefined
      });
      setMindmap(result.mindmap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Position konnte nicht gespeichert werden.");
    }
  }, [props.initiativeId, props.preview, pushUndoSnapshot]);

  const autoArrange = useCallback(async () => {
    if (!mindmap || props.preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const arranged = arrangeMindmap(mindmap, selectedNodeKey);
      setMindmap({ ...mindmap, nodes: mindmap.nodes.map((node) => arranged.get(node.nodeKey) ?? node) });
      pushUndoSnapshot();
      await Promise.all([...arranged.values()].map((node) =>
        updateInitiativeMindmapNode(props.initiativeId, node.nodeKey, {
          x: Math.round(node.x),
          y: Math.round(node.y)
        })
      ));
      setMindmap(await fetchInitiativeMindmap(props.initiativeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-Arrange konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }, [busy, mindmap, props.initiativeId, props.preview, pushUndoSnapshot, selectedNodeKey]);

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
      selectRelativeNode(mindmapRef.current, selectedNodeKeyRef.current, event.key, mode, setSelectedNodeKey);
    }
  }, [createChild, createSibling, deleteSelected, duplicateSelected, mode, props.preview, redo, undo]);

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
      let y = selected ? selected.y + nodeHeight(selected) + 32 : 80;
      let nextMindmap = current;
      for (const line of lines) {
        const result = await createInitiativeMindmapFreestyleNode(props.initiativeId, {
          parentNodeKey,
          label: line,
          x: selected?.x ?? 120,
          y
        });
        nextMindmap = result.mindmap;
        setMindmap(nextMindmap);
        setSelectedNodeKey(result.node.nodeKey);
        y += nodeHeight(result.node) + 26;
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
            <Plus size={14} /> Knoten
          </button>
          <button type="button" className="small-button" onClick={() => void createSibling(selectedNodeKey)} disabled={busy}>
            <Plus size={14} /> Geschwister
          </button>
          <button type="button" className="small-button" onClick={() => void autoArrange()} disabled={busy}>
            <RefreshCw size={14} /> Auto-arrange
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
          onNodeDragStop={saveNodePosition}
          onCreateAt={(x, y) => void createChild(null, { x, y })}
          onCreateConnected={(sourceNodeKey, x, y) => void createChild(sourceNodeKey, { x, y })}
        />
      </ReactFlowProvider>
    </div>
  );
}

function MindmapFlow(props: {
  nodes: MindmapNode[];
  edges: Edge[];
  preview: boolean;
  onNodeClick: (event: ReactMouseEvent, node: Node) => void;
  onPaneClick: () => void;
  onNodeDragStop: (event: unknown, node: Node) => void;
  onCreateAt: (x: number, y: number) => void;
  onCreateConnected: (sourceNodeKey: string, x: number, y: number) => void;
}) {
  const flow = useReactFlow();
  const connectSourceRef = useRef<string | null>(null);
  const [flowNodes, setFlowNodes] = useState(props.nodes);

  useEffect(() => {
    setFlowNodes(props.nodes);
  }, [props.nodes]);

  useEffect(() => {
    window.requestAnimationFrame(() => flow.fitView({ padding: props.preview ? 0.1 : 0.18, duration: 200 }));
  }, [flow, props.nodes, props.preview]);

  const handleNodesChange = useCallback((changes: NodeChange<MindmapNode>[]) => {
    setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes) as MindmapNode[]);
  }, []);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={props.edges}
      nodeTypes={nodeTypes}
      fitView
      nodesDraggable={!props.preview}
      nodesConnectable={!props.preview}
      elementsSelectable={!props.preview}
      panOnDrag={!props.preview}
      zoomOnScroll={!props.preview}
      zoomOnPinch={!props.preview}
      minZoom={props.preview ? 0.5 : 0.25}
      preventScrolling={!props.preview}
      onNodesChange={handleNodesChange}
      onNodeClick={props.onNodeClick}
      onPaneClick={(event) => {
        props.onPaneClick();
        if (props.preview || event.detail < 2) return;
        const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        props.onCreateAt(Math.round(position.x - CANVAS_MARGIN_X), Math.round(position.y - CANVAS_MARGIN_Y));
      }}
      onConnectStart={(_event, params) => {
        connectSourceRef.current = params.nodeId ?? null;
      }}
      onConnectEnd={(event) => {
        if (props.preview || !connectSourceRef.current) return;
        const maybeElement = event.target as HTMLElement | null;
        if (maybeElement?.closest(".react-flow__node")) {
          connectSourceRef.current = null;
          return;
        }
        const point = "clientX" in event
          ? { x: event.clientX, y: event.clientY }
          : { x: 0, y: 0 };
        const position = flow.screenToFlowPosition(point);
        props.onCreateConnected(connectSourceRef.current, Math.round(position.x - CANVAS_MARGIN_X), Math.round(position.y - CANVAS_MARGIN_Y));
        connectSourceRef.current = null;
      }}
      onNodeDragStop={props.onNodeDragStop}
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

  return (
    <div className={`mindmap-node kind-${graphNode.nodeKind}${props.selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="target" position={Position.Top} />
      <div className="mindmap-node-icon" aria-hidden="true">
        <GitBranch size={14} />
      </div>
      {props.data.childCount > 0 ? (
        <button
          type="button"
          className="mindmap-node-collapse nodrag"
          onClick={(event) => {
            event.stopPropagation();
            props.data.onToggleCollapse(graphNode.nodeKey);
          }}
          aria-label={graphNode.collapsed ? "Teilbaum ausklappen" : "Teilbaum einklappen"}
          title={graphNode.collapsed ? "Ausklappen" : "Einklappen"}
        >
          {graphNode.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
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
          onDoubleClick={() => editable && props.data.onStartEditing(graphNode.nodeKey)}
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
          {(["top", "right", "bottom", "left"] as const).map((side) => (
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
              aria-label="Freestyle-Knoten hinzufügen"
              title="Freestyle-Knoten hinzufügen"
            >
              <Plus size={12} />
            </button>
          ))}
        </>
      ) : null}
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { mindmap: MindmapNodeComponent };

function arrangeMindmap(mindmap: InitiativeMindmapData, selectedNodeKey: string | null): Map<string, GraphLayoutNode> {
  const included = selectedNodeKey ? descendantsIncluding(mindmap, selectedNodeKey) : new Set(mindmap.nodes.map((node) => node.nodeKey));
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "LR", ranksep: 108, nodesep: 42, marginx: 32, marginy: 32 });

  for (const node of mindmap.nodes) {
    if (!included.has(node.nodeKey)) continue;
    graph.setNode(node.nodeKey, { width: nodeWidth(node), height: nodeHeight(node) });
  }
  for (const edge of mindmap.edges) {
    if (included.has(edge.sourceNodeKey) && included.has(edge.targetNodeKey)) {
      graph.setEdge(edge.sourceNodeKey, edge.targetNodeKey);
    }
  }

  dagre.layout(graph);
  const arranged = new Map<string, GraphLayoutNode>();
  const anchor = selectedNodeKey ? mindmap.nodes.find((node) => node.nodeKey === selectedNodeKey) : null;
  const selectedLayout = selectedNodeKey ? graph.node(selectedNodeKey) : null;
  const offsetX = anchor && selectedLayout ? anchor.x - selectedLayout.x + (anchor.width ?? 190) / 2 : 0;
  const offsetY = anchor && selectedLayout ? anchor.y - selectedLayout.y + (anchor.height ?? 54) / 2 : 0;

  for (const node of mindmap.nodes) {
    if (!included.has(node.nodeKey)) continue;
    const layoutNode = graph.node(node.nodeKey);
    if (!layoutNode) continue;
    const width = nodeWidth(node);
    const height = nodeHeight(node);
    arranged.set(node.nodeKey, {
      ...node,
      x: layoutNode.x - width / 2 + offsetX,
      y: layoutNode.y - height / 2 + offsetY
    });
  }
  return arranged;
}

function descendantsIncluding(mindmap: InitiativeMindmapData, nodeKey: string): Set<string> {
  const result = new Set([nodeKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of mindmap.nodes) {
      if (node.parentNodeKey && result.has(node.parentNodeKey) && !result.has(node.nodeKey)) {
        result.add(node.nodeKey);
        changed = true;
      }
    }
  }
  return result;
}

function visibleMindmapNodeKeys(mindmap: InitiativeMindmapData, mode: MindmapMode): Set<string> {
  const rootKey = rootNodeKey(mindmap);
  const visible = new Set(
    mindmap.nodes
      .filter((node) => mode === "structure" || node.nodeKind === "initiative_root" || node.nodeKind === "freestyle")
      .map((node) => node.nodeKey)
  );
  const hasFreestyleChildren = mindmap.nodes.some((node) => node.parentNodeKey === "branch:freestyle");
  if (!hasFreestyleChildren) {
    visible.delete("branch:freestyle");
  }
  for (const node of mindmap.nodes) {
    if (!visible.has(node.nodeKey) || !node.collapsed) continue;
    for (const childKey of descendantsIncluding(mindmap, node.nodeKey)) {
      if (childKey !== node.nodeKey) visible.delete(childKey);
    }
  }
  visible.add(rootKey);
  return visible;
}

function visibleMindmapEdges(mindmap: InitiativeMindmapData, visibleNodeKeys: Set<string>, mode: MindmapMode): Array<{ id: string; sourceNodeKey: string; targetNodeKey: string }> {
  const rootKey = rootNodeKey(mindmap);
  return mindmap.nodes
    .filter((node) => visibleNodeKeys.has(node.nodeKey) && node.parentNodeKey)
    .map((node) => {
      const sourceNodeKey = visibleNodeKeys.has(node.parentNodeKey!) ? node.parentNodeKey! : mode === "freestyle" && node.parentNodeKey === "branch:freestyle" ? rootKey : null;
      return sourceNodeKey ? {
        id: `parent:${sourceNodeKey}->${node.nodeKey}`,
        sourceNodeKey,
        targetNodeKey: node.nodeKey
      } : null;
    })
    .filter((edge): edge is { id: string; sourceNodeKey: string; targetNodeKey: string } => Boolean(edge));
}

function childCountByNodeKey(mindmap: InitiativeMindmapData, mode: MindmapMode): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of mindmap.nodes) {
    if (!node.parentNodeKey) continue;
    if (mode === "freestyle" && node.nodeKind !== "freestyle") continue;
    counts.set(node.parentNodeKey, (counts.get(node.parentNodeKey) ?? 0) + 1);
  }
  return counts;
}

function rootNodeKey(mindmap: InitiativeMindmapData): string {
  const root = mindmap.nodes.find((node) => node.nodeKind === "initiative_root");
  return root?.nodeKey ?? (mindmap.scope.type === "initiative" ? `initiative:${mindmap.scope.initiativeId}` : "root");
}

function freestyleSnapshot(mindmap: InitiativeMindmapData): FreestyleSnapshot {
  return mindmap.nodes
    .filter((node) => node.nodeKind === "freestyle")
    .map((node) => ({
      nodeKey: node.nodeKey,
      parentNodeKey: node.parentNodeKey,
      label: node.label,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      collapsed: node.collapsed
    }));
}

function selectRelativeNode(
  mindmap: InitiativeMindmapData | null,
  selectedNodeKey: string | null,
  key: string,
  mode: MindmapMode,
  setSelectedNodeKey: (nodeKey: string | null) => void
): void {
  if (!mindmap) return;
  const visible = visibleMindmapNodeKeys(mindmap, mode);
  const nodes = mindmap.nodes.filter((node) => visible.has(node.nodeKey));
  const selected = nodes.find((node) => node.nodeKey === selectedNodeKey) ?? nodes.find((node) => node.nodeKey === rootNodeKey(mindmap));
  if (!selected) return;

  if (key === "ArrowLeft" && selected.parentNodeKey) {
    setSelectedNodeKey(visible.has(selected.parentNodeKey) ? selected.parentNodeKey : rootNodeKey(mindmap));
    return;
  }
  if (key === "ArrowRight") {
    const child = nodes.find((node) => node.parentNodeKey === selected.nodeKey);
    if (child) setSelectedNodeKey(child.nodeKey);
    return;
  }

  const siblings = nodes
    .filter((node) => node.parentNodeKey === selected.parentNodeKey)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const index = siblings.findIndex((node) => node.nodeKey === selected.nodeKey);
  if (index === -1) return;
  if (key === "ArrowUp") {
    setSelectedNodeKey(siblings[Math.max(0, index - 1)]?.nodeKey ?? selected.nodeKey);
  } else if (key === "ArrowDown") {
    setSelectedNodeKey(siblings[Math.min(siblings.length - 1, index + 1)]?.nodeKey ?? selected.nodeKey);
  }
}

function nodeWidth(node: GraphLayoutNode): number {
  if (node.nodeKind === "branch") return 220;
  if (node.nodeKind === "initiative_root") return Math.min(340, Math.max(300, node.label.length * 7 + 88));
  return Math.min(MAX_NODE_WIDTH, Math.max(300, node.label.length * 7 + 92));
}

function nodeHeight(node: GraphLayoutNode): number {
  if (node.nodeKind === "branch") return 54;
  const width = nodeWidth(node);
  const estimatedCharsPerLine = Math.max(18, Math.floor((width - 88) / 7));
  const estimatedLines = Math.min(3, Math.max(1, Math.ceil(node.label.length / estimatedCharsPerLine)));
  return BASE_NODE_HEIGHT + (estimatedLines - 1) * 18;
}
