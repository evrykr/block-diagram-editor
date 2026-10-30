export type Side = 'top' | 'right' | 'bottom' | 'left';

export type NodeKind =
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'io'
  | 'predefined'
  | 'document'
  | 'preparation'
  | 'manual'
  | 'delay'
  | 'connector'
  | 'comment';

export type NodeCategory = 'basic' | 'gost' | 'links';

export interface DiagramNode {
  id: string;
  kind: NodeKind;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Original code fragment used for a more accurate reverse generation. */
  code?: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  fromSide?: Side;
  toSide?: Side;
  label?: string;
  dashed?: boolean;
  /** Optional exact orthogonal waypoints between the two anchors. */
  waypoints?: Point[];
  /** Marks an edge that closes a loop (used by the code generator). */
  back?: boolean;
  /** Marks the exit edge of a loop, routed around its body. */
  loopExit?: boolean;
  branch?: 'yes' | 'no';
  /** Used only by auto-layout; never rendered. */
  hidden?: boolean;
}

export interface Diagram {
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  updatedAt: number;
  /** Language the diagram was generated from, when applicable. */
  sourceLanguage?: Language;
}

export interface DiagramFile {
  format: 'gost-flowchart';
  version: 1;
  diagram: Diagram;
}

export interface Selection {
  nodes: string[];
  edges: string[];
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type Tool = 'select' | 'hand' | 'connect';

export type Language = 'python' | 'pascal' | 'cpp' | 'csharp';

export interface NodeDefinition {
  kind: NodeKind;
  label: string;
  gost: string;
  description: string;
  category: NodeCategory;
  width: number;
  height: number;
  maxLines?: number;
  /** Terminators share one card in the palette. */
  palette?: boolean;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
