# Abisso — Product Thesis and Founding Charter

> **Source:** `Abisso_Product_Thesis_and_Founding_Charter_v1.0_FROZEN.docx`  
> **Version:** 1.0 — FROZEN  
> **Role:** Authoritative company and product strategy  
> **Repository note:** This is an agent-readable Markdown mirror of the authoritative DOCX. Do not silently change product decisions here. If a conversion discrepancy is discovered, the source DOCX takes precedence until deliberately reconciled.

---

**Founding baseline for a global product company**

A durable source of truth for what the company is building, why it should exist, what it must prove, and which decisions remain fixed until evidence changes them.

**OWNER** Founder

**VERSION** 1.0

**DATE** 15 September 2026

**SCOPE** Company and product strategy

**FOUNDING DECISION**

**Build the neutral operational layer that helps engineering teams see, understand, and control work across humans and AI coding agents.**

# How to use this charter

This document guides product strategy and protects focus. It is not a backlog or technical specification. The V0 PRD, system design, telemetry specification, work graph specification, and privacy and security specification should translate it into implementation without silently changing it.

A frozen decision changes only when customer or market evidence justifies a dated decision record. Implementation choices may change freely when they preserve the thesis.

# Contents

- Founding decision and executive summary

- Why now market shift and problem

- Product thesis definition users and jobs

- Initial wedge product loop and work graph

- Attention outcomes and product evolution

- Principles privacy competition and moat

- V0 and V1 boundaries and non goals

- Business assumptions and validation

- Metrics kill criteria and risks

- Decision rules and frozen charter

# Document purpose

This charter defines the company we intend to build, why it should exist, where it begins, and what evidence must earn the right to expand it. It is the durable source of truth for product decisions by a solo founder building a global software company. It is deliberately separate from a product requirements document, system design, event specification, work graph schema, security specification, and delivery plan.

The central decision is straightforward: build a vendor-neutral engineering agent control plane that helps teams **see, understand, and control engineering work across humans and AI coding agents**. Its underlying proprietary model is the **Live Engineering Work Graph**. Its first value is not reporting after the fact; it is helping a team recognize and resolve important problems while work is still in progress. Over time, the product evolves from **Observe** to **Understand** to **Optimize** to **Orchestrate**, but it earns each stage through trust and demonstrated value.

# 1 Founding decision

We will build the neutral operational layer for engineering teams that work with multiple AI coding agents.

The product will normalize activity from otherwise incompatible agents and delivery systems, relate that activity to people, tasks, code artifacts, verification, and outcomes, and surface the few situations that deserve human attention. It will be designed to become a safe control plane, but will begin as a trustworthy system of observation and understanding.

We are not building a coding agent, repository host, project tracker, virtual office, generic observability tool, or employee surveillance product. We will integrate with those categories where useful and own the cross-vendor relationships, state transitions, incident semantics, and outcome history between them.

The founding bet is that the live state of engineering work becomes a distinct and valuable layer as one engineer increasingly directs several agents across concurrent tasks. If that bet is not supported by real use, repeat engagement, and willingness to pay, we will narrow or change the thesis rather than protect it from evidence.

# 2 Executive summary

Software development is shifting from one person working through one primary editor toward people supervising multiple agents performing parallel, long-running work. The tools used to manage software were largely designed around human-authored activity that becomes legible at a commit, pull request, ticket update, or deployment. Agentic work creates consequential activity earlier: on local machines, inside sessions, across tools, and before a pull request exists.

This creates a growing coordination gap. A developer or team lead may know that several agents are running but not which task each run belongs to, whether it is progressing, whether two runs overlap, which decision is blocking them, what they have cost, or what accepted outcome resulted. Provider dashboards show their own slice. Repository and delivery systems show later artifacts. Engineering analytics explain history. None is guaranteed to maintain a neutral, live model of the whole workstream.

The Engineering Agent Control Plane closes that gap. Its customer-facing promise is to make mixed human-agent work legible and governable. Its proprietary foundation, the Live Engineering Work Graph, continuously relates actors, sessions, tasks, repositories, branches, files, tests, pull requests, reviews, CI, deployments, costs, interventions, and outcomes. Observations remain distinguishable from inferences, and inferred relationships carry provenance and confidence.

