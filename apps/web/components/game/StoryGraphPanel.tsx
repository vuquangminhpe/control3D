"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  addEdge,
  Connection,
  Edge,
  Node,
  Position,
  Handle,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as THREE from "three";
import dagre from "@dagrejs/dagre";

import {
  type StoryGraph,
  type StoryNode,
  type StoryEdge,
  type StoryVariable,
  type StoryNodeKind,
  type StoryVariableType,
} from "@/store/gameStore";

// Import model scaling helper
import { getIntelligentScaleMultiplier } from "@/lib/3d/camera";

type StoryAssetAction = {
  id: string;
  name: string;
};

function getStoryAssetActions(asset: any): StoryAssetAction[] {
  const manifest = asset?.customProps?.characterAnimation;
  if (
    !manifest ||
    typeof manifest !== "object" ||
    !Array.isArray(manifest.actions)
  ) {
    return [];
  }
  return manifest.actions
    .filter(
      (action: any) =>
        action && typeof action === "object" && action.id && action.name,
    )
    .map((action: any) => ({
      id: String(action.id),
      name: String(action.name),
    }));
}

// Custom node styling
const nodeStyle: React.CSSProperties = {
  background:
    "linear-gradient(135deg, rgba(20, 25, 40, 0.95), rgba(10, 12, 22, 0.98))",
  color: "#fff",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "12px",
  padding: "10px",
  fontSize: "12px",
  width: "220px",
  boxShadow:
    "0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  backdropFilter: "blur(8px)",
  transition: "all 0.2s ease",
};

// Node wrapper helper
function NodeWrapper({
  title,
  kind,
  selected,
  children,
  error,
}: {
  title: string;
  kind: string;
  selected?: boolean;
  children: React.ReactNode;
  error?: string;
}) {
  const getKindColor = () => {
    switch (kind) {
      case "start":
        return "#00ffc4";
      case "dialogue":
        return "#3b82f6";
      case "choice":
        return "#a855f7";
      case "character":
        return "#10b981";
      case "condition":
        return "#eab308";
      case "set_variable":
        return "#f97316";
      case "random":
        return "#ec4899";
      case "delay":
        return "#64748b";
      case "comment":
        return "#78716c";
      case "bark":
        return "#06b6d4";
      case "animation":
        return "#8b5cf6";
      default:
        return "#94a3b8";
    }
  };

  const kindBorder = selected
    ? `2px solid ${getKindColor()}`
    : "1px solid rgba(255, 255, 255, 0.15)";

  const shadow = selected
    ? `0 0 16px ${getKindColor()}33, 0 8px 32px rgba(0, 0, 0, 0.6)`
    : "0 8px 32px rgba(0, 0, 0, 0.4)";

  return (
    <div
      style={{
        ...nodeStyle,
        border: kindBorder,
        boxShadow: shadow,
        ...(kind === "comment"
          ? { background: "rgba(40, 35, 30, 0.95)", borderStyle: "dashed" }
          : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "4px",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontWeight: 900,
            textTransform: "uppercase",
            fontSize: "10px",
            color: getKindColor(),
          }}
        >
          {kind}
        </span>
        <strong
          style={{
            fontSize: "11px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "120px",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </strong>
      </div>
      {children}
      {error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: "10px",
            marginTop: "4px",
            fontWeight: "bold",
          }}
        >
          ⚠ {error}
        </div>
      )}
    </div>
  );
}

// 1. Start Node Component
function StartNode({ selected }: { selected: boolean }) {
  return (
    <NodeWrapper title="Start" kind="start" selected={selected}>
      <div style={{ color: "#94a3b8", fontSize: "11px" }}>Flow entry point</div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#00ffc4", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 2. Dialogue Node Component
function DialogueNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper
      title={node.title}
      kind="dialogue"
      selected={selected}
      error={!node.text ? "Text is empty" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#3b82f6", width: 8, height: 8 }}
      />
      <div
        style={{
          fontSize: "11px",
          color: "#cbd5e1",
          maxHeight: "60px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontStyle: "italic",
        }}
      >
        "{node.text || "No text set"}"
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#3b82f6", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 3. Choice Node Component
function ChoiceNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  const choices = node.choices || ["Next"];

  return (
    <NodeWrapper
      title={node.title}
      kind="choice"
      selected={selected}
      error={!choices.length ? "No choices set" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#a855f7", width: 8, height: 8 }}
      />
      <div style={{ fontSize: "11px", color: "#cbd5e1", marginBottom: "4px" }}>
        {node.text ? `"${node.text}"` : "Player choice branching:"}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          marginTop: "6px",
        }}
      >
        {choices.map((choiceText, index) => (
          <div
            key={index}
            style={{
              background: "rgba(255,255,255,0.05)",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "10px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              position: "relative",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "160px",
              }}
            >
              {index + 1}. {choiceText}
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={`choice-${index}`}
              style={{
                background: "#a855f7",
                width: 6,
                height: 6,
                right: "-13px",
              }}
            />
          </div>
        ))}
      </div>
    </NodeWrapper>
  );
}

// Helper to safely resolve assets for rendering
let cachedBuilderModelViewer: any = null;

// 4. Character Node Component
function CharacterNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;

  // Let's resolve the BuilderModelViewer dynamically
  if (!cachedBuilderModelViewer && typeof window !== "undefined") {
    try {
      const { BuilderModelViewer } = require("./GameWorkbench");
      cachedBuilderModelViewer = BuilderModelViewer;
    } catch (e) {
      // fallback
    }
  }

  const ModelViewer = cachedBuilderModelViewer;

  return (
    <NodeWrapper
      title={node.title}
      kind="character"
      selected={selected}
      error={!node.fileUrl ? "No model model set" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#10b981", width: 8, height: 8 }}
      />
      <div
        style={{
          height: "70px",
          borderRadius: "6px",
          overflow: "hidden",
          background: "#111827",
          marginBottom: "6px",
          position: "relative",
        }}
      >
        {node.fileUrl && ModelViewer ? (
          <ModelViewer
            compact
            interactive={false}
            fitHeight={0.92}
            src={node.fileUrl}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#6b7280",
              fontSize: "10px",
            }}
          >
            No model loaded
          </div>
        )}
      </div>
      <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
        NPC Speaker: <strong>{node.modelName || "None"}</strong>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#10b981", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 5. Condition Node Component
function ConditionNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper
      title={node.title}
      kind="condition"
      selected={selected}
      error={!node.conditionVariableId ? "No variable target" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#eab308", width: 8, height: 8 }}
      />
      <div
        style={{
          background: "rgba(234, 179, 8, 0.08)",
          padding: "6px",
          borderRadius: "6px",
          border: "1px solid rgba(234, 179, 8, 0.2)",
        }}
      >
        <code style={{ fontSize: "10px", color: "#fef08a" }}>
          If: ${node.conditionVariableId || "?"}{" "}
          {node.conditionOperator || "=="} {String(node.conditionValue ?? "?")}
        </code>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          marginTop: "8px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: "10px",
            color: "#10b981",
            paddingRight: "10px",
          }}
        >
          True Branch
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ background: "#10b981", width: 7, height: 7, top: "25%" }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: "10px",
            color: "#ef4444",
            paddingRight: "10px",
          }}
        >
          False Branch
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ background: "#ef4444", width: 7, height: 7, top: "75%" }}
          />
        </div>
      </div>
    </NodeWrapper>
  );
}

