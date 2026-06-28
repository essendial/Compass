/**
 * Curated library of pathway templates.
 *
 * Each template is a small, self-contained instruction path (a node-tree plus
 * its internal edges). Users can drop one into the active flow from the
 * "Templates" picker in the Pathways sidebar section — it materialises as a
 * brand-new path with fresh ids, placed in a lane below any existing nodes.
 *
 * Conventions (kept in sync with data.ts / sampleFlow.ts):
 *  - Node `x` is the absolute world x; chain nodes at TREE_START_X + n * NODE_PITCH_X.
 *  - Node `y` is RELATIVE to the lane's top (0 = main row, NODE_PITCH_Y = a branch row).
 *    The instantiator offsets every node by the target lane's base Y.
 *  - `id` is local to the template; it is remapped to a fresh uid on insert so
 *    the same template can be inserted repeatedly without id collisions.
 *
 * Templates are intentionally light (1-2 reqs per step). Users flesh them out
 * in the right panel after insertion.
 */
import { NODE_PITCH_X, NODE_PITCH_Y, TREE_START_X } from "./data";
import type {
  Edge,
  FlowNode,
  NodeStatus,
  NodeTree,
  NodeType,
  Req,
  Side,
} from "./types";
import { uid } from "./utils";

/** A step in a template. Positions are layout hints (see file header). */
export interface PathwayTemplateNode {
  id: string;
  label: string;
  type: NodeType;
  status?: NodeStatus;
  summary?: string;
  owner?: string;
  sla?: string;
  reqs?: Req[];
  x: number;
  /** Relative Y offset from the lane's top row (0 = main row). */
  y: number;
}

/** A connection between two template nodes (referenced by local id). */
export interface PathwayTemplateEdge {
  from: string;
  to: string;
  label?: string;
  fromSide?: Side;
  toSide?: Side;
  dashed?: boolean;
}

/** A complete, insertable pathway template. */
export interface PathwayTemplate {
  id: string;
  name: string;
  description: string;
  nodes: PathwayTemplateNode[];
  edges: PathwayTemplateEdge[];
}

/* x positions for a clean left->right chain (60, 360, 660, ...). */
const X = (i: number) => TREE_START_X + i * NODE_PITCH_X;

/* ============================================================
 *  Template 1 — Approval chain
 *  Submit -> Review -> Approved? -> Notify / Return-for-edits loop
 * ============================================================ */
const approval: PathwayTemplate = {
  id: "approval",
  name: "Approval chain",
  description: "Submit, review, approve or return for edits.",
  nodes: [
    {
      id: "a1",
      label: "Submit request",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary:
        "Starts the approval when a request is submitted with the required details.",
      owner: "Requester",
      sla: "On submit",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["title", "amount", "justification"],
        },
      ],
    },
    {
      id: "a2",
      label: "Manager review",
      type: "action",
      x: X(1),
      y: 0,
      status: "live",
      summary: "Reviewer opens the request, checks details, and decides.",
      owner: "Manager",
      sla: "< 2 business days",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve / reject"],
        },
      ],
    },
    {
      id: "a3",
      label: "Approved?",
      type: "decision",
      x: X(2),
      y: 0,
      status: "live",
      summary: "Routes on the reviewer's decision.",
      owner: "Manager",
      sla: "Instant",
      reqs: [
        {
          kind: "rule",
          label: "Branches",
          items: ["Yes -> Notify", "No -> Return for edits"],
        },
      ],
    },
    {
      id: "a4",
      label: "Notify requester",
      type: "action",
      x: X(3),
      y: 0,
      status: "live",
      summary: "Confirms approval to the requester and downstream owners.",
      owner: "System",
      sla: "Real-time",
      reqs: [
        {
          kind: "integration",
          label: "Notify",
          items: ["Email", "Slack"],
        },
      ],
    },
    {
      id: "a5",
      label: "Complete",
      type: "end",
      x: X(4),
      y: 0,
      status: "live",
      summary: "Closes the request as approved.",
      owner: "System",
      sla: "On approve",
    },
    {
      id: "a6",
      label: "Return for edits",
      type: "action",
      x: X(2),
      y: NODE_PITCH_Y,
      status: "live",
      summary: "Sends the request back to the requester with notes.",
      owner: "Manager",
      sla: "On reject",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["reason", "requested changes"],
        },
      ],
    },
  ],
  edges: [
    { from: "a1", to: "a2" },
    { from: "a2", to: "a3" },
    { from: "a3", to: "a4", label: "Yes" },
    { from: "a4", to: "a5" },
    { from: "a3", to: "a6", fromSide: "bottom", toSide: "top", label: "No" },
    {
      from: "a6",
      to: "a1",
      fromSide: "left",
      toSide: "bottom",
      label: "resubmit",
      dashed: true,
    },
  ],
};