The initial wedge is “Needs Attention”: explainable, timely signals for repeated failure, silent waiting, overlapping work, escalating no-progress cost, CI loops, and review bottlenecks. A live view provides context, but intervention creates value. Historical linkage then answers a second budget-holder question: what did our agent investment produce?

The company will win only if it earns developer trust. Collection must be privacy-first and local by design. Customers should be able to understand and control what leaves a device. Raw source, prompts, terminal transcripts, secrets, keystrokes, screenshots, and idle-time surveillance are not default inputs. The product should use the minimum data required for the promised outcome.

The first product is intentionally narrow. It proves that a small number of high-value integrations can form a trustworthy live model, generate useful attention signals, and connect automated cost to accepted or rejected outcomes. It does not prematurely automate task routing, rank people, promise causal productivity measurement, or lock the company to a particular implementation technology.

# 3 Why now

Four forces make this the right moment.

**Agent parallelism is becoming normal.** A single engineer can start several tasks, leave them running, and return when they complete or need help. The management problem changes from operating one tool to supervising a portfolio of work.

**The agent stack is heterogeneous.** Teams select tools by developer preference, model capability, task type, security posture, and commercial terms. Even where one platform dominates, switching and multi-vendor use remain plausible. A neutral layer gains value from diversity rather than being weakened by it.

**Cost and risk move earlier in the lifecycle.** Agents can spend model, CI, and infrastructure resources, touch sensitive repositories, and create large review queues before a conventional management system records meaningful progress. Waiting for a pull request is too late for some interventions.

**Leadership needs evidence, not adoption counts.** Seats, tokens, sessions, and generated lines do not reveal whether work was accepted, reverted, abandoned, or burdened reviewers. Teams need an honest connection between activity, intervention, and outcomes without reducing engineering to a productivity score.

The timing is favorable but not guaranteed. Agent vendors, repository platforms, and engineering intelligence companies will expand. The opportunity exists because the cross-vendor operating model is hard, trust-sensitive, and not naturally owned by any single vendor—not because incumbents are incapable of adding dashboards.

# 4 Market shift

The former default was approximately one developer, one active editing context, and one primary task. The emerging default is one developer directing several agents, while a team runs dozens of concurrent workstreams across local and cloud environments.

That shift changes the coordination unit. The important object is no longer only the developer, repository, ticket, or agent session. It is the evolving unit of work connecting all of them. Teams need to know:

- what is happening now;

- which actions belong to the same intended outcome;

- where work is blocked, duplicative, risky, or wasteful;

- when a person must intervene;

- and what result, if any, the work ultimately produced.

The pre-pull-request interval is the initial market gap. It contains intent, attempts, failures, decisions, and costs that later artifacts compress or omit. The product begins there, then reconciles that live history with repository and delivery outcomes.

# 5 Problem

Engineering work performed by humans and agents is fragmented across local sessions, vendor services, repositories, issue trackers, CI, review systems, and informal communication. Each system observes events through its own vocabulary and identity model. Teams reconstruct the truth manually, often after a failure has already consumed time or budget.

The fragmentation produces recurring operational problems:

- agents repeat the same failed approach without meaningful progress;

- runs wait silently for input, permissions, or architectural decisions;

- multiple agents modify overlapping areas without knowing about each other;

- work is duplicated under different tasks or branches;

- agent output exceeds human review capacity;

- CI is repeatedly consumed without converging toward acceptance;

- cost accumulates without a traceable engineering outcome;

- managers see aggregate adoption but cannot explain value;

- developers experience oversight tools as surveillance rather than assistance.

These are not merely reporting defects. They are preventable losses of time, attention, money, and trust. The product must therefore make its primary contribution during work, not only after it.

# 6 Core product thesis

As engineering teams coordinate more concurrent AI-agent work, they will need a vendor-neutral control plane that maintains a shared, live understanding of work across agents, humans, and delivery systems.

The control plane creates value by converting heterogeneous events into a trustworthy operational model; detecting situations in which action can improve an outcome; preserving a transparent record of evidence and intervention; and connecting work to accepted, rejected, reverted, abandoned, or still-open results.

The category is **Engineering Agent Control Plane**. The customer promise is **see, understand, and control engineering work across humans and AI coding agents**. The underlying proprietary model is the **Live Engineering Work Graph**.