// 6. Set Variable Node Component
function SetVariableNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper
      title={node.title}
      kind="set_variable"
      selected={selected}
      error={!node.variableId ? "No variable target" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#f97316", width: 8, height: 8 }}
      />
      <div
        style={{
          background: "rgba(249, 115, 22, 0.08)",
          padding: "6px",
          borderRadius: "6px",
          border: "1px solid rgba(249, 115, 22, 0.2)",
        }}
      >
        <code style={{ fontSize: "10px", color: "#ffedd5" }}>
          Set: ${node.variableId || "?"} {node.variableOperator || "="}{" "}
          {String(node.variableValue ?? "?")}
        </code>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#f97316", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 7. Event Node Component
function EventNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper
      title={node.title}
      kind="event"
      selected={selected}
      error={!node.action ? "No event trigger set" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#ec4899", width: 8, height: 8 }}
      />
      <div style={{ color: "#cbd5e1", fontSize: "11px" }}>
        Trigger Event: <strong>{node.action || "None"}</strong>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#ec4899", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 8. Shop Node Component
function ShopNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper title={node.title} kind="shop" selected={selected}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#f59e0b", width: 8, height: 8 }}
      />
      <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
        Open shop interface.
      </div>
      <div style={{ fontSize: "10px", color: "#fcd34d", marginTop: "4px" }}>
        Cost change: {node.currencyChange ?? 0} Gold
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#f59e0b", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 9. Random Node Component
function RandomNode({ selected }: { selected: boolean }) {
  return (
    <NodeWrapper title="Randomizer" kind="random" selected={selected}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#ec4899", width: 8, height: 8 }}
      />
      <div style={{ fontSize: "10px", color: "#a1a1aa", marginBottom: "6px" }}>
        Weighted random split:
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: "10px",
            color: "#cbd5e1",
            paddingRight: "10px",
          }}
        >
          Path A (50%)
          <Handle
            type="source"
            position={Position.Right}
            id="path-0"
            style={{ background: "#ec4899", width: 6, height: 6, top: "25%" }}
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            fontSize: "10px",
            color: "#cbd5e1",
            paddingRight: "10px",
          }}
        >
          Path B (50%)
          <Handle
            type="source"
            position={Position.Right}
            id="path-1"
            style={{ background: "#ec4899", width: 6, height: 6, top: "75%" }}
          />
        </div>
      </div>
    </NodeWrapper>
  );
}

// 10. Delay Node Component
function DelayNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper title={node.title} kind="delay" selected={selected}>
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#64748b", width: 8, height: 8 }}
      />
      <div style={{ fontSize: "11px", color: "#cbd5e1" }}>
        Wait: <strong>{node.delayDuration ?? 1} seconds</strong>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#64748b", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 11. Comment Node Component
function CommentNode({ data }: { data: any }) {
  const node = data.node as StoryNode;
  return (
    <div
      style={{
        ...nodeStyle,
        background: "rgba(30, 25, 20, 0.76)",
        border: "1px dashed rgba(251, 146, 60, 0.4)",
        color: "#fbd38d",
        width: "220px",
        padding: "8px",
      }}
    >
      <div
        style={{
          fontSize: "9px",
          color: "rgba(251, 146, 60, 0.7)",
          fontWeight: "bold",
          textTransform: "uppercase",
        }}
      >
        Annotation
      </div>
      <div style={{ fontSize: "11px", whiteSpace: "pre-wrap" }}>
        {node.text || "Write note here..."}
      </div>
    </div>
  );
}