/* ============================================================
 *  Template 2 — Customer onboarding
 *  Handoff -> Provision -> Welcome -> Train -> Live
 * ============================================================ */
const onboarding: PathwayTemplate = {
  id: "onboarding",
  name: "Customer onboarding",
  description: "Closed-won handoff through to a live, trained customer.",
  nodes: [
    {
      id: "b1",
      label: "Won deal handoff",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary: "Sales hands off the closed-won deal to onboarding.",
      owner: "Sales",
      sla: "On win",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["plan", "start date", "contacts"],
        },
      ],
    },
    {
      id: "b2",
      label: "Provision account",
      type: "action",
      x: X(1),
      y: 0,
      status: "review",
      summary: "Creates the workspace, provisions seats, and verifies access.",
      owner: "Support",
      sla: "< 1 business day",
      reqs: [
        {
          kind: "integration",
          label: "Integrations",
          items: ["Billing", "Identity provider"],
        },
      ],
    },
    {
      id: "b3",
      label: "Send welcome",
      type: "action",
      x: X(2),
      y: 0,
      status: "live",
      summary: "Sends the welcome message and onboarding pack.",
      owner: "Customer Success",
      sla: "Day 1",
      reqs: [
        {
          kind: "integration",
          label: "Channels",
          items: ["Email"],
        },
      ],
    },
    {
      id: "b4",
      label: "Schedule training",
      type: "action",
      x: X(3),
      y: 0,
      status: "draft",
      summary: "Books kickoff and training sessions with the customer.",
      owner: "Customer Success",
      sla: "Week 1",
      reqs: [
        {
          kind: "rule",
          label: "Cadence",
          items: ["Kickoff call", "2 training sessions"],
        },
      ],
    },
    {
      id: "b5",
      label: "Live",
      type: "end",
      x: X(4),
      y: 0,
      status: "live",
      summary:
        "Customer is fully onboarded and handed to the active account team.",
      owner: "Customer Success",
      sla: "End of onboarding",
    },
  ],
  edges: [
    { from: "b1", to: "b2" },
    { from: "b2", to: "b3" },
    { from: "b3", to: "b4" },
    { from: "b4", to: "b5" },
  ],
};

/* ============================================================
 *  Template 3 — Escalation
 *  Flag -> Triage -> Severe? -> Page on-call / Queue -> Resolve -> Close
 * ============================================================ */