The graph is not the marketing promise and the dashboard is not the product. The graph is the model that makes the promise credible. The product is the decision and intervention loop enabled by that model.

# 7 Product definition

The Engineering Agent Control Plane is a software service, supported by privacy-preserving local collection, that provides:

1\. **A live operational view** of active and recent work, organized around tasks and outcomes rather than isolated vendor sessions.

2\. **Cross-agent normalization** that translates provider-specific telemetry into stable concepts without erasing provenance or uncertainty.

3\. **A Live Engineering Work Graph** that relates people, agents, sessions, artifacts, verification, cost, interventions, and outcomes over time.

4\. **Needs Attention intelligence** that detects explainable, actionable situations while intervention can still matter.

5\. **Outcome and ROI linkage** that distinguishes observed facts, estimates, allocations, and unknowns instead of inventing precision.

6\. **A governed path to control** through recommendations, approvals, policies, budgets, and eventually reversible orchestration.

It is a control plane because it becomes the place where teams understand state, focus attention, apply policy, and later authorize action across tools. It does not need to execute every underlying task itself.

# 8 Target users and buyer

## Primary users

**Agent-intensive developers** who run multiple coding agents and need to know which session is progressing, blocked, costly, or ready for review. The product must save them attention rather than demand constant monitoring.

**Technical leads and engineering managers** who coordinate work across a team and need an accurate picture of dependencies, bottlenecks, and interventions without evaluating effort through invasive activity metrics.

**Developer platform and AI enablement teams** that select tools, set policies, manage adoption, and need vendor-neutral evidence about reliability, cost, and outcomes.

## Initial buyer

The likely initial economic buyer is an engineering, platform, or AI-enablement leader at a software organization already using at least two agent products or running material concurrent agent work. The buyer feels operational pain before procurement-scale governance becomes the primary concern.

## Trust constituency

Developers are not merely end users. They are the decisive trust constituency because collection touches their work environment. A manager-only product that developers experience as surveillance will fail even if it produces attractive reports.

## Not the first customer

The first customer is not a team experimenting with one agent occasionally, an organization seeking employee monitoring, or an enterprise demanding complete governance across every provider before a pilot. These segments either lack acute pain or pull the product away from its wedge.

# 9 Jobs to be done

When I run several agents, help me see which workstreams are active, what they are trying to accomplish, and which one needs me now so I can supervise parallel work without repeatedly opening every session.

When my team uses different agents and tools, give us one honest operational picture so we can coordinate work without standardizing prematurely on one vendor.

When a run is stuck, repeating itself, overlapping with another run, or spending without progress, alert the right person with enough evidence to take a useful action.

When agent-produced work reaches review and delivery, connect its history and cost to the result so we can learn which workflows work without claiming that correlation proves productivity.

When we adopt more autonomy, let us establish explicit policies, approvals, budgets, and audit trails so control grows without sacrificing accountability.

# 10 Initial wedge

The initial wedge is the live operational interval between the start of an agent task and an accepted engineering outcome. The product should answer two questions better than existing workflows:

1\. **What needs attention now?**

2\. **What did this work produce?**

“Needs Attention” is the centerpiece because it converts visibility into action. A useful signal includes the observed evidence, the inferred condition, confidence, likely consequence, recommended response, responsible person, and resolution history. It must be suppressible and correctable. The system should learn from acknowledgement and dismissal without hiding its reasoning.

The first incident families are deliberately limited: repeated failure, silent human dependency, overlapping or duplicate work, escalating cost without evidence of progress, recurrent CI failure, and review congestion. Each must be detectable with metadata that customers can reasonably permit.

The live view supports this wedge by showing context. Outcome reconciliation completes the loop. Generic charts, exhaustive integration breadth, and visual novelty do not substitute for useful interventions.

# 11 Core product loop

The durable loop is:

**Observe → Relate → Detect → Intervene → Reconcile → Learn**

**Observe.** Capture the minimum approved metadata from agents and delivery systems, with local filtering and clear provenance.

**Relate.** Resolve which person, session, task, repository, branch, change, test, pull request, or deployment belongs to the same evolving workstream.

**Detect.** Identify a small number of explainable conditions in which attention may prevent delay, conflict, waste, or risk.

**Intervene.** Notify the right person and make an appropriate human action easy. Early versions recommend; later versions may execute only within explicit policy.