// 12. Bark Node Component
function BarkNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  return (
    <NodeWrapper
      title={node.title}
      kind="bark"
      selected={selected}
      error={!node.text ? "Text is empty" : undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#06b6d4", width: 8, height: 8 }}
      />
      <div style={{ fontSize: "11px", color: "#a5f3fc" }}>
        Ambient line: "{node.text || "None"}"
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#06b6d4", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

// 13. Animation Node Component
function AnimationNode({ data, selected }: { data: any; selected: boolean }) {
  const node = data.node as StoryNode;
  const actionLabel = node.characterActionName || node.animationName || "None";
  return (
    <NodeWrapper
      title={node.title}
      kind="animation"
      selected={selected}
      error={
        !node.characterActionId && !node.animationName
          ? "No character action"
          : undefined
      }
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        style={{ background: "#8b5cf6", width: 8, height: 8 }}
      />
      <div style={{ fontSize: "11px", color: "#ddd6fe" }}>
        {node.modelName ? (
          <div>
            Character: <strong>{node.modelName}</strong>
          </div>
        ) : null}
        Action: <strong>{actionLabel}</strong>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        style={{ background: "#8b5cf6", width: 8, height: 8 }}
      />
    </NodeWrapper>
  );
}

export function StoryGraphPanel({
  assetLibrary,
  graph,
  onChange,
  onSave,
}: {
  assetLibrary: any[];
  graph: StoryGraph;
  onChange: (graph: StoryGraph) => void;
  onSave?: () => void;
}) {
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedEdgeId, setSelectedEdgeId] = useState("");
  const [activeTab, setActiveTab] = useState<"inspector" | "variables">(
    "inspector",
  );
  const [newVarType, setNewVarType] = useState<StoryVariableType>("string");

  // Playtest state
  const [playtestActive, setPlaytestActive] = useState(false);
  const [playtestCurrentNodeId, setPlaytestCurrentNodeId] = useState<
    string | null
  >(null);
  const [playtestVariables, setPlaytestVariables] = useState<
    Record<string, string | number | boolean>
  >({});
  const [playtestLog, setPlaytestLog] = useState<string[]>([]);
  const [playtestText, setPlaytestText] = useState("");
  const [playtestChoices, setPlaytestChoices] = useState<
    Array<{ text: string; targetId: string; handle: string }>
  >([]);

  // Variables list
  const variables = useMemo(() => graph.variables || [], [graph.variables]);

  // Undo / Redo history stacks
  const [history, setHistory] = useState<StoryGraph[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Push snapshot into history
  const pushSnapshot = useCallback(
    (nextState: StoryGraph) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(JSON.parse(JSON.stringify(nextState)));
      if (nextHistory.length > 50) nextHistory.shift();
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
    },
    [history, historyIndex],
  );

  // Initial populate of history if empty
  useEffect(() => {
    if (history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(graph))]);
      setHistoryIndex(0);
    }
  }, [graph, history.length]);

  const undo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      const snapshot = history[idx];
      onChange(JSON.parse(JSON.stringify(snapshot)));
      setSelectedNodeId("");
      setSelectedEdgeId("");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      const snapshot = history[idx];
      onChange(JSON.parse(JSON.stringify(snapshot)));
      setSelectedNodeId("");
      setSelectedEdgeId("");
    }
  };

  // Setup React Flow nodes and edges state
  const registeredNodeTypes = useMemo(
    () => ({
      start: StartNode,
      dialogue: DialogueNode,
      choice: ChoiceNode,
      character: CharacterNode,
      condition: ConditionNode,
      set_variable: SetVariableNode,
      event: EventNode,
      shop: ShopNode,
      random: RandomNode,
      delay: DelayNode,
      comment: CommentNode,
      bark: BarkNode,
      animation: AnimationNode,
    }),
    [],
  );

  // Update node helper
  const updateNode = useCallback(
    (nodeId: string, updates: Partial<StoryNode>) => {
      const updatedNodes = graph.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...updates } : node,
      );
      const nextGraph = { ...graph, nodes: updatedNodes };
      onChange(nextGraph);
      pushSnapshot(nextGraph);
    },
    [graph, onChange, pushSnapshot],
  );

  // Assign Character
  const assignCharacter = useCallback(
    (nodeId: string, assetId: string) => {
      const characterAssets = assetLibrary.filter(
        (asset) => asset.category === "character",
      );
      const asset = characterAssets.find((entry) => entry.id === assetId);
      if (!asset) return;

      updateNode(nodeId, {
        kind: "character",
        modelId: asset.id,
        modelName: asset.name,
        fileUrl: asset.fileUrl,
        title: asset.name,
      });
    },
    [assetLibrary, updateNode],
  );

  // Delete node helper
  const deleteNode = useCallback(
    (nodeId: string) => {
      const nodeToDelete = graph.nodes.find((n) => n.id === nodeId);
      if (nodeToDelete?.kind === "start") return; // cannot delete start node

      const remainingNodes = graph.nodes.filter((n) => n.id !== nodeId);
      const remainingEdges = graph.edges.filter(
        (e) => e.sourceId !== nodeId && e.targetId !== nodeId,
      );

      const nextGraph = {
        ...graph,
        nodes: remainingNodes,
        edges: remainingEdges,
      };
      onChange(nextGraph);
      pushSnapshot(nextGraph);
      setSelectedNodeId("");
    },
    [graph, onChange, pushSnapshot],
  );

  // Map react flow nodes
  const nodes: Node[] = useMemo(() => {
    return graph.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: {
        node,
        onUpdate: (updates: Partial<StoryNode>) => updateNode(node.id, updates),
        onDelete: () => deleteNode(node.id),
      },
      selected: node.id === selectedNodeId,
    }));
  }, [graph.nodes, selectedNodeId, updateNode, deleteNode]);

  // Map react flow edges
  const edges: Edge[] = useMemo(() => {
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      sourceHandle: edge.sourceHandle || undefined,
      targetHandle: edge.targetHandle || undefined,
      label: edge.label || undefined,
      type: "smoothstep",
      animated: true,
      selected: edge.id === selectedEdgeId,
      style: {
        stroke:
          edge.id === selectedEdgeId ? "#00ffc4" : "rgba(255, 255, 255, 0.4)",
        strokeWidth: edge.id === selectedEdgeId ? 3 : 1.5,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color:
          edge.id === selectedEdgeId ? "#00ffc4" : "rgba(255, 255, 255, 0.4)",
      },
    }));
  }, [graph.edges, selectedEdgeId]);

  // Sync positions when node drag stops
  const onNodeDragStop = useCallback(
    (event: any, node: Node) => {
      const updatedNodes = graph.nodes.map((n) =>
        n.id === node.id ? { ...n, position: node.position } : n,
      );
      const nextGraph = { ...graph, nodes: updatedNodes };
      onChange(nextGraph);
      pushSnapshot(nextGraph);
    },
    [graph, onChange, pushSnapshot],
  );

  // Node selection triggers inspector selection
  const onSelectionChange = useCallback(
    (params: { nodes: Node[]; edges: Edge[] }) => {
      if (params.nodes[0]) {
        setSelectedNodeId(params.nodes[0].id);
        setSelectedEdgeId("");
        setActiveTab("inspector");
      } else if (params.edges[0]) {
        setSelectedEdgeId(params.edges[0].id);
        setSelectedNodeId("");
        setActiveTab("inspector");
      } else {
        setSelectedNodeId("");
        setSelectedEdgeId("");
      }
    },
    [],
  );

  // Handle Connections
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;

      // Check if edge already exists
      const exists = graph.edges.some(
        (e) =>
          e.sourceId === connection.source &&
          e.targetId === connection.target &&
          e.sourceHandle === connection.sourceHandle,
      );
      if (exists) return;

      const newEdge: StoryEdge = {
        id: `story-edge-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        sourceId: connection.source,
        targetId: connection.target,
        label: "Next",
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      };

      const nextGraph = {
        ...graph,
        edges: [...graph.edges, newEdge],
      };
      onChange(nextGraph);
      pushSnapshot(nextGraph);
      setSelectedEdgeId(newEdge.id);
    },
    [graph, onChange, pushSnapshot],
  );

  // Delete edge
  const deleteEdge = useCallback(
    (edgeId: string) => {
      const remainingEdges = graph.edges.filter((e) => e.id !== edgeId);
      const nextGraph = { ...graph, edges: remainingEdges };
      onChange(nextGraph);
      pushSnapshot(nextGraph);
      setSelectedEdgeId("");
    },
    [graph, onChange, pushSnapshot],
  );

  // Add generic node
  const addNode = (kind: StoryNodeKind, asset?: any) => {
    const id = `story-node-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const position = {
      x: 100 + Math.random() * 150,
      y: 100 + Math.random() * 150,
    };

    const newNode: StoryNode = {
      id,
      kind,
      title:
        asset?.name ??
        (kind === "character" ? "Character" : kind.toUpperCase()),
      text:
        kind === "choice"
          ? "Player chooses:"
          : kind === "start"
            ? "Story begins here."
            : "",
      modelId: asset?.id ?? null,
      modelName: asset?.name ?? null,
      fileUrl: asset?.fileUrl ?? null,
      action: kind === "shop" ? "trade" : kind === "event" ? "trigger" : null,
      currencyChange: kind === "shop" ? 0 : null,
      position,
      choices: kind === "choice" ? ["Option A", "Option B"] : null,
      variableId: null,
      variableValue: null,
      variableOperator: kind === "set_variable" ? "set" : null,
      delayDuration: kind === "delay" ? 1 : null,
      animationName: null,
      conditionVariableId: null,
      conditionOperator: "==",
      conditionValue: "true",
    };

    const nextGraph = {
      ...graph,
      nodes: [...graph.nodes, newNode],
    };
    onChange(nextGraph);
    pushSnapshot(nextGraph);
    setSelectedNodeId(id);
    setSelectedEdgeId("");
  };

  // Variable Management actions
  const addVariable = (
    name: string,
    type: StoryVariableType,
    defaultValue: any,
  ) => {
    const nameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!nameRegex.test(name)) {
      alert(
        "Variable name must start with letter/underscore and contain only alphanumeric/underscore characters.",
      );
      return;
    }
    if (variables.some((v) => v.name === name)) {
      alert("Variable with this name already exists.");
      return;
    }

    const newVar: StoryVariable = {
      id: `var-${Date.now()}`,
      name,
      type,
      defaultValue,
    };

    const nextGraph = {
      ...graph,
      variables: [...variables, newVar],
    };
    onChange(nextGraph);
    pushSnapshot(nextGraph);
  };

  const deleteVariable = (varId: string) => {
    const updatedVars = variables.filter((v) => v.id !== varId);
    const nextGraph = {
      ...graph,
      variables: updatedVars,
    };
    onChange(nextGraph);
    pushSnapshot(nextGraph);
  };

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedNodeId) || null,
    [graph.nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => graph.edges.find((e) => e.id === selectedEdgeId) || null,
    [graph.edges, selectedEdgeId],
  );
  const characterAssets = useMemo(
    () => assetLibrary.filter((asset) => asset.category === "character"),
    [assetLibrary],
  );
  const selectedAnimationAsset = selectedNode?.modelId
    ? characterAssets.find((asset) => asset.id === selectedNode.modelId)
    : null;
  const selectedAnimationActions = getStoryAssetActions(selectedAnimationAsset);

  // Dagre Auto layout algorithm
  const layoutGraph = () => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 60, edgesep: 40, ranksep: 100 });
    g.setDefaultEdgeLabel(() => ({}));

    graph.nodes.forEach((node) => {
      g.setNode(node.id, { width: 220, height: 120 });
    });

    graph.edges.forEach((edge) => {
      g.setEdge(edge.sourceId, edge.targetId);
    });

    dagre.layout(g);

    const laidOutNodes = graph.nodes.map((node) => {
      const nodeLayout = g.node(node.id);
      return {
        ...node,
        position: {
          x: nodeLayout.x - 110,
          y: nodeLayout.y - 60,
        },
      };
    });

    const nextGraph = {
      ...graph,
      nodes: laidOutNodes,
    };
    onChange(nextGraph);
    pushSnapshot(nextGraph);
  };

  // Playtest engine
  const startPlaytest = () => {
    const start = graph.nodes.find((n) => n.kind === "start");
    if (!start) {
      alert("No Start node found!");
      return;
    }

    // Initialize variables map
    const varsMap: Record<string, string | number | boolean> = {};
    variables.forEach((v) => {
      varsMap[v.name] = v.defaultValue;
    });

    setPlaytestVariables(varsMap);
    setPlaytestLog(["Initializing Playtest. Variables set to defaults."]);
    setPlaytestActive(true);
    runPlaytestStep(start.id, varsMap);
  };

  const runPlaytestStep = (
    nodeId: string,
    currentVars: Record<string, string | number | boolean>,
  ) => {
    setPlaytestCurrentNodeId(nodeId);
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) {
      setPlaytestLog((prev) => [...prev, `Error: Node ${nodeId} not found.`]);
      return;
    }

    setPlaytestLog((prev) => [
      ...prev,
      `Step -> [${node.kind.toUpperCase()}] ${node.title}`,
    ]);

    // Handle variables updates if node is set_variable
    let nextVars = { ...currentVars };
    if (node.kind === "set_variable" && node.variableId) {
      const varDef = variables.find((v) => v.name === node.variableId);
      if (varDef) {
        const rawVal = node.variableValue ?? "";
        let val: string | number | boolean = rawVal;
        if (varDef.type === "number") {
          val = Number(rawVal) || 0;
        } else if (varDef.type === "boolean") {
          val = rawVal === "true" || rawVal === "1";
        }

        const op = node.variableOperator || "set";
        if (op === "add" && varDef.type === "number") {
          nextVars[node.variableId] =
            Number(nextVars[node.variableId]) + Number(val);
        } else if (op === "sub" && varDef.type === "number") {
          nextVars[node.variableId] =
            Number(nextVars[node.variableId]) - Number(val);
        } else {
          nextVars[node.variableId] = val;
        }
        setPlaytestVariables(nextVars);
        setPlaytestLog((prev) => [
          ...prev,
          `Updated Variable: $${node.variableId} = ${nextVars[node.variableId!]}`,
        ]);
      }
    }

    // Handle condition nodes
    if (node.kind === "condition" && node.conditionVariableId) {
      const val = nextVars[node.conditionVariableId];
      const op = node.conditionOperator || "==";
      const rawCheckVal = node.conditionValue ?? "";
      let checkVal: string | number | boolean = rawCheckVal;
      const varDef = variables.find((v) => v.name === node.conditionVariableId);
      if (varDef) {
        if (varDef.type === "number") {
          checkVal = Number(rawCheckVal) || 0;
        } else if (varDef.type === "boolean") {
          checkVal = rawCheckVal === "true" || rawCheckVal === "1";
        }
      }

      let isTrue = false;
      if (op === "==") isTrue = val === checkVal;
      else if (op === "!=") isTrue = val !== checkVal;
      else if (op === ">") isTrue = val > checkVal;
      else if (op === "<") isTrue = val < checkVal;
      else if (op === ">=") isTrue = val >= checkVal;
      else if (op === "<=") isTrue = val <= checkVal;

      setPlaytestLog((prev) => [
        ...prev,
        `Condition Check: $${node.conditionVariableId} ${op} ${checkVal} -> ${isTrue}`,
      ]);

      const matchHandle = isTrue ? "true" : "false";
      const edge = graph.edges.find(
        (e) => e.sourceId === node.id && e.sourceHandle === matchHandle,
      );
      if (edge) {
        setTimeout(() => runPlaytestStep(edge.targetId, nextVars), 800);
      } else {
        setPlaytestLog((prev) => [
          ...prev,
          `End of path (No connection for true/false).`,
        ]);
        setPlaytestChoices([]);
        setPlaytestText("Path ended.");
      }
      return;
    }

    // Handle delay nodes
    if (node.kind === "delay") {
      const delay = (node.delayDuration ?? 1) * 1000;
      setPlaytestText(`Waiting for ${node.delayDuration} seconds...`);
      setPlaytestChoices([]);
      const edge = graph.edges.find((e) => e.sourceId === node.id);
      if (edge) {
        setTimeout(() => runPlaytestStep(edge.targetId, nextVars), delay);
      } else {
        setPlaytestLog((prev) => [...prev, `Delay completed. Path ends.`]);
      }
      return;
    }

    // Handle random nodes
    if (node.kind === "random") {
      const outlets = graph.edges.filter((e) => e.sourceId === node.id);
      if (outlets.length > 0) {
        const randomIndex = Math.floor(Math.random() * outlets.length);
        const nextEdge = outlets[randomIndex];
        setPlaytestLog((prev) => [
          ...prev,
          `Randomizer routed to outlet handle: ${nextEdge.sourceHandle}`,
        ]);
        setTimeout(() => runPlaytestStep(nextEdge.targetId, nextVars), 800);
      } else {
        setPlaytestLog((prev) => [...prev, `Random node has no outputs.`]);
      }
      return;
    }

    // Render dialogues, barks, start, character names
    let label = node.text || "";
    if (node.kind === "shop")
      label = `Opened Shop (Gold change: ${node.currencyChange ?? 0})`;
    if (node.kind === "event")
      label = `Action Event Triggered: "${node.action}"`;
    if (node.kind === "animation") {
      label = `Character Action: "${node.characterActionName || node.animationName || "None"}"${node.modelName ? ` on ${node.modelName}` : ""}`;
    }
    if (node.kind === "bark") label = `Ambient text bark: "${node.text}"`;
    if (node.kind === "character")
      label = `Dialogue with character: ${node.modelName || "NPC"}`;

    setPlaytestText(label || "No dialogue text set.");

    // Handle branches (choices vs simple outputs)
    if (node.kind === "choice") {
      const opts = (node.choices || []).map((choiceText, idx) => {
        const edge = graph.edges.find(
          (e) => e.sourceId === node.id && e.sourceHandle === `choice-${idx}`,
        );
        return {
          text: choiceText,
          targetId: edge ? edge.targetId : "",
          handle: `choice-${idx}`,
        };
      });
      setPlaytestChoices(opts);
    } else {
      // Find simple single next edge
      const edge = graph.edges.find((e) => e.sourceId === node.id);
      if (edge) {
        setPlaytestChoices([
          { text: "Continue", targetId: edge.targetId, handle: "out" },
        ]);
      } else {
        setPlaytestChoices([]);
        setPlaytestLog((prev) => [...prev, `Path ends. Dialogue complete.`]);
      }
    }
  };

  // Node warnings / validation
  const validationWarnings = useMemo(() => {
    const warnings: Record<string, string[]> = {};
    graph.nodes.forEach((n) => {
      const list: string[] = [];
      // Start node outputs
      if (n.kind === "start") {
        const connects = graph.edges.some((e) => e.sourceId === n.id);
        if (!connects)
          list.push("Start node is not connected to any other node.");
      }
      // Dialogue/Bark nodes text check
      if ((n.kind === "dialogue" || n.kind === "bark") && !n.text) {
        list.push("Dialogue text is missing.");
      }
      // Variable targets check
      if (n.kind === "set_variable" && !n.variableId) {
        list.push("No variable specified to modify.");
      }
      if (n.kind === "condition" && !n.conditionVariableId) {
        list.push("No check variable specified.");
      }
      if (n.kind === "event" && !n.action) {
        list.push("Event action is missing.");
      }
      // Orphan check
      if (n.kind !== "start") {
        const hasInput = graph.edges.some((e) => e.targetId === n.id);
        const hasOutput = graph.edges.some((e) => e.sourceId === n.id);
        if (!hasInput) list.push("Orphan node (no inputs connected).");
        if (!hasOutput && n.kind !== "comment") {
          list.push("Terminal node (no outputs connected).");
        }
      }

      if (list.length > 0) warnings[n.id] = list;
    });
    return warnings;
  }, [graph]);

  // Sync node changes back
  const updateEdge = useCallback(
    (edgeId: string, updates: Partial<StoryEdge>) => {
      const updatedEdges = graph.edges.map((e) =>
        e.id === edgeId ? { ...e, ...updates } : e,
      );
      const nextGraph = { ...graph, edges: updatedEdges };
      onChange(nextGraph);
      pushSnapshot(nextGraph);
    },
    [graph, onChange, pushSnapshot],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: "50px minmax(0, 1fr)",
        height: "100%",
        width: "100%",
        background: "#050812",
        color: "#fff",
      }}
    >
      {/* Top action toolbar */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "0 18px",
          background: "rgba(5, 8, 18, 0.9)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              color: "#00ffc4",
              fontSize: "11px",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            Story Graph Workspace
          </span>
          <span style={{ color: "rgba(255,255,255,0.4)" }}>|</span>
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className="editor-btn"
            style={{ padding: "4px 10px", fontSize: "11px" }}
          >
            ↩ Undo ({historyIndex})
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className="editor-btn"
            style={{ padding: "4px 10px", fontSize: "11px" }}
          >
            ↪ Redo
          </button>
          <button
            onClick={layoutGraph}
            className="editor-btn"
            style={{ padding: "4px 10px", fontSize: "11px" }}
          >
            Auto Arrange
          </button>
          {onSave && (
            <button
              onClick={onSave}
              className="editor-btn"
              style={{
                padding: "4px 12px",
                background: "#00ffc4",
                color: "#000",
                fontWeight: "bold",
                border: "none",
                borderRadius: "4px",
                fontSize: "11px",
                cursor: "pointer",
                marginLeft: "6px",
              }}
            >
              Save Story
            </button>
          )}
        </div>

        {/* Nodes Toolbar */}
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            onClick={() => addNode("dialogue")}
            style={{
              background: "#3b82f633",
              border: "1px solid #3b82f6",
              color: "#60a5fa",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Dialogue
          </button>
          <button
            onClick={() => addNode("choice")}
            style={{
              background: "#a855f733",
              border: "1px solid #a855f7",
              color: "#c084fc",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Choice
          </button>
          <button
            onClick={() => addNode("condition")}
            style={{
              background: "#eab30833",
              border: "1px solid #eab308",
              color: "#fef08a",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Condition
          </button>
          <button
            onClick={() => addNode("set_variable")}
            style={{
              background: "#f9731633",
              border: "1px solid #f97316",
              color: "#ffedd5",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Set Variable
          </button>
          <button
            onClick={() => addNode("event")}
            style={{
              background: "#ec489933",
              border: "1px solid #ec4899",
              color: "#fbcfe8",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Event
          </button>
          <button
            onClick={() => addNode("shop")}
            style={{
              background: "#f59e0b33",
              border: "1px solid #f59e0b",
              color: "#fcd34d",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Shop
          </button>
          <button
            onClick={() => addNode("random")}
            style={{
              background: "#a855f722",
              border: "1px solid #a855f766",
              color: "#cbd5e1",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Random
          </button>
          <button
            onClick={() => addNode("delay")}
            style={{
              background: "#64748b33",
              border: "1px solid #64748b",
              color: "#94a3b8",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Delay
          </button>
          <button
            onClick={() => addNode("bark")}
            style={{
              background: "#06b6d433",
              border: "1px solid #06b6d4",
              color: "#a5f3fc",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Bark
          </button>
          <button
            onClick={() => addNode("animation")}
            style={{
              background: "#8b5cf633",
              border: "1px solid #8b5cf6",
              color: "#ddd6fe",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Anim
          </button>
          <button
            onClick={() => addNode("comment")}
            style={{
              background: "#78716c33",
              border: "1px solid #78716c",
              color: "#d6d3d1",
              borderRadius: "4px",
              padding: "4px 10px",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            + Comment
          </button>
        </div>

        <div>
          <button
            onClick={startPlaytest}
            style={{
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "6px 14px",
              fontWeight: "bold",
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            ▶ Playtest Flow
          </button>
        </div>
      </header>

      {/* Main editor area with workspace split */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          minHeight: 0,
        }}
      >
        {/* React Flow Canvas */}
        <div
          ref={reactFlowWrapper}
          style={{ height: "100%", width: "100%", background: "#070c18" }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={registeredNodeTypes}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            fitView
          >
            <Background color="#1d2d44" gap={16} size={1} />
            <Controls
              style={{
                background: "#050812",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
              }}
            />
            <MiniMap
              style={{
                background: "#050812",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "6px",
              }}
              nodeColor={(n) => {
                if (n.type === "start") return "#00ffc4";
                if (n.type === "dialogue") return "#3b82f6";
                if (n.type === "choice") return "#a855f7";
                if (n.type === "condition") return "#eab308";
                return "#71717a";
              }}
              maskColor="rgba(5, 8, 18, 0.7)"
            />
          </ReactFlow>
        </div>

        {/* Sidebar panels */}
        <aside
          style={{
            borderLeft: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(5, 8, 18, 0.95)",
            display: "grid",
            gridTemplateRows: "40px minmax(0, 1fr)",
            padding: "10px",
          }}
        >
          {/* Sidebar tabs */}
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              gap: "10px",
            }}
          >
            <button
              onClick={() => setActiveTab("inspector")}
              style={{
                background: "none",
                border: "none",
                color:
                  activeTab === "inspector"
                    ? "#00ffc4"
                    : "rgba(255,255,255,0.4)",
                fontWeight: activeTab === "inspector" ? "bold" : "normal",
                fontSize: "11px",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Properties
            </button>
            <button
              onClick={() => setActiveTab("variables")}
              style={{
                background: "none",
                border: "none",
                color:
                  activeTab === "variables"
                    ? "#00ffc4"
                    : "rgba(255,255,255,0.4)",
                fontWeight: activeTab === "variables" ? "bold" : "normal",
                fontSize: "11px",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              Variables
            </button>
          </div>

          <div style={{ overflowY: "auto", padding: "10px 0" }}>
            {/* Tab: Inspector properties */}
            {activeTab === "inspector" && (
              <div>
                {selectedNode ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "bold",
                          color: "#10b981",
                        }}
                      >
                        Editing Node
                      </span>
                      <button
                        onClick={() => deleteNode(selectedNode.id)}
                        disabled={selectedNode.kind === "start"}
                        style={{
                          background: "#ef444433",
                          border: "1px solid #ef4444",
                          color: "#f87171",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          cursor: "pointer",
                        }}
                      >
                        Delete Node
                      </button>
                    </div>

                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        fontSize: "11px",
                      }}
                    >
                      Title
                      <input
                        value={selectedNode.title}
                        onChange={(e) =>
                          updateNode(selectedNode.id, { title: e.target.value })
                        }
                        style={{
                          background: "#111827",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "#fff",
                          borderRadius: "4px",
                          padding: "6px",
                          fontSize: "11px",
                        }}
                      />
                    </label>

                    {/* Dialogue & Bark text */}
                    {(selectedNode.kind === "dialogue" ||
                      selectedNode.kind === "bark" ||
                      selectedNode.kind === "comment") && (
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          fontSize: "11px",
                        }}
                      >
                        Dialogue / Note Text
                        <textarea
                          value={selectedNode.text}
                          onChange={(e) =>
                            updateNode(selectedNode.id, {
                              text: e.target.value,
                            })
                          }
                          rows={4}
                          style={{
                            background: "#111827",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            borderRadius: "4px",
                            padding: "6px",
                            fontSize: "11px",
                            resize: "vertical",
                          }}
                        />
                      </label>
                    )}

                    {/* Character Assign */}
                    {selectedNode.kind === "character" && (
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          fontSize: "11px",
                        }}
                      >
                        Assign Model
                        <select
                          value={selectedNode.modelId ?? ""}
                          onChange={(e) =>
                            assignCharacter(selectedNode.id, e.target.value)
                          }
                          style={{
                            background: "#111827",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            borderRadius: "4px",
                            padding: "6px",
                            fontSize: "11px",
                          }}
                        >
                          <option value="">Choose character model</option>
                          {assetLibrary
                            .filter((a) => a.category === "character")
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    {/* Choice branching options */}
                    {selectedNode.kind === "choice" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <span style={{ fontSize: "11px" }}>
                          Choices / Responses
                        </span>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                          }}
                        >
                          {(selectedNode.choices || []).map(
                            (choiceText, idx) => (
                              <div
                                key={idx}
                                style={{ display: "flex", gap: "4px" }}
                              >
                                <input
                                  value={choiceText}
                                  onChange={(e) => {
                                    const updatedChoices = [
                                      ...(selectedNode.choices || []),
                                    ];
                                    updatedChoices[idx] = e.target.value;
                                    updateNode(selectedNode.id, {
                                      choices: updatedChoices,
                                    });
                                  }}
                                  style={{
                                    flex: 1,
                                    background: "#111827",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    color: "#fff",
                                    borderRadius: "4px",
                                    padding: "4px 6px",
                                    fontSize: "10px",
                                  }}
                                />
                                <button
                                  onClick={() => {
                                    const updatedChoices = (
                                      selectedNode.choices || []
                                    ).filter((_, cIdx) => cIdx !== idx);
                                    updateNode(selectedNode.id, {
                                      choices: updatedChoices,
                                    });
                                  }}
                                  style={{
                                    background: "#ef444433",
                                    border: "none",
                                    color: "#f87171",
                                    cursor: "pointer",
                                    padding: "0 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  ✖
                                </button>
                              </div>
                            ),
                          )}
                        </div>
                        <button
                          onClick={() => {
                            const updatedChoices = [
                              ...(selectedNode.choices || []),
                              `Option ${(selectedNode.choices || []).length + 1}`,
                            ];
                            updateNode(selectedNode.id, {
                              choices: updatedChoices,
                            });
                          }}
                          style={{
                            background: "rgba(255,255,255,0.06)",
                            border: "1px dashed rgba(255,255,255,0.2)",
                            color: "#fff",
                            padding: "6px",
                            borderRadius: "4px",
                            fontSize: "10px",
                            cursor: "pointer",
                          }}
                        >
                          + Add Option Branch
                        </button>
                      </div>
                    )}

                    {/* Variable manipulation nodes */}
                    {selectedNode.kind === "set_variable" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Target Variable
                          <select
                            value={selectedNode.variableId ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                variableId: e.target.value,
                              })
                            }
                            style={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "#fff",
                              borderRadius: "4px",
                              padding: "6px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="">Select variable</option>
                            {variables.map((v) => (
                              <option key={v.id} value={v.name}>
                                {v.name} ({v.type})
                              </option>
                            ))}
                          </select>
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Operator
                          <select
                            value={selectedNode.variableOperator ?? "set"}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                variableOperator: e.target.value,
                              })
                            }
                            style={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "#fff",
                              borderRadius: "4px",
                              padding: "6px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="set">Set to (=)</option>
                            <option value="add">Add (+)</option>
                            <option value="sub">Subtract (-)</option>
                          </select>
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Value to Set
                          {(() => {
                            const targetVar = variables.find((v) => v.name === selectedNode.variableId);
                            if (targetVar?.type === "character") {
                              return (
                                <select
                                  value={selectedNode.variableValue ?? ""}
                                  onChange={(e) =>
                                    updateNode(selectedNode.id, {
                                      variableValue: e.target.value,
                                    })
                                  }
                                  style={{
                                    background: "#111827",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    color: "#fff",
                                    borderRadius: "4px",
                                    padding: "6px",
                                    fontSize: "11px",
                                  }}
                                >
                                  <option value="">Select character</option>
                                  {characterAssets.map((asset) => (
                                    <option key={asset.id} value={asset.id}>
                                      {asset.name}
                                    </option>
                                  ))}
                                </select>
                              );
                            }
                            if (targetVar?.type === "boolean") {
                              return (
                                <select
                                  value={selectedNode.variableValue ?? "true"}
                                  onChange={(e) =>
                                    updateNode(selectedNode.id, {
                                      variableValue: e.target.value,
                                    })
                                  }
                                  style={{
                                    background: "#111827",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    color: "#fff",
                                    borderRadius: "4px",
                                    padding: "6px",
                                    fontSize: "11px",
                                  }}
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              );
                            }
                            return (
                              <input
                                value={selectedNode.variableValue ?? ""}
                                onChange={(e) =>
                                  updateNode(selectedNode.id, {
                                    variableValue: e.target.value,
                                  })
                                }
                                style={{
                                  background: "#111827",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  color: "#fff",
                                  borderRadius: "4px",
                                  padding: "6px",
                                  fontSize: "11px",
                                }}
                                placeholder="e.g. true, 100, hello"
                              />
                            );
                          })()}
                        </label>
                      </div>
                    )}

                    {/* Condition branch nodes */}
                    {selectedNode.kind === "condition" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          If Variable
                          <select
                            value={selectedNode.conditionVariableId ?? ""}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                conditionVariableId: e.target.value,
                              })
                            }
                            style={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "#fff",
                              borderRadius: "4px",
                              padding: "6px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="">Select variable</option>
                            {variables.map((v) => (
                              <option key={v.id} value={v.name}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Operator
                          <select
                            value={selectedNode.conditionOperator ?? "=="}
                            onChange={(e) =>
                              updateNode(selectedNode.id, {
                                conditionOperator: e.target.value,
                              })
                            }
                            style={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "#fff",
                              borderRadius: "4px",
                              padding: "6px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="==">Equals (==)</option>
                            <option value="!=">Not Equals (!=)</option>
                            <option value=">">Greater than (&gt;)</option>
                            <option value="<">Less than (&lt;)</option>
                            <option value=">=">
                              Greater or Equals (&gt;=)
                            </option>
                            <option value="<=">Less or Equals (&lt;=)</option>
                          </select>
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Compare Value
                          {(() => {
                            const targetVar = variables.find((v) => v.name === selectedNode.conditionVariableId);
                            if (targetVar?.type === "character") {
                              return (
                                <select
                                  value={selectedNode.conditionValue ?? ""}
                                  onChange={(e) =>
                                    updateNode(selectedNode.id, {
                                      conditionValue: e.target.value,
                                    })
                                  }
                                  style={{
                                    background: "#111827",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    color: "#fff",
                                    borderRadius: "4px",
                                    padding: "6px",
                                    fontSize: "11px",
                                  }}
                                >
                                  <option value="">Select character</option>
                                  {characterAssets.map((asset) => (
                                    <option key={asset.id} value={asset.id}>
                                      {asset.name}
                                    </option>
                                  ))}
                                </select>
                              );
                            }
                            if (targetVar?.type === "boolean") {
                              return (
                                <select
                                  value={selectedNode.conditionValue ?? "true"}
                                  onChange={(e) =>
                                    updateNode(selectedNode.id, {
                                      conditionValue: e.target.value,
                                    })
                                  }
                                  style={{
                                    background: "#111827",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    color: "#fff",
                                    borderRadius: "4px",
                                    padding: "6px",
                                    fontSize: "11px",
                                  }}
                                >
                                  <option value="true">True</option>
                                  <option value="false">False</option>
                                </select>
                              );
                            }
                            return (
                              <input
                                value={selectedNode.conditionValue ?? ""}
                                onChange={(e) =>
                                  updateNode(selectedNode.id, {
                                    conditionValue: e.target.value,
                                  })
                                }
                                style={{
                                  background: "#111827",
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  color: "#fff",
                                  borderRadius: "4px",
                                  padding: "6px",
                                  fontSize: "11px",
                                }}
                                placeholder="e.g. true, 100, hello"
                              />
                            );
                          })()}
                        </label>
                      </div>
                    )}

                    {/* Delay node settings */}
                    {selectedNode.kind === "delay" && (
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          fontSize: "11px",
                        }}
                      >
                        Delay Duration (seconds)
                        <input
                          type="number"
                          value={selectedNode.delayDuration ?? 1}
                          onChange={(e) =>
                            updateNode(selectedNode.id, {
                              delayDuration: Math.max(
                                0,
                                Number(e.target.value),
                              ),
                            })
                          }
                          style={{
                            background: "#111827",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            borderRadius: "4px",
                            padding: "6px",
                            fontSize: "11px",
                          }}
                        />
                      </label>
                    )}

                    {/* Action trigger nodes */}
                    {selectedNode.kind === "event" && (
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          fontSize: "11px",
                        }}
                      >
                        Event Trigger Action
                        <input
                          value={selectedNode.action ?? ""}
                          onChange={(e) =>
                            updateNode(selectedNode.id, {
                              action: e.target.value,
                            })
                          }
                          style={{
                            background: "#111827",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            borderRadius: "4px",
                            padding: "6px",
                            fontSize: "11px",
                          }}
                          placeholder="e.g. attack, spawn_enemy"
                        />
                      </label>
                    )}

                    {/* Character Animation nodes */}
                    {selectedNode.kind === "animation" && (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Character
                          <select
                            value={selectedNode.modelId ?? ""}
                            onChange={(e) => {
                              const asset = characterAssets.find(
                                (entry) => entry.id === e.target.value,
                              );
                              updateNode(selectedNode.id, {
                                characterActionId: null,
                                characterActionName: null,
                                fileUrl: asset?.fileUrl ?? null,
                                modelId: asset?.id ?? null,
                                modelName: asset?.name ?? null,
                                title: asset
                                  ? `${asset.name} action`
                                  : selectedNode.title,
                              });
                            }}
                            style={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "#fff",
                              borderRadius: "4px",
                              padding: "6px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="">Choose character</option>
                            {characterAssets.map((asset) => (
                              <option key={asset.id} value={asset.id}>
                                {asset.name}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                            fontSize: "11px",
                          }}
                        >
                          Character action
                          <select
                            value={selectedNode.characterActionId ?? ""}
                            onChange={(e) => {
                              const action = selectedAnimationActions.find(
                                (entry) => entry.id === e.target.value,
                              );
                              updateNode(selectedNode.id, {
                                action: action?.id ?? null,
                                animationName: action?.name ?? null,
                                characterActionId: action?.id ?? null,
                                characterActionName: action?.name ?? null,
                              });
                            }}
                            style={{
                              background: "#111827",
                              border: "1px solid rgba(255,255,255,0.12)",
                              color: "#fff",
                              borderRadius: "4px",
                              padding: "6px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="">Choose action</option>
                            {selectedAnimationActions.map((action) => (
                              <option key={action.id} value={action.id}>
                                {action.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}

                    {/* Shop Node settings */}
                    {selectedNode.kind === "shop" && (
                      <label
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          fontSize: "11px",
                        }}
                      >
                        Currency Cost Offset
                        <input
                          type="number"
                          value={selectedNode.currencyChange ?? 0}
                          onChange={(e) =>
                            updateNode(selectedNode.id, {
                              currencyChange: Number(e.target.value),
                            })
                          }
                          style={{
                            background: "#111827",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            borderRadius: "4px",
                            padding: "6px",
                            fontSize: "11px",
                          }}
                        />
                      </label>
                    )}

                    {/* Warnings list for selected node */}
                    {validationWarnings[selectedNode.id] && (
                      <div
                        style={{
                          marginTop: "10px",
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid #ef444466",
                          padding: "10px",
                          borderRadius: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "10px",
                            color: "#f87171",
                            fontWeight: "bold",
                          }}
                        >
                          Node warnings:
                        </span>
                        <ul
                          style={{
                            paddingLeft: "14px",
                            margin: "4px 0 0 0",
                            fontSize: "10px",
                            color: "#cbd5e1",
                          }}
                        >
                          {validationWarnings[selectedNode.id].map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : selectedEdge ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "14px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: "bold",
                          color: "#a855f7",
                        }}
                      >
                        Editing Path
                      </span>
                      <button
                        onClick={() => deleteEdge(selectedEdge.id)}
                        style={{
                          background: "#ef444433",
                          border: "1px solid #ef4444",
                          color: "#f87171",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          cursor: "pointer",
                        }}
                      >
                        Delete Edge
                      </button>
                    </div>

                    <label
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                        fontSize: "11px",
                      }}
                    >
                      Edge Label
                      <input
                        value={selectedEdge.label}
                        onChange={(e) =>
                          updateEdge(selectedEdge.id, { label: e.target.value })
                        }
                        style={{
                          background: "#111827",
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "#fff",
                          borderRadius: "4px",
                          padding: "6px",
                          fontSize: "11px",
                        }}
                      />
                    </label>

                    <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                      Source Handle:{" "}
                      <code style={{ color: "#cbd5e1" }}>
                        {selectedEdge.sourceHandle || "default"}
                      </code>
                      <br />
                      Target Handle:{" "}
                      <code style={{ color: "#cbd5e1" }}>
                        {selectedEdge.targetHandle || "default"}
                      </code>
                    </div>
                  </div>
                ) : (
                  <p
                    style={{
                      fontSize: "11px",
                      color: "#6b7280",
                      fontStyle: "italic",
                      textAlign: "center",
                    }}
                  >
                    Select node or path edge to view properties.
                  </p>
                )}
              </div>
            )}

            {/* Tab: Variables management */}
            {activeTab === "variables" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "bold",
                    color: "#00ffc4",
                  }}
                >
                  Level Variables
                </span>

                {/* Add new variable form */}
                 <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const name = (data.get("varName") as string).trim();
                    const type = newVarType;
                    let defVal: any = data.get("varDefault") as string;
                    if (type === "number") defVal = Number(defVal) || 0;
                    if (type === "boolean") defVal = defVal === "true";

                    if (name) {
                      addVariable(name, type, defVal);
                      e.currentTarget.reset();
                      setNewVarType("string");
                    }
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    background: "rgba(255,255,255,0.03)",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <span style={{ fontSize: "10px", fontWeight: "bold" }}>
                    Add Variable
                  </span>
                  <input
                    name="varName"
                    placeholder="var_name"
                    required
                    style={{
                      background: "#111827",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "#fff",
                      borderRadius: "4px",
                      padding: "4px 6px",
                      fontSize: "11px",
                    }}
                  />
                  <select
                    name="varType"
                    value={newVarType}
                    onChange={(e) => setNewVarType(e.target.value as StoryVariableType)}
                    style={{
                      background: "#111827",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: "#fff",
                      borderRadius: "4px",
                      padding: "4px 6px",
                      fontSize: "11px",
                    }}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="character">Character</option>
                  </select>
                  {newVarType === "character" ? (
                    <select
                      name="varDefault"
                      required
                      style={{
                        background: "#111827",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "#fff",
                        borderRadius: "4px",
                        padding: "4px 6px",
                        fontSize: "11px",
                      }}
                    >
                      <option value="">Select Character</option>
                      {characterAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                    </select>
                  ) : newVarType === "boolean" ? (
                    <select
                      name="varDefault"
                      required
                      style={{
                        background: "#111827",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "#fff",
                        borderRadius: "4px",
                        padding: "4px 6px",
                        fontSize: "11px",
                      }}
                    >
                      <option value="true">True</option>
                      <option value="false">False</option>
                    </select>
                  ) : (
                    <input
                      name="varDefault"
                      placeholder="Default value"
                      style={{
                        background: "#111827",
                        border: "1px solid rgba(255,255,255,0.12)",
                        color: "#fff",
                        borderRadius: "4px",
                        padding: "4px 6px",
                        fontSize: "11px",
                      }}
                    />
                  )}
                  <button
                    type="submit"
                    style={{
                      background: "#00ffc4",
                      color: "#000",
                      border: "none",
                      padding: "6px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontWeight: "bold",
                      cursor: "pointer",
                    }}
                  >
                    + Save Variable
                  </button>
                </form>

                {/* Variables list */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {variables.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "rgba(255,255,255,0.05)",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                      >
                        <strong style={{ fontSize: "11px", color: "#f3f4f6" }}>
                          ${v.name}
                        </strong>
                        <span style={{ fontSize: "9px", color: "#9ca3af" }}>
                          Type: {v.type} | Default: {
                            v.type === "character"
                              ? (characterAssets.find((c) => c.id === v.defaultValue)?.name || v.defaultValue)
                              : String(v.defaultValue)
                          }
                        </span>
                      </div>
                      <button
                        onClick={() => deleteVariable(v.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#f87171",
                          cursor: "pointer",
                          fontSize: "11px",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                  {variables.length === 0 && (
                    <p
                      style={{
                        fontSize: "11px",
                        color: "#6b7280",
                        fontStyle: "italic",
                        textAlign: "center",
                      }}
                    >
                      No level variables created.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Interactive Playtest Simulator Overlay Modal */}
      {playtestActive && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.85)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "#090d16",
              border: "2px solid #10b981",
              borderRadius: "16px",
              width: "800px",
              height: "500px",
              display: "grid",
              gridTemplateColumns: "1fr 260px",
              overflow: "hidden",
              boxShadow: "0 0 32px rgba(16, 185, 129, 0.25)",
            }}
          >
            {/* Playtest screen */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: "50px 1fr 120px",
                padding: "18px",
                minHeight: 0,
              }}
            >
              <header
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  paddingBottom: "10px",
                }}
              >
                <strong style={{ color: "#10b981", fontSize: "14px" }}>
                  Story Graph Simulator
                </strong>
                <button
                  onClick={() => setPlaytestActive(false)}
                  style={{
                    background: "#ef444433",
                    border: "1px solid #ef4444",
                    color: "#f87171",
                    cursor: "pointer",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontSize: "11px",
                  }}
                >
                  Exit Playtest
                </button>
              </header>

              {/* Dialogue Bubble */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px 0",
                }}
              >
                <div
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    padding: "24px",
                    borderRadius: "12px",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  <p
                    style={{
                      fontSize: "16px",
                      lineHeight: "1.6",
                      fontStyle: "italic",
                      color: "#e2e8f0",
                    }}
                  >
                    {playtestText}
                  </p>
                </div>
              </div>

              {/* Player choices */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                {playtestChoices.map((choice, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      if (choice.targetId)
                        runPlaytestStep(choice.targetId, playtestVariables);
                    }}
                    disabled={!choice.targetId}
                    style={{
                      background: "linear-gradient(135deg, #10b981, #059669)",
                      color: "#000",
                      fontWeight: "bold",
                      border: "none",
                      padding: "10px 16px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontSize: "12px",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      opacity: choice.targetId ? 1 : 0.42,
                    }}
                  >
                    <span>{choice.text}</span>
                    <span>➔</span>
                  </button>
                ))}
                {playtestChoices.length === 0 && (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "12px",
                      color: "#94a3b8",
                    }}
                  >
                    [ Flow simulation completed ]
                  </div>
                )}
              </div>
            </div>

            {/* Playtest Variables and logs inspector */}
            <div
              style={{
                borderLeft: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gridTemplateRows: "1fr 1fr",
                overflow: "hidden",
              }}
            >
              {/* Variables watcher */}
              <div
                style={{
                  padding: "14px",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  overflowY: "auto",
                }}
              >
                <strong
                  style={{
                    fontSize: "11px",
                    color: "#10b981",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: "10px",
                  }}
                >
                  Active variables
                </strong>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {Object.entries(playtestVariables).map(([name, val]) => (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "11px",
                        background: "rgba(255,255,255,0.04)",
                        padding: "4px 8px",
                        borderRadius: "4px",
                      }}
                    >
                      <span style={{ color: "#94a3b8" }}>${name}</span>
                      <strong
                        style={{
                          color:
                            typeof val === "boolean"
                              ? val
                                ? "#10b981"
                                : "#f87171"
                              : "#fef08a",
                        }}
                      >
                        {String(val)}
                      </strong>
                    </div>
                  ))}
                  {Object.keys(playtestVariables).length === 0 && (
                    <span
                      style={{
                        fontSize: "10px",
                        color: "#6b7280",
                        fontStyle: "italic",
                      }}
                    >
                      No variables active.
                    </span>
                  )}
                </div>
              </div>

              {/* Execution log */}
              <div
                style={{
                  padding: "14px",
                  overflowY: "auto",
                  background: "rgba(0,0,0,0.2)",
                }}
              >
                <strong
                  style={{
                    fontSize: "11px",
                    color: "#3b82f6",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Simulation logs
                </strong>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {playtestLog.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        fontSize: "10px",
                        color: "#cbd5e1",
                        lineHeight: "1.4",
                        borderBottom: "1px solid rgba(255,255,255,0.03)",
                        paddingBottom: "4px",
                      }}
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
