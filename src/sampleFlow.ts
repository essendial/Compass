/**
 * Built-in sample workflow ("Lead to Close") used by the "Load a sample"
 * button on the empty state.
 *
 * Layout is HORIZONTAL (left -> right) and demonstrates TWO independent paths
 * (node-trees) inside one flow, each with its own colour:
 *   - "Lead pipeline" (green): the main capture -> close chain, with a
 *     decision branch and a dashed re-score feedback loop.
 *   - "Onboarding" (purple): a small parallel path for post-sale handoff.
 *
 * createSampleFlow() returns a fresh deep-ish copy each time with new ids
 * (flow + trees), so the same sample can be loaded repeatedly without colliding.
 */
import type { Edge, Flow, FlowNode, NodeTree } from "./types";
import { uid } from "./utils";

/* ---- Path 1: "Lead pipeline" (green) ---- */
const pipelineNodes: FlowNode[] = [
    {
        id: "n1",
        label: "New lead captured",
        type: "trigger",
        x: 60,
        y: 60,
        status: "live",
        summary:
            "Fires when a prospect submits a web form, is imported from a list, or syncs from a connected source. This is the entry point for every lead in the pipeline.",
        owner: "Marketing Ops",
        sla: "Real-time",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["Web forms", "HubSpot sync", "CSV import"],
            },
            {
                kind: "data",
                label: "Required fields",
                items: ["email", "first/last name", "company", "source"],
            },
            {
                kind: "rule",
                label: "Trigger",
                items: ["Inbound webhook → create lead"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n2",
        label: "Enrich lead",
        type: "action",
        x: 360,
        y: 60,
        status: "live",
        summary:
            "Appends firmographic and contact data so reps and scoring have context before any outreach happens.",
        owner: "RevOps",
        sla: "< 2 min",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["Clearbit", "Apollo (fallback)"],
            },
            {
                kind: "data",
                label: "Fields written",
                items: ["company size", "industry", "job title", "region"],
            },
            {
                kind: "rule",
                label: "On failure",
                items: ["Queue for manual review"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n3",
        label: "Score lead",
        type: "action",
        x: 660,
        y: 60,
        status: "live",
        summary:
            "Applies the fit-and-intent scoring model to rank the lead and decide routing.",
        owner: "RevOps",
        sla: "< 2 min",
        reqs: [
            {
                kind: "rule",
                label: "Model",
                items: ["Fit + intent v3", "Threshold = 70"],
            },
            {
                kind: "data",
                label: "Inputs",
                items: ["enrichment", "page views", "email engagement"],
            },
            {
                kind: "permission",
                label: "Access",
                items: ["Read behavioural events"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n4",
        label: "Qualified?",
        type: "decision",
        x: 960,
        y: 60,
        status: "live",
        summary:
            "Routes the lead based on score and required-field completeness. Yes goes to sales; No goes to nurture.",
        owner: "RevOps",
        sla: "Instant",
        reqs: [
            {
                kind: "rule",
                label: "Condition",
                items: ["score ≥ 70", "region is set"],
            },
            {
                kind: "rule",
                label: "Branches",
                items: ["Yes → Assign to rep", "No → Nurture"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n6",
        label: "Nurture sequence",
        type: "action",
        x: 960,
        y: 200,
        status: "live",
        summary:
            "Adds the lead to an automated email track and re-scores weekly until they qualify or unsubscribe.",
        owner: "Marketing",
        sla: "Weekly loop",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["Marketing automation", "Email platform"],
            },
            {
                kind: "rule",
                label: "Exit criteria",
                items: ["reply", "score increase", "unsubscribe"],
            },
            {
                kind: "data",
                label: "Tracks",
                items: ["Cold", "Re-engage", "Event follow-up"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n5",
        label: "Assign to rep",
        type: "action",
        x: 1260,
        y: 60,
        status: "live",
        summary:
            "Routes the qualified lead to an owner using territory and capacity rules, then notifies them.",
        owner: "Sales Ops",
        sla: "First touch < 1 business day",
        reqs: [
            {
                kind: "rule",
                label: "Routing",
                items: ["Territory", "Round-robin within team"],
            },
            {
                kind: "integration",
                label: "Notify",
                items: ["Slack DM", "Email"],
            },
            {
                kind: "owner",
                label: "Owner set to",
                items: ["Assigned AE"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n7",
        label: "Create opportunity",
        type: "action",
        x: 1560,
        y: 60,
        status: "live",
        summary:
            "Converts the qualified lead into a pipeline opportunity with the minimum required deal data.",
        owner: "Account Exec",
        sla: "On qualify",
        reqs: [
            {
                kind: "data",
                label: "Required",
                items: ["amount", "stage", "close date"],
            },
            {
                kind: "rule",
                label: "Mapping",
                items: ["Lead → Opportunity field map"],
            },
            {
                kind: "permission",
                label: "Access",
                items: ["Create opportunity"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n8",
        label: "Send proposal",
        type: "action",
        x: 1860,
        y: 60,
        status: "review",
        summary:
            "Generates a quote/proposal and sends it for signature. Discounts above threshold need approval first.",
        owner: "Account Exec",
        sla: "< 3 business days",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["CPQ", "DocuSign"],
            },
            {
                kind: "rule",
                label: "Approval",
                items: ["Discount > 15% → manager sign-off"],
            },
            {
                kind: "permission",
                label: "Access",
                items: ["Generate quote"],
            },
        ],
        treeId: "t1",
    },
    {
        id: "n9",
        label: "Closed",
        type: "end",
        x: 2160,
        y: 60,
        status: "live",
        summary:
            "Marks the opportunity won or lost. On win it hands off to onboarding; on loss it records a reason code.",
        owner: "Account Exec",
        sla: "At close",
        reqs: [
            {
                kind: "rule",
                label: "On win",
                items: ["Provisioning", "Onboarding handoff"],
            },
            {
                kind: "data",
                label: "On loss",
                items: ["reason code (required)"],
            },
            {
                kind: "owner",
                label: "Handoff to",
                items: ["CS / Onboarding"],
            },
        ],
        treeId: "t1",
    },
];

/* ---- Path 2: "Onboarding" (purple) — a separate instruction path ---- */
const onboardingNodes: FlowNode[] = [
    {
        id: "o1",
        label: "Won deal handoff",
        type: "trigger",
        x: 60,
        y: 360,
        status: "live",
        summary:
            "Receives the closed-won opportunity from sales and kicks off onboarding for the new customer.",
        owner: "CS Ops",
        sla: "On win",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["CRM opportunity", "CS platform"],
            },
            {
                kind: "data",
                label: "Required",
                items: ["plan", "start date", "points of contact"],
            },
        ],
        treeId: "t2",
    },
    {
        id: "o2",
        label: "Provision account",
        type: "action",
        x: 360,
        y: 360,
        status: "review",
        summary:
            "Creates the customer workspace, provisions seats and integrations, and verifies access.",
        owner: "Support",
        sla: "< 1 business day",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["Billing", "Identity provider"],
            },
            {
                kind: "permission",
                label: "Access",
                items: ["Create tenant"],
            },
        ],
        treeId: "t2",
    },
    {
        id: "o3",
        label: "Welcome & training",
        type: "action",
        x: 660,
        y: 360,
        status: "draft",
        summary:
            "Sends a welcome sequence and schedules onboarding/training sessions with the customer.",
        owner: "Customer Success",
        sla: "Week 1",
        reqs: [
            {
                kind: "integration",
                label: "Integrations",
                items: ["Email", "Calendar scheduling"],
            },
            {
                kind: "rule",
                label: "Cadence",
                items: ["Kickoff call", "2 training sessions"],
            },
        ],
        treeId: "t2",
    },
];

const sampleNodes: FlowNode[] = [...pipelineNodes, ...onboardingNodes];

/**
 * Connections between sample nodes. The main chain flows left -> right
 * (default anchors are right -> left); the No branch and re-score loop use
 * explicit sides.
 */
const sampleEdges: Edge[] = [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n3" },
    { from: "n3", to: "n4" },
    { from: "n4", to: "n5", label: "Yes" },
    { from: "n4", to: "n6", fromSide: "bottom", toSide: "top", label: "No" },
    {
        from: "n6",
        to: "n3",
        fromSide: "left",
        toSide: "bottom",
        label: "re-score",
        dashed: true,
    },
    { from: "n5", to: "n7" },
    { from: "n7", to: "n8" },
    { from: "n8", to: "n9" },
    { from: "o1", to: "o2" },
    { from: "o2", to: "o3" },
];

const sampleTrees: NodeTree[] = [
    { id: "t1", name: "Lead pipeline", color: "#5fb389" },
    { id: "t2", name: "Onboarding", color: "#a88be6" },
];

/** Builds and returns a fresh sample Flow (new flow/tree ids + shallow copies). */
export function createSampleFlow(): Flow {
    const t1 = uid();
    const t2 = uid();
    const idMap: Record<string, string> = { t1, t2 };
    return {
        id: uid(),
        name: "Lead to Close",
        trees: sampleTrees.map((t) => ({ ...t, id: idMap[t.id] ?? uid() })),
        nodes: sampleNodes.map((n) => ({
            ...n,
            id: n.id,
            treeId: idMap[n.treeId] ?? n.treeId,
        })),
        edges: sampleEdges.map((e) => ({ ...e })),
    };
}