**Reconcile.** Record whether the work was accepted, rejected, reverted, abandoned, or remains unresolved, together with cost and intervention history.

**Learn.** Improve entity resolution, thresholds, workflow guidance, and eventually routing recommendations from accumulated outcomes while preserving tenant boundaries and customer control.

Every major feature should strengthen this loop. Features that create activity without improving it are suspect.

# 12 Live Engineering Work Graph

The Live Engineering Work Graph is a temporal, provenance-aware model of engineering work. It connects actors and tools to intent, execution, artifacts, verification, intervention, and outcomes. It is “live” because relationships and state change as work progresses, and “engineering” because its semantics reflect how software is planned, changed, verified, reviewed, and delivered.

The graph must preserve three distinctions.

**Facts and inferences.** A tool call, branch name, or pull-request merge is observed. “Making progress,” “duplicate work,” or “likely blocked” is inferred. The product must never present one as the other.

**Identity and role.** A person may direct several agents; an agent identity may span sessions; a task may be represented in several systems. Resolution should remain correctable and carry confidence.

**Activity and outcome.** High activity is not success. Outcomes should include accepted, rejected, reverted, abandoned, still open, or unknown, with relevant quality and delivery evidence.

The graph becomes proprietary through the quality of its normalized semantics, identity and task resolution, incident history, intervention outcomes, and longitudinal workflow knowledge. A detailed graph schema belongs in a later specification and is not frozen here.

# 13 Cross agent telemetry normalization

Agent vendors expose different events, identifiers, costs, states, and levels of detail. The control plane must translate these into a stable shared language while retaining the original source, timestamp, version, and confidence.

Normalization is not flattening. It must preserve vendor-specific richness when useful and explicitly mark missing or incomparable fields. A provider adapter should be replaceable without changing the product thesis. No single vendor’s lifecycle becomes the universal truth.

The shared model should be open enough to accept direct integrations, standard telemetry, local logs, repository signals, and customer-built adapters. Portability and export reduce customer fear of replacing one lock-in with another.

The detailed event vocabulary, versioning, and adapter contracts belong in a Canonical Agent Telemetry Specification. This charter freezes only the need for a provider-neutral semantic layer with provenance and graceful degradation.

# 14 Real time attention and incident prevention

The attention layer exists to improve decisions, not maximize alerts. It should detect conditions early enough to change the result and provide evidence a user can inspect quickly.

An attention item must answer:

- what was observed;

- what the system inferred;

- why the condition matters now;

- how confident the system is;

- what action is recommended;

- who can act;

- and what happened after action or dismissal.

Early detection should favor explainable rules and conservative thresholds. Personal and organizational baselines may improve relevance later, but opaque scores cannot become the foundation of trust. False-positive rate and alert burden are product metrics, not tuning details.

The product should distinguish informational state, a suggestion, an attention item, and an incident. Escalation should reflect evidence and consequence rather than visual drama. Intervention history is part of the graph and a basis for future optimization.

# 15 Outcome and ROI linkage

The product should help a customer understand what agent investment produced, but it must avoid false precision and simplistic productivity claims.

Costs may be observed directly, estimated from usage, allocated across work, or unknown. The interface and exported data must label those categories. Outcomes may include merged work, accepted changes, passing verification, deployment, reversion, abandonment, or unresolved status. No single outcome is sufficient for every team.

The useful unit is a cohort of comparable work, not a league table of people. Examples include task category by workflow, model, repository, or level of human intervention. Where the evidence is observational, the product describes association rather than causation.

The aim is to support questions such as: Which workflows repeatedly reach accepted outcomes? Where does review become the constraint? Which task types cause repeated intervention? Where is spend accumulating without convergence? What changed after a workflow or policy change?

# 16 Product evolution

## Observe

Create a trustworthy live view of sessions, workstreams, state, cost, and delivery context. Prove that the product saves users from manual reconstruction.

## Understand

Resolve relationships, detect attention conditions, explain why they matter, and connect work to outcomes. Prove that teams act on the product’s intelligence.

## Optimize

Use history to recommend better models, prompts, task decomposition, review capacity, budgets, and workflows. Prove that recommendations improve a measured outcome for defined cohorts.

## Orchestrate