const escalation: PathwayTemplate = {
  id: "escalation",
  name: "Incident escalation",
  description: "Flag, triage by severity, page or queue, then resolve.",
  nodes: [
    {
      id: "c1",
      label: "Issue flagged",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary:
        "An issue is reported via monitoring, a customer, or an internal channel.",
      owner: "Anyone",
      sla: "Real-time",
      reqs: [
        {
          kind: "data",
          label: "Capture",
          items: ["summary", "source", "impact"],
        },
      ],
    },
    {
      id: "c2",
      label: "Triage",
      type: "action",
      x: X(1),
      y: 0,
      status: "live",
      summary: "On-call confirms the issue and assigns a severity.",
      owner: "On-call",
      sla: "< 30 min",
      reqs: [
        {
          kind: "rule",
          label: "Severity",
          items: ["Sev-1", "Sev-2", "Sev-3"],
        },
      ],
    },
    {
      id: "c3",
      label: "Severe?",
      type: "decision",
      x: X(2),
      y: 0,
      status: "live",
      summary: "Routes based on severity.",
      owner: "On-call",
      sla: "Instant",
      reqs: [
        {
          kind: "rule",
          label: "Branches",
          items: ["High -> Page on-call", "Low -> Queue"],
        },
      ],
    },
    {
      id: "c4",
      label: "Page on-call",
      type: "action",
      x: X(3),
      y: 0,
      status: "live",
      summary: "Pages the on-call engineer and opens a war room.",
      owner: "On-call",
      sla: "Immediate",
      reqs: [
        {
          kind: "integration",
          label: "Notify",
          items: ["PagerDuty", "Slack"],
        },
      ],
    },
    {
      id: "c5",
      label: "Queue for support",
      type: "action",
      x: X(3),
      y: NODE_PITCH_Y,
      status: "live",
      summary: "Adds the issue to the support backlog for normal handling.",
      owner: "Support",
      sla: "Next sprint",
    },
    {
      id: "c6",
      label: "Resolve & close",
      type: "end",
      x: X(4),
      y: 0,
      status: "live",
      summary:
        "Fix is verified, the issue is resolved, and a postmortem is filed if Sev-1/2.",
      owner: "On-call",
      sla: "Per severity SLA",
      reqs: [
        {
          kind: "rule",
          label: "On close",
          items: ["verify fix", "postmortem if Sev-1/2"],
        },
      ],
    },
  ],
  edges: [
    { from: "c1", to: "c2" },
    { from: "c2", to: "c3" },
    { from: "c3", to: "c4", label: "High" },
    { from: "c3", to: "c5", fromSide: "bottom", toSide: "top", label: "Low" },
    { from: "c4", to: "c6" },
    { from: "c5", to: "c6", fromSide: "top", toSide: "bottom" },
  ],
};

/* ============================================================
 *  Template 4 — Peer / QA review
 *  Submit -> Review -> Pass? -> Merge / Request-changes loop -> Done
 * ============================================================ */
const review: PathwayTemplate = {
  id: "review",
  name: "Peer review",
  description: "Submit work for review, then merge or request changes.",
  nodes: [
    {
      id: "d1",
      label: "Work submitted",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary: "Author submits their work for review.",
      owner: "Author",
      sla: "On submit",
      reqs: [
        {
          kind: "rule",
          label: "Checklist",
          items: ["tests pass", "self-reviewed"],
        },
      ],
    },
    {
      id: "d2",
      label: "Peer review",
      type: "action",
      x: X(1),
      y: 0,
      status: "live",
      summary: "A peer reviews the submission and leaves feedback.",
      owner: "Reviewer",
      sla: "< 1 business day",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve", "Request changes"],
        },
      ],
    },
    {
      id: "d3",
      label: "Pass?",
      type: "decision",
      x: X(2),
      y: 0,
      status: "live",
      summary: "Routes based on the review outcome.",
      owner: "Reviewer",
      sla: "Instant",
      reqs: [
        {
          kind: "rule",
          label: "Branches",
          items: ["Yes -> Merge", "No -> Request changes"],
        },
      ],
    },
    {
      id: "d4",
      label: "Merge",
      type: "action",
      x: X(3),
      y: 0,
      status: "live",
      summary: "Merges the approved work.",
      owner: "Author",
      sla: "On approve",
    },
    {
      id: "d5",
      label: "Done",
      type: "end",
      x: X(4),
      y: 0,
      status: "live",
      summary: "Work is merged and the cycle closes.",
      owner: "Author",
      sla: "On merge",
    },
    {
      id: "d6",
      label: "Request changes",
      type: "action",
      x: X(2),
      y: NODE_PITCH_Y,
      status: "live",
      summary: "Returns the work to the author with change requests.",
      owner: "Reviewer",
      sla: "On reject",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["change notes"],
        },
      ],
    },
  ],
  edges: [
    { from: "d1", to: "d2" },
    { from: "d2", to: "d3" },
    { from: "d3", to: "d4", label: "Yes" },
    { from: "d4", to: "d5" },
    { from: "d3", to: "d6", fromSide: "bottom", toSide: "top", label: "No" },
    {
      from: "d6",
      to: "d1",
      fromSide: "left",
      toSide: "bottom",
      label: "resubmit",
      dashed: true,
    },
  ],
};

