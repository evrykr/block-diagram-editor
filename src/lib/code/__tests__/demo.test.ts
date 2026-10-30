import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS, NODE_MAP } from '../../../constants/design';
import {
  createDemoDiagram,
  migrateLegacyDemo,
} from '../../../data/sample';

describe('demo', () => {
  it('has node map and a branch merge without a connector', () => {
    expect(NODE_DEFINITIONS.length).toBeGreaterThan(0);
    expect(NODE_MAP.start).toBeTruthy();
    const diagram = createDemoDiagram();
    expect(diagram.nodes.length).toBe(6);
    expect(diagram.nodes.some((node) => node.kind === 'connector')).toBe(false);
    expect(
      diagram.edges.filter((edge) => edge.to === 'demo-end'),
    ).toHaveLength(2);
  });

  it('migrates the old demo connector to a shared line', () => {
    const diagram = createDemoDiagram();
    const migrated = migrateLegacyDemo({
      ...diagram,
      nodes: [
        ...diagram.nodes,
        {
          id: 'demo-join',
          kind: 'connector',
          text: 'A',
          x: 590,
          y: 700,
          width: 60,
          height: 60,
        },
      ],
      edges: [
        ...diagram.edges.filter((edge) => edge.to !== 'demo-end'),
        {
          id: 'e-even-join',
          from: 'demo-even',
          to: 'demo-join',
          fromSide: 'bottom',
          toSide: 'left',
        },
        {
          id: 'e-odd-join',
          from: 'demo-odd',
          to: 'demo-join',
          fromSide: 'bottom',
          toSide: 'right',
        },
        {
          id: 'e-join-end',
          from: 'demo-join',
          to: 'demo-end',
          fromSide: 'bottom',
          toSide: 'top',
        },
      ],
    });
    expect(migrated.nodes.some((node) => node.id === 'demo-join')).toBe(false);
    expect(
      migrated.edges.filter((edge) => edge.to === 'demo-end'),
    ).toHaveLength(2);
  });
});