Execute selected actions across tools under explicit policies, permissions, budgets, approvals, and rollback controls. Prove safety and value one action class at a time.

This sequence is a dependency, not a marketing roadmap. We do not earn orchestration merely by building connectors. We earn it through accurate state, trustworthy recommendations, demonstrated outcomes, and governance.

# 17 Product principles

1\. **Action over observation.** Prefer timely, resolvable attention items to passive dashboards.

2\. **Work over tool activity.** Organize around intended outcomes, not a feed of vendor events.

3\. **Trust before coverage.** Collect less, explain more, and earn expansion.

4\. **Facts before scores.** Keep evidence, inference, confidence, and uncertainty visible.

5\. **Outcomes over volume.** Tokens, sessions, and generated code are inputs, not success.

6\. **Teams over rankings.** Improve systems and workflows; do not score individual effort.

7\. **Neutrality by design.** Preserve provenance, portable semantics, export, and replaceable adapters.

8\. **Interoperability over captivity.** Help customers change agents without losing operational memory.

9\. **Progressive autonomy.** Recommend first; require explicit authority before acting.

10\. **Solo-founder focus.** Choose one sharp workflow and a small integration set over shallow breadth.

# 18 Privacy and trust philosophy

Trust is a product capability and a distribution requirement. A local collector operates near sensitive work, so the system must make restraint observable.

By default, the product should not collect raw source code, complete prompts, terminal transcripts, keystrokes, mouse activity, screenshots, clipboard contents, personal messages, secret values, environment variables, or idle-time measures. Where a future feature genuinely requires sensitive content, collection must be narrow, explicit, optional, documented, and separable by policy.

Filtering, redaction, exclusion, and buffering should occur before approved telemetry leaves a device or customer-controlled environment whenever practical. Developers should have a readable inspection view of what is collected and transmitted. Organizations should control repositories, paths, session privacy, retention, export, and deletion within a clear policy hierarchy.

Default analytics should focus on workstreams, tasks, repositories, workflows, and teams. Individual drill-down exists to resolve work, not rank people. Customers must be able to distinguish administrative access from legitimate product need.

Security, tenant isolation, retention, incident response, compliance, and deployment options require a separate specification. This charter freezes the principles of minimization, local control, transparency, consent-aware use, auditability, and no employee surveillance.

# 19 Competitive landscape and strategy

The company sits between five neighboring categories:

| **Category** | **Existing strength** | **Our strategic relationship** |
|----|----|----|
| Agent vendors and IDEs | Deepest control of their own runtime and user experience | Integrate; never depend on one vendor’s worldview |
| Repository and delivery platforms | System of record for code, review, CI, and deployment | Reconcile outcomes; focus on pre-PR and cross-vendor state |
| Engineering intelligence platforms | Historical delivery analytics and executive reporting | Differentiate on live work, intervention, and agent-native semantics |
| Agent observability platforms | Traces, tokens, tool calls, debugging, and cost | Focus on engineering work relationships and team operations |
| Multi-agent orchestrators and visual workspaces | Launching, steering, and presenting agent fleets | Remain runtime-neutral; make orchestration an earned later stage |

No competitor is assumed to lack a feature permanently. Large platforms can add live views, metrics, and integrations. We therefore compete on the compound quality of cross-vendor state, entity resolution, attention semantics, privacy posture, intervention workflow, and outcome history.

The strategy is to complement systems of record and agent runtimes, not replace them. The product must become more valuable as customers mix tools. It should be straightforward to adopt for one team, useful before enterprise rollout, and capable of expanding into governance without making governance the initial wedge.

The virtual or spatial office may become an optional interface if users value it, but it is neither the category nor the moat.

# 20 Defensibility and moat

Raw telemetry, cost totals, and session lists are replicable. The defensible asset is the accumulated operational understanding of engineering work:

- a stable cross-agent semantic model;

- high-quality identity, task, artifact, and outcome resolution;

- a longitudinal Live Engineering Work Graph;

- incident patterns with known precision, context, and resolution;

- intervention-to-outcome histories;

- workflow and task-category benchmarks that respect tenant boundaries;

- trusted collection and governance mechanisms;

- and policy-safe orchestration knowledge.