/* ============================================================
 *  Template 5 — Offboarding
 *  Request -> Revoke access -> Exit interview -> Recover assets -> Closed
 * ============================================================ */
const offboarding: PathwayTemplate = {
  id: "offboarding",
  name: "Offboarding",
  description: "Revoke access, run exit interview, recover assets.",
  nodes: [
    {
      id: "e1",
      label: "Offboarding requested",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary: "HR or manager initiates offboarding for a departing person.",
      owner: "HR",
      sla: "On notice",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["person", "last day", "reason"],
        },
      ],
    },
    {
      id: "e2",
      label: "Revoke access",
      type: "action",
      x: X(1),
      y: 0,
      status: "review",
      summary: "Disables accounts and revokes access across all systems.",
      owner: "IT",
      sla: "By last day",
      reqs: [
        {
          kind: "integration",
          label: "Systems",
          items: ["SSO", "Email", "Device MDM"],
        },
      ],
    },
    {
      id: "e3",
      label: "Exit interview",
      type: "action",
      x: X(2),
      y: 0,
      status: "draft",
      summary: "Runs the exit interview and captures feedback.",
      owner: "HR",
      sla: "Last week",
      reqs: [
        {
          kind: "data",
          label: "Capture",
          items: ["feedback notes"],
        },
      ],
    },
    {
      id: "e4",
      label: "Recover assets",
      type: "action",
      x: X(3),
      y: 0,
      status: "review",
      summary: "Collects hardware and any company property.",
      owner: "IT",
      sla: "By last day",
    },
    {
      id: "e5",
      label: "Closed",
      type: "end",
      x: X(4),
      y: 0,
      status: "live",
      summary: "Offboarding is complete and the record is archived.",
      owner: "HR",
      sla: "On completion",
    },
  ],
  edges: [
    { from: "e1", to: "e2" },
    { from: "e2", to: "e3" },
    { from: "e3", to: "e4" },
    { from: "e4", to: "e5" },
  ],
};

/* ============================================================
 *  Template 6 — Multi-tier sequential approval
 *  Submit -> Manager -> (>$10k?) -> Director -> (>$50k?) -> VP
 *  Two skip-path branches terminate at tier-appropriate "Approved" ends so
 *  lower amounts don't traverse the whole chain.
 * ============================================================ */