This moat compounds only if the product is used in the decision loop. Passive data accumulation is not enough. Each intervention and reconciled outcome can improve detection, recommendation, and workflow guidance. Customers also develop operational memory in the system, increasing value without relying on hostage-style lock-in because data remains exportable.

Distribution and credibility are part of defensibility. A transparent privacy posture, excellent developer experience, useful open adapter surfaces, and fast support for emerging tools can establish the neutral position before a dominant platform closes the gap.

# 21 V0 and V1 boundary

## V0 proves the thesis

V0 should connect a deliberately small set of high-value agent and delivery inputs; show active workstreams and their best-known state; resolve core relationships with visible confidence; detect a small number of actionable attention conditions; record intervention and resolution; and reconcile cost with basic engineering outcomes.

The founder should be able to deploy and support V0 for a handful of design partners. Product quality matters more than integration count. Manual reconciliation and careful customer support are acceptable where they accelerate learning, provided the customer is not misled about automation.

## V1 makes the loop repeatable

V1 should improve reliability, onboarding, team controls, alert tuning, historical analysis, and the quality of task and outcome linkage. It may add integrations selected by demonstrated demand, not by logo collection. It should make the product useful week after week without founder-operated interpretation.

V1 may recommend workflow changes. It should not broadly route, terminate, or modify agent work automatically. Any limited control action must have an explicit safety case, permission model, audit trail, and measurable user benefit.

## Boundary discipline

Exact providers, screens, event fields, service architecture, latency targets, and acceptance criteria belong in the V0 PRD and technical specifications. This charter freezes the proof required, not the implementation.

# 22 Explicit non goals

The initial company is not trying to:

- build a general-purpose coding agent or foundation model;

- replace GitHub, GitLab, issue trackers, CI, or developer communication tools;

- become a pixel office or avatar-first collaboration product;

- monitor keystrokes, screen time, presence, idle time, or subjective employee effort;

- rank developers or create individual productivity scores;

- collect raw source, prompts, transcripts, or secrets by default;

- support every agent, editor, repository, and tracker in the first release;

- promise exact causal ROI from observational engineering data;

- automate task routing, cancellation, code changes, or model selection before trust is earned;

- optimize for maximum telemetry volume;

- or lock the product thesis to a database, message bus, programming language, protocol, or cloud provider.

These are strategic exclusions. A future capability requires evidence that it strengthens the core loop without violating trust or focus.

# 23 Business and monetization hypothesis

The buyer will pay when the product saves scarce engineering attention, reduces avoidable agent and CI waste, shortens blocked time, limits conflicting work, protects review capacity, and provides defensible evidence about agent investment.

The initial model should be a team or platform subscription with clear included usage and predictable limits. Pricing may scale with active workstreams, connected environments, retained history, or organizational capabilities, but should not reward surveillance, individual scoring, or raw event ingestion.

An early paid pilot can combine software access with high-touch onboarding and evaluation. The purpose is to test willingness to pay for an operational outcome, not disguise consulting revenue as product-market fit.

Longer-term enterprise value may include policy, audit, private deployment, advanced retention, access controls, workflow recommendations, and governed orchestration. These are expansion paths, not prerequisites for proving the wedge.

# 24 Critical assumptions

1\. Teams will continue to use multiple coding-agent products or need portability across them.

2\. Concurrent agent work creates frequent, costly coordination failures that existing workflows do not handle well.

3\. Useful live state and incidents can be inferred from privacy-acceptable metadata.

4\. Session-to-task-to-outcome relationships can be resolved accurately enough to support decisions.

5\. Developers will install or approve local collection when its behavior is transparent and useful to them.

6\. Attention signals can achieve sufficient precision to avoid alert fatigue.

7\. Teams will repeatedly act on live intelligence rather than treat it as a novelty dashboard.

8\. A budget holder will pay for saved attention, reduced waste, or improved agent investment decisions.

9\. Provider and platform APIs will remain accessible enough for a neutral layer to operate.

10\. A solo founder can reach a convincing wedge before integration and enterprise demands overwhelm focus.

Each assumption should have an owner, test, evidence threshold, and review date in the validation plan. Confidence is earned through observed behavior and payment, not positive interview language alone.

# 25 Validation plan

## Phase 1 Problem evidence

Interview 15 to 20 teams already running concurrent agent work, preferably across more than one vendor. Collect recent, concrete incidents: what happened, how it was discovered, what it cost, who intervened, and how the team works around it today. Avoid asking whether the idea sounds useful.

Advance if at least half describe recurring pre-PR coordination or attention failures and several have built manual practices or internal tools. Narrow the segment if pain clusters strongly by team type, workflow, or deployment model.

## Phase 2 Concierge prototype

Offer a privacy-transparent, local-first prototype to a small number of design partners. Show active workstreams and only two or three attention signals. Reconcile outcomes manually where necessary and tell users where inference is uncertain.

Advance if users return without prompting, act on signals, and invite teammates or connect delivery outcomes. Record false positives, missed incidents, time saved, and privacy objections.

## Phase 3 Product pilot

Run three design partnerships and seek at least one paid pilot. Measure whether the operational loop repeats across several weeks and whether a buyer values the product independently of founder support.

Advance if the product becomes part of an existing operational habit, delivers repeated verified interventions, and produces credible outcome linkage. Do not expand connector breadth until the wedge is repeatable.

## Phase 4 Narrow scale test

Standardize onboarding, collection controls, alert tuning, and reporting for the segment with the strongest evidence. Test whether one founder can onboard customers without bespoke integration work consuming the company.

# 26 Success metrics

## North star

**Verified useful interventions per active team.** A verified useful intervention occurs when the system identifies a real, actionable condition; a user acts or deliberately dismisses it; and the resolution confirms saved delay, avoided waste, reduced risk, or a justified stop.

## Product value

- median time from condition onset to detection;

- median time from attention item to action;

- share of attention items judged actionable;

- recovered or deliberately stopped workstreams;

- avoidable agent or CI spend prevented;

- reduction in unresolved blocked time for comparable work;

- share of agent workstreams linked to a known outcome;

- and user-reported decisions changed by the product.

## Engagement and trust

- weekly active teams and active users by role;

- repeated use of the live and attention views;

- retention after the novelty period;

- percentage of developers who keep collection enabled;

- privacy exclusions, uninstall reasons, and trust-related objections;

- attention dismissal and suppression rates;

- and invitations or team expansion initiated by users.

## Business

- design partner conversion to paid pilot;

- pilot renewal or expansion;

- time and founder effort required to onboard a team;

- willingness to pay relative to measured value;

- and gross margin after telemetry and support costs.

Metrics should be segmented by customer and workflow. Aggregates must not hide one successful design partner among several failures.

# 27 Kill and pivot criteria

The founder should question or stop the current thesis if, after meaningful tests with the target segment:

- teams rarely experience material coordination pain from concurrent agents;

- the live view is opened for novelty but not used repeatedly;

- attention signals do not produce meaningful action or cannot avoid alert fatigue;

- privacy-acceptable metadata is insufficient for useful inference;

- developers reject local collection even with transparent controls and direct benefit;

- session-to-task-to-outcome linkage remains too unreliable for trusted decisions;

- repository or agent-provider products solve the problem adequately for the target segment;

- buyers value only retrospective cost reporting and not live operations;

- paid demand requires a breadth of integrations or enterprise features a solo founder cannot sustain;

- or customers primarily seek employee monitoring.

A pivot should follow the strongest evidence. Plausible narrower directions include developer-local multi-agent supervision, a privacy-first telemetry protocol, attention intelligence for one agent ecosystem, or outcome reconciliation for one high-value workflow. A pivot is not permission to retain the same product under new language.

# 28 Major risks and mitigations

| **Risk** | **Consequence** | **Founding mitigation** |
|----|----|----|
| Platform bundling | A repository or agent vendor ships overlapping controls | Win on neutrality, cross-vendor history, fast adapters, and intervention quality |
| Fragile integrations | Provider changes break state or cost accuracy | Version adapters, retain provenance, degrade visibly, and prioritize few integrations |
| Surveillance perception | Developers resist adoption or disable collection | Local minimization, readable inspection, explicit exclusions, and team-level defaults |
| False positives | Alerts are ignored and trust collapses | Conservative rules, evidence, confidence, suppression, and measured precision |
| Weak outcome linkage | ROI claims become misleading | Label observed, estimated, allocated, and unknown; support correction and audit |
| Causal overclaiming | Product loses credibility or drives harmful decisions | Report associations and cohorts; never equate activity with productivity |
| Data security failure | Severe customer harm and existential reputational damage | Minimize collection, isolate tenants, limit retention, and design security as product scope |
| Integration breadth trap | Solo founder becomes a connector maintenance service | Expand only from repeated paid demand; publish adapter surfaces where useful |
| Orchestration harm | Automated action damages work or exceeds authority | Recommend first; require policy, permission, audit, budgets, and reversibility |
| Insufficient urgency | The problem is interesting but not budget-worthy | Measure incidents in time and money; seek paid pilots early |
| Long enterprise cycles | Feedback arrives too slowly for a solo company | Start with empowered teams and self-serve or team-led adoption |
| Model commoditization | Basic detection becomes easy to copy | Compound proprietary context, resolved graph history, and workflow outcomes |