const multiTierApproval: PathwayTemplate = {
  id: "multi-tier-approval",
  name: "Multi-tier approval",
  description: "Escalates manager -> director -> VP by amount threshold.",
  nodes: [
    {
      id: "f1",
      label: "Submit request",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary:
        "Requester submits with amount and justification; routing is decided by spend tier.",
      owner: "Requester",
      sla: "On submit",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["amount", "justification", "cost center"],
        },
      ],
    },
    {
      id: "f2",
      label: "Manager review",
      type: "action",
      x: X(1),
      y: 0,
      status: "live",
      summary: "Direct manager reviews and approves before any escalation.",
      owner: "Manager",
      sla: "< 1 business day",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve"],
        },
      ],
    },
    {
      id: "f3",
      label: "Over $10k?",
      type: "decision",
      x: X(2),
      y: 0,
      status: "live",
      summary: "Below $10k stops at manager; above escalates to director.",
      owner: "System",
      sla: "Instant",
      reqs: [
        {
          kind: "rule",
          label: "Threshold",
          items: ["amount > 10000"],
        },
      ],
    },
    {
      id: "f4",
      label: "Director review",
      type: "action",
      x: X(3),
      y: 0,
      status: "live",
      summary: "Director reviews requests above the first threshold.",
      owner: "Director",
      sla: "< 2 business days",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve"],
        },
      ],
    },
    {
      id: "f5",
      label: "Over $50k?",
      type: "decision",
      x: X(4),
      y: 0,
      status: "live",
      summary: "Below $50k stops at director; above escalates to VP.",
      owner: "System",
      sla: "Instant",
      reqs: [
        {
          kind: "rule",
          label: "Threshold",
          items: ["amount > 50000"],
        },
      ],
    },
    {
      id: "f6",
      label: "VP review",
      type: "action",
      x: X(5),
      y: 0,
      status: "review",
      summary: "VP reviews the highest-tier requests.",
      owner: "VP",
      sla: "< 3 business days",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve"],
        },
        {
          kind: "rule",
          label: "Notify",
          items: ["Finance"],
        },
      ],
    },
    {
      id: "f7",
      label: "Approved — VP tier",
      type: "end",
      x: X(6),
      y: 0,
      status: "live",
      summary: "Final approval after VP sign-off (>$50k).",
      owner: "System",
      sla: "On approve",
    },
    {
      id: "f8",
      label: "Approved — manager tier",
      type: "end",
      x: X(3),
      y: NODE_PITCH_Y,
      status: "live",
      summary: "Completed at the manager tier (≤$10k).",
      owner: "System",
      sla: "On approve",
    },
    {
      id: "f9",
      label: "Approved — director tier",
      type: "end",
      x: X(5),
      y: NODE_PITCH_Y,
      status: "live",
      summary: "Completed at the director tier ($10k–$50k).",
      owner: "System",
      sla: "On approve",
    },
  ],
  edges: [
    { from: "f1", to: "f2" },
    { from: "f2", to: "f3" },
    { from: "f3", to: "f4", label: "Yes" },
    { from: "f3", to: "f8", fromSide: "bottom", toSide: "top", label: "No" },
    { from: "f4", to: "f5" },
    { from: "f5", to: "f6", label: "Yes" },
    { from: "f5", to: "f9", fromSide: "bottom", toSide: "top", label: "No" },
    { from: "f6", to: "f7" },
  ],
};

/* ============================================================
 *  Template 7 — Parallel sign-off (concurrent approval)
 *  Fan-out to Legal + Finance + Security, then fan-in to an
 *  "All approved?" gate. Any single rejection loops back.
 * ============================================================ */