Risks are reviewed through evidence, not optimism. A mitigation that cannot be tested is an intention, not a control.

# 29 Decision rules for future features

A proposed feature should proceed only if it passes most of these tests:

1\. Does it strengthen Observe, Relate, Detect, Intervene, Reconcile, or Learn?

2\. Does it solve a repeated problem observed in the target segment?

3\. Does it improve a defined user decision or outcome?

4\. Can its value be measured without inventing productivity precision?

5\. Can it work with the minimum necessary data and preserve local control?

6\. Does it reinforce vendor neutrality or create a justified, reversible exception?

7\. Can a solo founder build, support, and maintain it without weakening the wedge?

8\. Is it demanded strongly enough to displace existing work?

9\. If it takes action, are authority, audit, limits, failure behavior, and reversal explicit?

10\. Does it make the proprietary work model or intervention loop better rather than merely add surface area?

Features should be rejected or deferred when they primarily increase visual novelty, telemetry volume, logo count, managerial surveillance, or implementation complexity.

Any change to a frozen decision requires a short decision record stating the new evidence, the old decision, the proposed replacement, the scope removed to make room, and the effect on validation.

# 30 Frozen founding charter

The following decisions are frozen at v1.0. They may change only through a dated decision record based on customer or market evidence.

1\. **Category.** We are building an Engineering Agent Control Plane.

2\. **Promise.** The product helps teams see, understand, and control engineering work across humans and AI coding agents.

3\. **Core model.** The Live Engineering Work Graph is the underlying proprietary model, not the customer-facing category.

4\. **Neutrality.** The company is vendor-neutral and owns cross-vendor relationships, state, incidents, intervention, and outcome semantics.

5\. **Wedge.** The first operational wedge is Needs Attention during the pre-outcome workstream, supported by a live view and outcome reconciliation.

6\. **Value.** Success means teams intervene sooner, prevent or shorten avoidable delay and waste, and understand what agent investment produced.

7\. **Trust.** Collection is minimal, transparent, and locally controlled; raw source, prompts, transcripts, secrets, surveillance signals, and individual productivity ranking are excluded by default.

8\. **Truthfulness.** Facts, inferences, estimates, allocations, confidence, and unknowns remain distinguishable.

9\. **Scope.** V0 uses a small number of high-value integrations and incident types to prove the core loop before expanding.

10\. **Autonomy.** The product evolves through Observe, Understand, Optimize, and Orchestrate. Control actions are earned progressively and governed explicitly.

11\. **Implementation freedom.** This charter does not freeze languages, databases, protocols, infrastructure providers, or detailed schemas.

12\. **Founder discipline.** As a solo founder, we choose evidence and depth over breadth, paid use over compliments, and a repeatable wedge over custom integration work.

## Final product statement

Abisso is a vendor-neutral engineering agent control plane that makes mixed human-agent engineering work legible and governable. It converts fragmented activity into a live, privacy-respecting work graph; identifies preventable failures while action can still matter; connects agent investment to honest engineering outcomes; and creates the evidence base for safe, policy-bound orchestration. The product succeeds when teams make better interventions and decisions—not when it displays more activity.

## Change control

This charter should be reviewed when material customer evidence contradicts a frozen decision, when the target user or buyer changes, when the wedge fails its validation threshold, or before the company enters a new stage of autonomy. Editorial improvements do not require a version change. Strategic changes do.

For every strategic amendment, record the date, evidence, decision changed, replacement decision, expected consequence, and next validation test. The founder is the decision owner until governance is deliberately expanded.