const parallelSignoff: PathwayTemplate = {
  id: "parallel-signoff",
  name: "Parallel sign-off",
  description:
    "Legal, Finance, and Security review concurrently; all must approve.",
  nodes: [
    {
      id: "g1",
      label: "Submit request",
      type: "trigger",
      x: X(0),
      y: 0,
      status: "live",
      summary:
        "Requester submits; the request fans out to all required approvers at once.",
      owner: "Requester",
      sla: "On submit",
      reqs: [
        {
          kind: "data",
          label: "Required",
          items: ["scope", "vendor", "contract value"],
        },
      ],
    },
    {
      id: "g2",
      label: "Route to approvers",
      type: "action",
      x: X(1),
      y: 0,
      status: "live",
      summary: "Creates a review task for each required approver in parallel.",
      owner: "System",
      sla: "Real-time",
      reqs: [
        {
          kind: "rule",
          label: "Approvers",
          items: ["Legal", "Finance", "Security"],
        },
      ],
    },
    {
      id: "g3",
      label: "Legal review",
      type: "action",
      x: X(2),
      y: 0,
      status: "live",
      summary: "Legal reviews contract terms, IP, and liability.",
      owner: "Legal",
      sla: "< 5 business days",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve", "Request changes"],
        },
      ],
    },
    {
      id: "g4",
      label: "Finance review",
      type: "action",
      x: X(2),
      y: NODE_PITCH_Y,
      status: "live",
      summary: "Finance checks budget, payment terms, and forecasting impact.",
      owner: "Finance",
      sla: "< 5 business days",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve", "Request changes"],
        },
      ],
    },
    {
      id: "g5",
      label: "Security review",
      type: "action",
      x: X(2),
      y: 2 * NODE_PITCH_Y,
      status: "live",
      summary: "Security assesses data exposure, access, and vendor risk.",
      owner: "Security",
      sla: "< 5 business days",
      reqs: [
        {
          kind: "permission",
          label: "Access",
          items: ["Approve", "Request changes"],
        },
      ],
    },
    {
      id: "g6",
      label: "All approved?",
      type: "decision",
      x: X(3),
      y: 0,
      status: "live",
      summary:
        "Gate that waits for every approver; any rejection sends the request back.",
      owner: "System",
      sla: "On last review",
      reqs: [
        {
          kind: "rule",
          label: "Rule",
          items: ["all 3 must approve"],
        },
      ],
    },
    {
      id: "g7",
      label: "Approved",
      type: "end",
      x: X(4),
      y: 0,
      status: "live",
      summary: "All approvers signed off; the request proceeds.",
      owner: "System",
      sla: "On approve",
    },
    {
      id: "g8",
      label: "Return for changes",
      type: "action",
      x: X(4),
      y: NODE_PITCH_Y,
      status: "live",
      summary:
        "Sends the request back to the requester with consolidated feedback.",
      owner: "Reviewer",
      sla: "On reject",
      reqs: [
        {
          kind: "data",
          label: "Capture",
          items: ["blocker notes"],
        },
      ],
    },
  ],
  edges: [
    { from: "g1", to: "g2" },
    // Fan-out: route -> three concurrent reviewers.
    { from: "g2", to: "g3" },
    { from: "g2", to: "g4", fromSide: "bottom", toSide: "top" },
    { from: "g2", to: "g5", fromSide: "bottom", toSide: "top" },
    // Fan-in: three reviewers -> all-approved gate.
    { from: "g3", to: "g6" },
    { from: "g4", to: "g6", fromSide: "top", toSide: "bottom" },
    { from: "g5", to: "g6", fromSide: "top", toSide: "bottom" },
    // Outcome.
    { from: "g6", to: "g7", label: "Yes" },
    { from: "g6", to: "g8", fromSide: "bottom", toSide: "top", label: "No" },
    {
      from: "g8",
      to: "g1",
      fromSide: "left",
      toSide: "bottom",
      label: "resubmit",
      dashed: true,
    },
  ],
};

/** Ordered list of all built-in pathway templates (shown in the picker). */
export const PATHWAY_TEMPLATES: PathwayTemplate[] = [
  approval,
  multiTierApproval,
  parallelSignoff,
  onboarding,
  escalation,
  review,
  offboarding,
];

/**
 * Materialises a template into flow-ready entities with fresh ids, ready to be
 * merged into the active flow. The new path is placed in a lane starting at
 * `baseY` (typically the flow's `nextLaneY()`); each node's relative `y` is
 * offset by that base.
 */
export function instantiateTemplate(
  template: PathwayTemplate,
  baseY: number,
  color: string,
): { tree: NodeTree; nodes: FlowNode[]; edges: Edge[] } {
  const treeId = uid();
  // Map local template ids -> fresh global ids so repeat inserts don't clash.
  const idMap: Record<string, string> = {};
  for (const n of template.nodes) idMap[n.id] = uid();

  const nodes: FlowNode[] = template.nodes.map((n) => ({
    id: idMap[n.id],
    label: n.label,
    type: n.type,
    x: n.x,
    y: baseY + n.y,
    status: n.status ?? "draft",
    summary: n.summary ?? "",
    owner: n.owner ?? "Unassigned",
    sla: n.sla ?? "—",
    reqs: n.reqs ? n.reqs.map((r) => ({ ...r, items: [...r.items] })) : [],
    treeId,
  }));

  const edges: Edge[] = template.edges.map((e) => ({
    ...e,
    from: idMap[e.from],
    to: idMap[e.to],
  }));

  return {
    tree: { id: treeId, name: template.name, color },
    nodes,
    edges,
  };
}
